"""Offline adapters: the oracle and null runs of PLAN.md §5 and the failure-path tests.

No network, no subprocess. `mode` selects the behaviour:

  oracle     answer gold                      -> must score 100% through the grader
  null       constant "benign" / "none"       -> must score the majority-class baseline
  empty      no decision at all               -> status: error, not a wrong answer
  raise      raises                           -> errors.jsonl, never results.jsonl
  truncated  stop_reason max_tokens           -> status "truncated", excluded from accuracy
  refusal    stop_reason refusal              -> status "refusal", a graded outcome
  limit      a usage-limit result             -> triggers the pause path, then answers gold
"""

from __future__ import annotations

import time
from typing import Any, Optional

from harness.adapters.base import Outcome
from harness.schemas import System

NULL_ANSWER = {"task1": "none", "task2": "benign"}


class FakeAdapter:
    def __init__(
        self,
        system: System,
        *,
        mode: str = "oracle",
        latency_ms: float = 1.0,
        pause_seconds: float = 30.0,
        limit_times: int = 1,
    ) -> None:
        self.system = system
        self.mode = mode
        self.latency_ms = latency_ms
        self.pause_seconds = pause_seconds
        self.limit_times = limit_times
        self.calls = 0

    def meta(self) -> dict[str, Any]:
        return {"kind": "fake", "mode": self.mode, "model": self.system.model}

    async def aclose(self) -> None:
        return None

    async def call(self, task: str, case: Any) -> Outcome:
        self.calls += 1
        if self.mode == "raise":
            raise RuntimeError("fake adapter blew up")
        common: dict[str, Any] = dict(
            served_model=self.system.model,
            is_error=False,
            usage={"input_tokens": 100, "output_tokens": 10, "thinking_tokens": 0,
                   "cache_read_input_tokens": 0, "cache_creation_input_tokens": 0},
            cost_usd_list=0.0,
            cost_usd_reported=0.0,
            latency_ms=self.latency_ms,
            duration_ms=self.latency_ms,
            raw={"_harness": {"fake": self.mode}},
        )
        if self.mode == "truncated":
            return Outcome(ok=True, status="truncated", stop_reason="max_tokens", **common)
        if self.mode == "refusal":
            return Outcome(ok=True, status="refusal", stop_reason="refusal", **common)
        if self.mode == "empty":
            return Outcome.failure("missing_structured_output", "fake empty output")
        if self.mode == "limit" and self.calls <= self.limit_times:
            return Outcome.failure(
                "usage_limit",
                "Claude AI usage limit reached",
                retryable=True,
                pause_until_epoch=time.time() + self.pause_seconds,
            )
        if self.mode == "null":
            decision = NULL_ANSWER[task]
            top3 = [decision, decision, decision] if task == "task1" else None
            return Outcome(ok=True, status="ok", decision=decision, p=0.5, top3=top3,
                           stop_reason="tool_use", **common)
        # oracle (and "limit" once the window has reset)
        decision = case.gold
        top3 = None
        if task == "task1":
            others = [o for o in (case.acceptable or []) if o != decision]
            top3 = [decision] + (others + ["none", "none"])[:2]
        return Outcome(ok=True, status="ok", decision=decision, p=1.0, top3=top3,
                       stop_reason="tool_use", **common)
