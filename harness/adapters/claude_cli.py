"""Claude adapter — a subprocess wrapper around the `claude` CLI.

There is no Anthropic API key in this project. Every Claude call is one `claude -p`
process under Justin's Claude Code subscription, with the frozen flag set of PLAN.md §6.
The flag set lives in exactly one place (`FLAG_TEMPLATE`) and its sha256
(`flag_set_hash()`) goes into run_meta.json so a run can be tied to the flags it used.

Two deviations from the letter of PLAN.md §6, both forced by observed CLI behaviour and
both flagged for Justin rather than silently applied:

1. **Served-model assertion.** PLAN.md §2 says `modelUsage` must have *exactly one key*.
   It does not. With the frozen flag set the CLI reports a second entry for an internal
   helper call: the WP1 probe fixture `haiku-v2-strip+clean-env.json` has both
   `claude-haiku-4-5-20251001` and `claude-haiku-4-5`, and WP2 independently observed a
   `claude-haiku-4-5-20251001` helper entry on a `claude-opus-5` request. Enforced
   literally, every row would fail as `served_model_mismatch`. The rule implemented here:
   *exactly one* `modelUsage` entry must match the requested id (by key prefix or by
   `canonicalModel`); that entry is the served model and the source of the scored usage.
   Any other entry is recorded separately as `aux_model_usage` in `raw` and its tokens are
   reported but never attributed to the system under test. `--strict-served-model` on
   run.py restores PLAN.md's literal one-key rule.

2. **stdin.** The CLI waits 3 s for stdin and warns when none arrives (visible in every
   probe fixture's stderr). The subprocess gets stdin=DEVNULL. This changes no flag and no
   model behaviour; it removes 3 s per call.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import shutil
import subprocess
import time
from typing import Any, Optional

from harness.adapters.base import Outcome
from harness.schemas import System, claude_cost_usd, stable_hash

CLAUDE_BIN = os.environ.get("CLAUDE_BIN", "claude")

#: The frozen flag set — PLAN.md §6. Placeholders are substituted in build_argv().
#: Positional prompt stays immediately after -p: `--tools` is variadic, so a positional
#: argument placed after it would be swallowed into the tool list.
FLAG_TEMPLATE: tuple[str, ...] = (
    "-p",
    "{prompt}",
    "--model",
    "{model}",
    "--effort",
    "{effort}",
    "--system-prompt",
    "{system_prompt}",
    "--json-schema",
    "{json_schema}",
    "--output-format",
    "json",
    "--tools",
    "",
    "--no-session-persistence",
    "--setting-sources",
    "",
    "--strict-mcp-config",
    "--mcp-config",
    '{"mcpServers":{}}',
    "--disable-slash-commands",
    "--no-chrome",
)

#: The subprocess environment, PLAN.md §6: reduced to these names so the run does not
#: inherit the parent Claude Code session's variables.
ENV_PASSTHROUGH = ("PATH", "HOME", "USER", "TERM", "LANG")


def flag_set_hash() -> str:
    """sha256 of the frozen flag set; recorded in run_meta.json."""
    return stable_hash(list(FLAG_TEMPLATE))


def build_argv(
    *, prompt: str, model: str, effort: str, system_prompt: str, json_schema: dict[str, Any]
) -> list[str]:
    subs = {
        "{prompt}": prompt,
        "{model}": model,
        "{effort}": effort,
        "{system_prompt}": system_prompt,
        "{json_schema}": json.dumps(json_schema, sort_keys=True, separators=(",", ":")),
    }
    return [CLAUDE_BIN] + [subs.get(tok, tok) for tok in FLAG_TEMPLATE]


def build_env(extra: Optional[dict[str, str]] = None) -> dict[str, str]:
    env = {k: os.environ[k] for k in ENV_PASSTHROUGH if k in os.environ}
    env.setdefault("PATH", "/usr/local/bin:/usr/bin:/bin")
    if extra:
        env.update(extra)
    return env


def claude_version() -> Optional[str]:
    exe = shutil.which(CLAUDE_BIN) or CLAUDE_BIN
    try:
        out = subprocess.run(
            [exe, "--version"], capture_output=True, text=True, timeout=30, env=build_env()
        ).stdout.strip()
    except Exception:
        return None
    m = re.search(r"\d+\.\d+\.\d+", out)
    return m.group(0) if m else (out or None)


# --------------------------------------------------------------------------------------
# Result parsing
# --------------------------------------------------------------------------------------

#: A usage-limit / rate-limit response is not an error to retry: the whole run pauses.
_LIMIT_PATTERNS = (
    re.compile(r"usage limit reached", re.I),
    re.compile(r"rate limit", re.I),
    re.compile(r"\bquota\b.*\bexceeded\b", re.I),
    re.compile(r"weekly limit", re.I),
    re.compile(r"limit will reset", re.I),
)

#: Conservative refusal wording, used only when there is no structured_output and the CLI
#: did not report an error. stop_reason == "refusal" is the primary signal.
_REFUSAL_PATTERNS = (
    re.compile(r"\bI (?:can(?:'|’)?t|cannot|won(?:'|’)?t|am unable to)\b.{0,40}\b(?:help|assist|comply|do that|provide)", re.I),
    re.compile(r"\bI(?:'|’)m (?:not able|unable) to\b", re.I),
    re.compile(r"\bI must decline\b", re.I),
    # Observed 2026-09-22 on Haiku 4.5: the model declines to emit structured output at
    # all rather than classifying. That is a refusal, not a harness failure.
    re.compile(r"\bI (?:won(?:\'|\u2019)?t|will not|am not|(?:\'|\u2019)m not) (?:going to )?(?:call|use|invoke)\b.{0,30}\btool\b", re.I),
    re.compile(r"\bI(?:\'|\u2019)m not calling the\b", re.I),
)

_EPOCH_RE = re.compile(r"\|(\d{9,13})\b")
_ISO_RE = re.compile(r"(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?)")
_CLOCK_RE = re.compile(r"reset[s]?\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?", re.I)

#: Fallback pause when the message says the window is exhausted but not when it resets.
DEFAULT_PAUSE_S = 3600.0


def is_usage_limit(result: dict[str, Any]) -> bool:
    if result.get("api_error_status") == 429:
        return True
    if not result.get("is_error"):
        return False
    text = str(result.get("result") or "")
    return any(p.search(text) for p in _LIMIT_PATTERNS)


def parse_reset_epoch(message: str, now: Optional[float] = None) -> float:
    """Best-effort reset time carried in a usage-limit message."""
    now = time.time() if now is None else now
    m = _EPOCH_RE.search(message)
    if m:
        v = float(m.group(1))
        if v > 1e11:  # milliseconds
            v /= 1000.0
        if v > now:
            return v
    m = _ISO_RE.search(message)
    if m:
        try:
            from datetime import datetime

            v = datetime.fromisoformat(m.group(1).replace(" ", "T")).timestamp()
            if v > now:
                return v
        except ValueError:
            pass
    m = _CLOCK_RE.search(message)
    if m:
        from datetime import datetime, timedelta

        hour = int(m.group(1)) % 12
        if (m.group(3) or "").lower() == "pm":
            hour += 12
        minute = int(m.group(2) or 0)
        base = datetime.fromtimestamp(now)
        target = base.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if target.timestamp() <= now:
            target += timedelta(days=1)
        return target.timestamp()
    return now + DEFAULT_PAUSE_S


def split_stdout(text: str) -> str:
    """The probe fixtures store `<json>\\n\\n---stderr---\\n<stderr>`; take the JSON."""
    return text.split("\n\n---stderr---", 1)[0].strip()


def select_model_usage(
    model_usage: dict[str, Any], requested_model: str, *, strict: bool = False
) -> tuple[Optional[str], Optional[dict[str, Any]], dict[str, Any], Optional[str]]:
    """Pick the entry for the system under test.

    Returns (served_model, primary_entry, aux_entries, error) — `error` is a message when
    the served-model assertion fails.
    """
    if not isinstance(model_usage, dict) or not model_usage:
        return None, None, {}, f"modelUsage empty; requested {requested_model!r}"
    if strict and len(model_usage) != 1:
        return None, None, {}, (
            f"strict mode: modelUsage has {len(model_usage)} keys "
            f"{sorted(model_usage)}; requested {requested_model!r}"
        )
    primary = {
        k: v
        for k, v in model_usage.items()
        if k.startswith(requested_model) or (v or {}).get("canonicalModel") == requested_model
    }
    aux = {k: v for k, v in model_usage.items() if k not in primary}
    if not primary:
        return None, None, aux, (
            f"no modelUsage key matches requested {requested_model!r}; got {sorted(model_usage)}"
        )
    if len(primary) > 1:
        # Prefer the exact key, else the entry that did the work (most input tokens).
        if requested_model in primary:
            key = requested_model
        else:
            key = max(primary, key=lambda k: int((primary[k] or {}).get("inputTokens") or 0))
        aux = {**aux, **{k: v for k, v in primary.items() if k != key}}
        primary = {key: primary[key]}
    key, entry = next(iter(primary.items()))
    served = (entry or {}).get("canonicalModel") or key
    return served, entry, aux, None


def parse_result(
    stdout: str,
    *,
    task: str,
    requested_model: str,
    strict_served_model: bool = False,
    stderr: str = "",
) -> Outcome:
    """Turn one `claude -p --output-format json` stdout into an Outcome.

    Written against the saved probe JSONs in
    tests/fixtures/claude_cli_probe_2026-09-22/ (PREFLIGHT.md).
    """
    body = split_stdout(stdout)
    if not body:
        return Outcome.failure("non_json_stdout", "empty stdout", stdout=stdout, stderr=stderr)
    try:
        result = json.loads(body)
    except json.JSONDecodeError as exc:
        return Outcome.failure(
            "non_json_stdout", f"stdout is not JSON: {exc}", stdout=stdout[:8000], stderr=stderr,
            retryable=True,
        )
    if not isinstance(result, dict):
        return Outcome.failure(
            "non_json_stdout", f"stdout JSON is {type(result).__name__}, not an object",
            stdout=stdout[:8000], stderr=stderr,
        )

    text = str(result.get("result") or "")

    # --- usage limit: pause the run, do not retry and do not count an attempt ---------
    if is_usage_limit(result):
        return Outcome.failure(
            "usage_limit",
            text or "usage limit",
            retryable=True,
            raw=result,
            stderr=stderr,
            pause_until_epoch=parse_reset_epoch(text),
        )

    if result.get("is_error"):
        status_code = result.get("api_error_status")
        retryable = status_code is None or int(status_code) >= 500 or int(status_code) == 408
        return Outcome.failure(
            "api_error",
            f"is_error (api_error_status={status_code}): {text[:500]}",
            retryable=retryable,
            raw=result,
            stderr=stderr,
        )

    served, entry, aux, model_err = select_model_usage(
        result.get("modelUsage") or {}, requested_model, strict=strict_served_model
    )
    if model_err:
        return Outcome.failure("served_model_mismatch", model_err, raw=result, stderr=stderr)

    usage_block = result.get("usage") or {}
    entry = entry or {}
    usage = {
        "input_tokens": int(entry.get("inputTokens") or 0),
        "output_tokens": int(entry.get("outputTokens") or 0),
        "cache_read_input_tokens": int(entry.get("cacheReadInputTokens") or 0),
        "cache_creation_input_tokens": int(entry.get("cacheCreationInputTokens") or 0),
        "thinking_tokens": int(entry.get("thinkingTokens") or 0),
        # WP3 measured, over ~100 real calls with the frozen flag set, that the CLI makes
        # a fixed ~950-in / ~16-out Haiku side call of its own on every request. Its tokens
        # are recorded here, never folded into the system under test's usage, and its list
        # cost is reported separately — total_cost_usd includes it, our cost_usd_list does
        # not, which is ~6% of an Opus row and ~25% of a Haiku row.
        "aux_input_tokens": sum(int((v or {}).get("inputTokens") or 0) for v in aux.values()),
        "aux_output_tokens": sum(int((v or {}).get("outputTokens") or 0) for v in aux.values()),
        "overhead_tokens": sum(
            int((v or {}).get("inputTokens") or 0) + int((v or {}).get("outputTokens") or 0)
            for v in aux.values()
        ),
    }
    cost_list = claude_cost_usd(entry, (usage_block.get("cache_creation") or {}))
    overhead_cost = sum(
        (claude_cost_usd(v or {}, {}) or 0.0) for v in aux.values()
    ) if aux else 0.0
    usage["overhead_cost_usd_list"] = overhead_cost

    raw = dict(result)
    raw["_harness"] = {
        "requested_model": requested_model,
        "model_usage_keys": sorted((result.get("modelUsage") or {}).keys()),
        "aux_model_usage": aux,
        "stderr": stderr[:4000],
        "flag_set_sha256": flag_set_hash(),
    }

    common = dict(
        served_model=served,
        stop_reason=result.get("stop_reason"),
        is_error=bool(result.get("is_error")),
        usage=usage,
        cost_usd_list=cost_list,
        cost_usd_reported=result.get("total_cost_usd"),
        latency_ms=result.get("duration_api_ms"),
        duration_ms=result.get("duration_ms"),
        raw=raw,
    )

    stop_reason = result.get("stop_reason")
    structured = result.get("structured_output")

    # --- truncation: recorded, never scored wrong (PLAN.md §2) ------------------------
    if stop_reason == "max_tokens":
        return Outcome(ok=True, status="truncated", **common)

    # --- refusal: a graded outcome, never an error and never a fallback ---------------
    if stop_reason == "refusal":
        raw["_harness"]["refusal_detected_by"] = "stop_reason"
        return Outcome(ok=True, status="refusal", **common)

    if structured is None:
        if text and any(p.search(text) for p in _REFUSAL_PATTERNS):
            raw["_harness"]["refusal_detected_by"] = "result_text"
            return Outcome(ok=True, status="refusal", **common)
        return Outcome.failure(
            "missing_structured_output",
            f"no structured_output; stop_reason={stop_reason!r}; result={text[:300]!r}",
            raw=result,
            stdout=stdout[:8000],
            stderr=stderr,
        )

    decision, p, top3, schema_err = extract_decision(task, structured)
    if schema_err:
        return Outcome.failure(
            "schema_invalid", schema_err, raw=result, stdout=stdout[:8000], stderr=stderr
        )
    return Outcome(ok=True, status="ok", decision=decision, p=p, top3=top3, **common)


def extract_decision(
    task: str, structured: Any
) -> tuple[Optional[str], Optional[float], Optional[list[str]], Optional[str]]:
    """Pull (decision, p, top3) out of a structured_output object."""
    if not isinstance(structured, dict):
        return None, None, None, f"structured_output is {type(structured).__name__}, not an object"
    if task == "task1":
        top3 = structured.get("top3")
        if not isinstance(top3, list) or not top3 or not all(isinstance(x, str) for x in top3):
            return None, None, None, f"top3 missing or malformed: {structured!r}"
        conf = structured.get("confidence")
        conf = float(conf) if isinstance(conf, (int, float)) else None
        return top3[0], conf, [str(x) for x in top3], None
    if task == "task2":
        verdict = structured.get("verdict")
        if verdict not in ("injection", "benign"):
            return None, None, None, f"verdict missing or not in enum: {structured!r}"
        p = structured.get("p_injection")
        p = float(p) if isinstance(p, (int, float)) else None
        return verdict, p, None, None
    return None, None, None, f"unknown task {task!r}"


# --------------------------------------------------------------------------------------
# Adapter
# --------------------------------------------------------------------------------------


class ClaudeCLIAdapter:
    """One `claude -p` process per call."""

    def __init__(
        self,
        system: System,
        *,
        system_prompts: dict[str, str],
        schemas: dict[str, Any],
        strict_served_model: bool = False,
        timeout_s: Optional[float] = None,
    ) -> None:
        if system.kind != "claude":
            raise ValueError(f"{system.id} is not a Claude system")
        self.system = system
        self.system_prompts = system_prompts
        self.schemas = schemas
        self.strict_served_model = strict_served_model
        self.timeout_s = timeout_s or system.timeout_s
        self._version = None

    def meta(self) -> dict[str, Any]:
        if self._version is None:
            self._version = claude_version() or "unknown"
        return {
            "kind": "claude",
            "model": self.system.model,
            "effort": self.system.effort,
            "extra_env": dict(self.system.extra_env),
            "claude_code_version": self._version,
            "flag_set_sha256": flag_set_hash(),
            "flag_template": list(FLAG_TEMPLATE),
            "env_passthrough": list(ENV_PASSTHROUGH),
            "strict_served_model": self.strict_served_model,
        }

    async def call(self, task: str, case: Any) -> Outcome:
        from harness.tasks import user_message

        argv = build_argv(
            prompt=user_message(task, case),
            model=self.system.model,
            effort=self.system.effort or "low",
            system_prompt=self.system_prompts[task],
            json_schema=self.schemas[task],
        )
        env = build_env(self.system.extra_env)
        try:
            proc = await asyncio.create_subprocess_exec(
                *argv,
                stdin=asyncio.subprocess.DEVNULL,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
            )
        except FileNotFoundError as exc:
            return Outcome.failure("process_error", f"cannot launch {CLAUDE_BIN!r}: {exc}")
        try:
            out, err = await asyncio.wait_for(proc.communicate(), timeout=self.timeout_s)
        except asyncio.TimeoutError:
            proc.kill()
            try:
                await proc.communicate()
            except Exception:
                pass
            return Outcome.failure(
                "timeout", f"exceeded {self.timeout_s}s wall clock", retryable=True
            )
        stdout = out.decode("utf-8", "replace")
        stderr = err.decode("utf-8", "replace")
        outcome = parse_result(
            stdout,
            task=task,
            requested_model=self.system.model,
            strict_served_model=self.strict_served_model,
            stderr=stderr,
        )
        if not outcome.ok and outcome.failure_class == "non_json_stdout" and proc.returncode:
            outcome.message = f"exit {proc.returncode}: {outcome.message}"
        return outcome

    async def aclose(self) -> None:
        return None
