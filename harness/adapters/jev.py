"""Jev adapter — two backends behind one interface.

* `openrouter` (default): raw HTTPS with httpx to OpenRouter's Decisions API.
  Endpoint, slug and response shape confirmed by the WP0 probe (PREFLIGHT.md, fixtures in
  tests/fixtures/jev_probe_2026-09-22/):

      POST https://openrouter.ai/api/alpha/decisions
      Authorization: Bearer $OPENROUTER_API_KEY
      {"model": "typesafe/jev-1.13", "state": ..., "questions": {...}}

  -> {"model": "typesafe/jev-1.13-20260917", "answers": {...},
      "usage": {"input_tokens": n, "output_tokens": n, "cost": usd}, "id": ..., "provider": ...}

* `direct`: TypeSafeClient().system_one on api.typesafe.ai, model "jev-1.13.0". The direct
  key is waitlisted (PLAN.md §12), so this path is only taken when TYPESAFE_API_KEY is set
  and typesafe-sdk is installed; it is imported lazily and is not in requirements.txt.

Two facts from WP0 that the adapter encodes:
  - The served id is a permaslug (`typesafe/jev-1.13-20260917`), so the served-model
    assertion is a prefix match on the requested slug, not equality.
  - Cost comes from the response's own `usage.cost`. OpenRouter's /generation and /credits
    endpoints lag about 25 s, so they are never polled per row.
"""

from __future__ import annotations

import os
import time
from typing import Any, Optional

import httpx

from harness.adapters.base import Outcome
from harness.schemas import JEV_INPUT_PER_MTOK, System

#: WP0-confirmed endpoint. PLAN.md §12 keeps Cloudflare / AI-ML API as alternates.
OPENROUTER_DECISIONS_URL = os.environ.get(
    "OPENROUTER_DECISIONS_URL", "https://openrouter.ai/api/alpha/decisions"
)
#: OpenRouter's community docs for the TypeSafe SDK give this path instead. Both were seen
#: in public sources; WP0 verified the alpha path above with a live 200. Kept here so a
#: future 404 has an obvious second thing to try.
OPENROUTER_FALLBACK_URL = "https://openrouter.ai/api/v1/systemone"

TYPESAFE_DIRECT_URL = "https://api.typesafe.ai/v1/systemone"
TYPESAFE_DIRECT_MODEL = "jev-1.13.0"


class JevAdapter:
    def __init__(
        self,
        system: System,
        *,
        questions: dict[str, dict[str, Any]],
        state_fn,
        backend: Optional[str] = None,
        api_key: Optional[str] = None,
        timeout_s: Optional[float] = None,
        client: Optional[httpx.AsyncClient] = None,
        url: Optional[str] = None,
    ) -> None:
        if system.kind != "jev":
            raise ValueError(f"{system.id} is not a Jev system")
        self.system = system
        self.questions = questions
        self.state_fn = state_fn
        self.timeout_s = timeout_s or system.timeout_s
        self.backend = backend or os.environ.get("JEV_BACKEND") or (
            "direct" if os.environ.get("TYPESAFE_API_KEY") else "openrouter"
        )
        self.url = url or (
            TYPESAFE_DIRECT_URL if self.backend == "direct" else OPENROUTER_DECISIONS_URL
        )
        if self.backend == "direct":
            self.model = TYPESAFE_DIRECT_MODEL
            self.api_key = api_key or os.environ.get("TYPESAFE_API_KEY")
        else:
            self.model = system.model
            self.api_key = api_key or os.environ.get("OPENROUTER_API_KEY")
        self._client = client
        self._owns_client = client is None

    # -- plumbing ----------------------------------------------------------------------

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=self.timeout_s)
        return self._client

    async def aclose(self) -> None:
        if self._client is not None and self._owns_client:
            await self._client.aclose()
            self._client = None

    def meta(self) -> dict[str, Any]:
        return {
            "kind": "jev",
            "backend": self.backend,
            "url": self.url,
            "model": self.model,
            "questions": self.questions,
            "has_key": bool(self.api_key),
        }

    def body(self, task: str, case: Any) -> dict[str, Any]:
        return {
            "model": self.model,
            "state": self.state_fn(task, case),
            "questions": self.questions,
        }

    # -- the call ----------------------------------------------------------------------

    async def call(self, task: str, case: Any) -> Outcome:
        if not self.api_key:
            var = "TYPESAFE_API_KEY" if self.backend == "direct" else "OPENROUTER_API_KEY"
            return Outcome.failure("transport_error", f"{var} is not set")
        payload = self.body(task, case)
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        t0 = time.perf_counter()
        try:
            resp = await self._get_client().post(
                self.url, json=payload, headers=headers, timeout=self.timeout_s
            )
        except httpx.TimeoutException as exc:
            return Outcome.failure("timeout", f"{exc!r}", retryable=True)
        except httpx.HTTPError as exc:
            return Outcome.failure("transport_error", f"{exc!r}", retryable=True)
        latency_ms = (time.perf_counter() - t0) * 1000.0
        return self.parse_response(
            task,
            resp.status_code,
            resp.text,
            latency_ms=latency_ms,
            request_body=payload,
            headers=dict(resp.headers),
        )

    # -- parsing (pure; unit-tested against the WP0 fixtures) --------------------------

    def parse_response(
        self,
        task: str,
        status_code: int,
        text: str,
        *,
        latency_ms: Optional[float] = None,
        request_body: Optional[dict[str, Any]] = None,
        headers: Optional[dict[str, str]] = None,
    ) -> Outcome:
        import json as _json

        try:
            body = _json.loads(text)
        except ValueError as exc:
            return Outcome.failure(
                "non_json_stdout",
                f"HTTP {status_code}: body is not JSON ({exc})",
                stdout=text[:4000],
                retryable=status_code >= 500,
            )
        if status_code == 429:
            return Outcome.failure(
                "api_error",
                f"HTTP 429: {text[:300]}",
                retryable=True,
                raw=body,
                pause_until_epoch=None,
            )
        if status_code >= 400 or "error" in body:
            err = (body.get("error") or {}) if isinstance(body, dict) else {}
            msg = err.get("message") if isinstance(err, dict) else None
            return Outcome.failure(
                "api_error",
                f"HTTP {status_code}: {msg or text[:300]}",
                retryable=status_code >= 500,
                raw=body if isinstance(body, dict) else {},
            )

        served = body.get("model")
        if not isinstance(served, str) or not self._served_ok(served):
            return Outcome.failure(
                "served_model_mismatch",
                f"served {served!r} does not match requested {self.model!r}",
                raw=body,
            )

        answers = body.get("answers")
        if not isinstance(answers, dict) or not answers:
            return Outcome.failure("missing_structured_output", "no answers object", raw=body)

        decision, p, top3, err_msg = extract_decision(task, answers)
        if err_msg:
            return Outcome.failure("schema_invalid", err_msg, raw=body)

        usage = body.get("usage") or {}
        in_tok = int(usage.get("input_tokens") or 0)
        cost = usage.get("cost")
        cost = float(cost) if isinstance(cost, (int, float)) else in_tok * JEV_INPUT_PER_MTOK / 1e6

        raw = dict(body)
        raw["_harness"] = {
            "backend": self.backend,
            "url": self.url,
            "requested_model": self.model,
            "request_body": request_body,
            "response_headers": headers or {},
            "http_status": status_code,
        }
        return Outcome(
            ok=True,
            status="ok",
            decision=decision,
            p=p,
            top3=top3,
            served_model=served,
            stop_reason=None,
            is_error=False,
            usage={
                "input_tokens": in_tok,
                "output_tokens": int(usage.get("output_tokens") or 0),
                "cache_read_input_tokens": 0,
                "cache_creation_input_tokens": 0,
                "thinking_tokens": 0,
            },
            cost_usd_list=cost,
            cost_usd_reported=cost,
            latency_ms=latency_ms,
            duration_ms=latency_ms,
            raw=raw,
        )

    def _served_ok(self, served: str) -> bool:
        requested = self.model.lstrip("~")
        if requested.endswith("jev-latest"):
            # The alias may resolve to any pinned build; the smoke records which one.
            return served.startswith("typesafe/jev-")
        return served.startswith(requested)


def extract_decision(
    task: str, answers: dict[str, Any]
) -> tuple[Optional[str], Optional[float], Optional[list[str]], Optional[str]]:
    """PLAN.md §3 / §4: the primary decision and the probability it is scored on."""
    if task == "task1":
        a = answers.get("skill")
        if not isinstance(a, dict) or "choice" not in a:
            return None, None, None, f"answers.skill missing a choice: {answers!r}"
        probs = a.get("probabilities") or {}
        top3 = None
        if isinstance(probs, dict) and probs:
            top3 = [k for k, _ in sorted(probs.items(), key=lambda kv: -float(kv[1]))][:3]
        conf = a.get("confidence")
        conf = float(conf) if isinstance(conf, (int, float)) else None
        return str(a["choice"]), conf, top3, None
    if task == "task2":
        a = answers.get("injection")
        if not isinstance(a, dict) or not isinstance(a.get("noul"), (int, float)):
            return None, None, None, f"answers.injection missing a noul: {answers!r}"
        noul = float(a["noul"])
        # PLAN.md §4: primary decision = injection.noul >= 0.5; §7 fits a tuned threshold
        # on the train split afterwards, from the recorded p.
        return ("injection" if noul >= 0.5 else "benign"), noul, None, None
    return None, None, None, f"unknown task {task!r}"
