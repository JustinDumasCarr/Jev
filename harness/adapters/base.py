"""Common adapter contract.

An adapter turns one (task, case) into one `Outcome`. It never retries and never sleeps:
the runner owns retries, the per-case wall-clock ceiling and the usage-limit pause, so
that policy is identical for every system (PLAN.md §6).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional, Protocol

from harness.schemas import System


@dataclass
class Outcome:
    """The result of one attempt."""

    ok: bool
    #: "ok" | "truncated" | "refusal" — only meaningful when ok is True.
    status: str = "ok"
    decision: Optional[str] = None
    p: Optional[float] = None
    top3: Optional[list[str]] = None
    served_model: Optional[str] = None
    stop_reason: Optional[str] = None
    is_error: Optional[bool] = None
    usage: dict[str, Any] = field(default_factory=dict)
    cost_usd_list: Optional[float] = None
    cost_usd_reported: Optional[float] = None
    latency_ms: Optional[float] = None
    duration_ms: Optional[float] = None
    raw: dict[str, Any] = field(default_factory=dict)

    # --- failure side ------------------------------------------------------------------
    failure_class: Optional[str] = None
    message: str = ""
    stdout: Optional[str] = None
    stderr: Optional[str] = None
    #: True when the runner should back off and try again.
    retryable: bool = False
    #: Set when the response says the subscription usage window is exhausted. The runner
    #: pauses the whole run until this epoch and then retries the case (PLAN.md §6).
    pause_until_epoch: Optional[float] = None

    @classmethod
    def failure(
        cls,
        failure_class: str,
        message: str,
        *,
        retryable: bool = False,
        stdout: Optional[str] = None,
        stderr: Optional[str] = None,
        raw: Optional[dict[str, Any]] = None,
        pause_until_epoch: Optional[float] = None,
    ) -> "Outcome":
        return cls(
            ok=False,
            failure_class=failure_class,
            message=message,
            retryable=retryable,
            stdout=stdout,
            stderr=stderr,
            raw=raw or {},
            pause_until_epoch=pause_until_epoch,
        )


class Adapter(Protocol):
    system: System

    async def call(self, task: str, case: Any) -> Outcome: ...

    async def aclose(self) -> None: ...

    def meta(self) -> dict[str, Any]: ...
