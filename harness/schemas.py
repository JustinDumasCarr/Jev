"""Shared types, the system matrix, output schemas and the price table.

Every model id and effort setting here is copied from PLAN.md §2. Do not edit the
matrix to work around a CLI error: fix the adapter instead (WP1 brief).
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator

SEED = 20260922
TASKS = ("task1", "task2")

# --------------------------------------------------------------------------------------
# System matrix — PLAN.md §2
# --------------------------------------------------------------------------------------


@dataclass(frozen=True)
class System:
    """One system under test."""

    id: str
    kind: Literal["claude", "jev", "fake"]
    model: str
    effort: Optional[str] = None
    # Extra environment for the subprocess, on top of the reduced env (PLAN.md §6).
    extra_env: dict[str, str] = field(default_factory=dict)
    # Not part of the primary matrix (smoke-only, sweep-only or test-only).
    primary: bool = True
    note: str = ""

    @property
    def concurrency(self) -> int:
        # PLAN.md §6: 4 claude processes in flight per Claude system, 32 for Jev.
        return {"claude": 4, "jev": 32, "fake": 32}[self.kind]

    @property
    def timeout_s(self) -> float:
        # PLAN.md §6: hard per-case wall-clock ceiling.
        return {"claude": 120.0, "jev": 15.0, "fake": 15.0}[self.kind]


#: Ordered strongest -> weakest, PLAN.md §8's tier order.
CLAUDE_TIER_ORDER = (
    "fable51",
    "opus5",
    "opus48",
    "opus47",
    "opus46",
    "sonnet5",
    "sonnet46",
    "haiku45",
)

#: Same order for the no-thinking family (PLAN.md §2, §8).
CLAUDE_NOTHINK_TIER_ORDER = tuple(f"{sid}-nothink" for sid in CLAUDE_TIER_ORDER)

#: Every Claude system that takes part in majority votes and kappa matrices.
CLAUDE_ALL = CLAUDE_TIER_ORDER + CLAUDE_NOTHINK_TIER_ORDER

SYSTEMS: dict[str, System] = {
    # --- Jev (OpenRouter) --------------------------------------------------------------
    "jev": System(id="jev", kind="jev", model="typesafe/jev-1.13"),
    # PLAN.md §2/§7 name the rolling alias "typesafe/jev-latest". WP0 found that slug
    # returns 400 "Model typesafe/jev-latest does not exist"; OpenRouter spells the alias
    # with a leading tilde (fixtures 03 and 04 in tests/fixtures/jev_probe_2026-09-22/).
    "jev-latest": System(
        id="jev-latest",
        kind="jev",
        model="~typesafe/jev-latest",
        primary=False,
        note="smoke only, to confirm the alias resolves to 1.13 (PLAN.md §2)",
    ),
    # --- Claude, primary run: every system at effort low (PLAN.md §2) ------------------
    "fable51": System(id="fable51", kind="claude", model="claude-fable-5-1", effort="low"),
    "opus5": System(id="opus5", kind="claude", model="claude-opus-5", effort="low"),
    "opus48": System(id="opus48", kind="claude", model="claude-opus-4-8", effort="low"),
    "opus47": System(id="opus47", kind="claude", model="claude-opus-4-7", effort="low"),
    "opus46": System(id="opus46", kind="claude", model="claude-opus-4-6", effort="low"),
    "sonnet5": System(id="sonnet5", kind="claude", model="claude-sonnet-5", effort="low"),
    "sonnet46": System(id="sonnet46", kind="claude", model="claude-sonnet-4-6", effort="low"),
    "haiku45": System(id="haiku45", kind="claude", model="claude-haiku-4-5", effort="low"),
    # --- Effort sweep, task 2 only (PLAN.md §7) ----------------------------------------
    "opus5-high": System(
        id="opus5-high", kind="claude", model="claude-opus-5", effort="high", primary=False,
        note="effort sweep (PLAN.md §7)",
    ),
    "fable51-medium": System(
        id="fable51-medium", kind="claude", model="claude-fable-5-1", effort="medium",
        primary=False, note="effort sweep (PLAN.md §7)",
    ),
    # --- No-thinking family: every Claude model with thinking disabled (PLAN.md §2, added
    # 2026-09-22 at Justin's request). MAX_THINKING_TOKENS=0 is documented at
    # https://code.claude.com/docs/en/model-config.md ("Extended Thinking" -> "Disable
    # thinking"); WP1 verified thinking tokens go to 0 (PREFLIGHT.md "Thinking control").
    # These are primary systems: they run both tasks on all 1,000 cases, because a guardrail
    # or router with thinking off is the cheapest and fastest Claude shape and the fairest
    # latency comparison against Jev.
    **{
        f"{sid}-nothink": System(
            id=f"{sid}-nothink", kind="claude", model=model, effort="low",
            extra_env={"MAX_THINKING_TOKENS": "0"},
            note="no-thinking family (PLAN.md §2); thinking disabled via MAX_THINKING_TOKENS=0",
        )
        for sid, model in (
            ("fable51", "claude-fable-5-1"),
            ("opus5", "claude-opus-5"),
            ("opus48", "claude-opus-4-8"),
            ("opus47", "claude-opus-4-7"),
            ("opus46", "claude-opus-4-6"),
            ("sonnet5", "claude-sonnet-5"),
            ("sonnet46", "claude-sonnet-4-6"),
            ("haiku45", "claude-haiku-4-5"),
        )
    },
    # --- Fakes: offline tests and the oracle / null runs of PLAN.md §5 -----------------
    "oracle": System(id="oracle", kind="fake", model="oracle", primary=False,
                     note="answers gold; must score 100% (PLAN.md §5)"),
    "null": System(id="null", kind="fake", model="null", primary=False,
                   note="constant benign / none; must score the majority-class baseline"),
}


def get_system(system_id: str) -> System:
    try:
        return SYSTEMS[system_id]
    except KeyError:
        raise SystemExit(
            f"unknown system {system_id!r}; known: {', '.join(sorted(SYSTEMS))}"
        ) from None


# --------------------------------------------------------------------------------------
# Price table — list prices per million tokens, PLAN.md §6 / the claude-api skill.
# --------------------------------------------------------------------------------------


@dataclass(frozen=True)
class Rate:
    input_per_mtok: float
    output_per_mtok: float
    #: Cache read price per million tokens. 0.1x input unless the model states otherwise.
    cache_read_per_mtok: Optional[float] = None

    @property
    def cache_read(self) -> float:
        if self.cache_read_per_mtok is not None:
            return self.cache_read_per_mtok
        return 0.1 * self.input_per_mtok


# Verified 2026-09-22 against the probe fixtures' own `modelUsage[...].costUSD`
# (tests/test_claude_parser.py::test_cost_matches_reported): cache *creation* bills at
# 2.0x input for the 1h TTL and 1.25x for the 5m TTL; cache *reads* at 0.1x input; the
# output rate applies to outputTokens, which already include thinkingTokens.
#
# NOTE for Justin: the WP1 brief writes "Fable 5.1 10/50, cache read 0.25". 0.25/Mtok is
# 0.025x input, not the 0.1x that every other model shows and that the Haiku fixtures
# confirm. The brief's literal figure is used below. This is near-moot for the run: the
# frozen flag set produces zero cache traffic (1,343 plain input tokens, 0 cached), so
# cache rates touch no primary-run row. Flagged rather than silently "corrected".
RATES: dict[str, Rate] = {
    "claude-fable-5-1": Rate(10.0, 50.0, cache_read_per_mtok=0.25),
    "claude-opus-5": Rate(5.0, 25.0),
    "claude-opus-4-8": Rate(5.0, 25.0),
    "claude-opus-4-7": Rate(5.0, 25.0),
    "claude-opus-4-6": Rate(5.0, 25.0),
    "claude-sonnet-5": Rate(2.0, 10.0),
    "claude-sonnet-4-6": Rate(3.0, 15.0),
    "claude-haiku-4-5": Rate(1.0, 5.0),
}

CACHE_CREATION_MULTIPLIER = {"5m": 1.25, "1h": 2.0}

#: Jev list price, reference/JEV-RESEARCH-2026-09-22.md and the OpenRouter listing:
#: $0.042 per million input tokens, output free. WP0 records the real charge; the adapter
#: prefers the `usage.cost` OpenRouter returns and falls back to this.
JEV_INPUT_PER_MTOK = 0.042


def claude_cost_usd(
    model_usage: dict[str, Any],
    cache_creation_breakdown: Optional[dict[str, int]] = None,
) -> Optional[float]:
    """List-price cost for one `modelUsage` entry, computed from its token counts."""
    canonical = model_usage.get("canonicalModel") or ""
    rate = RATES.get(canonical)
    if rate is None:
        return None
    cc_total = int(model_usage.get("cacheCreationInputTokens") or 0)
    if cache_creation_breakdown:
        h1 = int(cache_creation_breakdown.get("ephemeral_1h_input_tokens") or 0)
        m5 = int(cache_creation_breakdown.get("ephemeral_5m_input_tokens") or 0)
    else:
        h1, m5 = 0, cc_total
    if h1 + m5 != cc_total:  # trust the total; attribute the remainder to the 5m tier
        m5 = max(0, cc_total - h1)
    micro = (
        int(model_usage.get("inputTokens") or 0) * rate.input_per_mtok
        + int(model_usage.get("outputTokens") or 0) * rate.output_per_mtok
        + int(model_usage.get("cacheReadInputTokens") or 0) * rate.cache_read
        + h1 * rate.input_per_mtok * CACHE_CREATION_MULTIPLIER["1h"]
        + m5 * rate.input_per_mtok * CACHE_CREATION_MULTIPLIER["5m"]
    )
    return micro / 1e6


# --------------------------------------------------------------------------------------
# Cases
# --------------------------------------------------------------------------------------


class Task1Case(BaseModel):
    """PLAN.md §3."""

    id: str
    prompt: str
    gold: str
    acceptable: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)

    @property
    def text(self) -> str:
        return self.prompt

    @property
    def stratum(self) -> str:
        return self.tags[0] if self.tags else "untagged"

    @field_validator("acceptable")
    @classmethod
    def _nonempty(cls, v: list[str], info) -> list[str]:
        return v

    def model_post_init(self, _ctx) -> None:  # noqa: D105
        if self.gold not in self.acceptable:
            self.acceptable.insert(0, self.gold)


class Task2Case(BaseModel):
    """PLAN.md §4."""

    id: str
    text: str
    gold: Literal["injection", "benign"]
    subtype: str = "unspecified"
    vector: str = "unspecified"
    tags: list[str] = Field(default_factory=list)

    @property
    def prompt(self) -> str:
        return self.text

    @property
    def acceptable(self) -> list[str]:
        return [self.gold]

    @property
    def stratum(self) -> str:
        return self.tags[0] if self.tags else "untagged"

    @property
    def prefilter_tag(self) -> str:
        for t in self.tags:
            if t.startswith("prefilter:"):
                return t
        return "prefilter:unknown"


CASE_MODEL = {"task1": Task1Case, "task2": Task2Case}


def parse_case(task: str, obj: dict[str, Any]):
    return CASE_MODEL[task].model_validate(obj)


# --------------------------------------------------------------------------------------
# Claude structured-output schemas (--json-schema), PLAN.md §3 and §4
# --------------------------------------------------------------------------------------

TASK1_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "top3": {
            "type": "array",
            "items": {"type": "string"},
            "minItems": 3,
            "maxItems": 3,
            "description": "The three best options, most likely first. top3[0] is the decision.",
        },
        "confidence": {"type": "number", "minimum": 0.0, "maximum": 1.0},
    },
    "required": ["top3", "confidence"],
    "additionalProperties": False,
}

TASK2_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "verdict": {"type": "string", "enum": ["injection", "benign"]},
        "p_injection": {"type": "number", "minimum": 0.0, "maximum": 1.0},
        "reason": {"type": "string", "description": "20 words or fewer."},
    },
    "required": ["verdict", "p_injection", "reason"],
    "additionalProperties": False,
}

TASK_SCHEMA = {"task1": TASK1_SCHEMA, "task2": TASK2_SCHEMA}


# --------------------------------------------------------------------------------------
# Result / error rows — PLAN.md §6
# --------------------------------------------------------------------------------------

ErrorClass = Literal[
    "non_json_stdout",
    "missing_structured_output",
    "schema_invalid",
    "served_model_mismatch",
    "timeout",
    "api_error",
    "transport_error",
    "process_error",
    "adapter_exception",
]


class ResultRow(BaseModel):
    case_id: str
    system: str
    task: str
    rep: int
    requested_model: str
    served_model: Optional[str] = None
    decision: Optional[str] = None
    p: Optional[float] = None
    top3: Optional[list[str]] = None
    raw: dict[str, Any] = Field(default_factory=dict)
    gold: Optional[str] = None
    correct: Optional[bool] = None
    correct_lenient: Optional[bool] = None
    top3_hit: Optional[bool] = None
    status: Literal["ok", "truncated", "refusal"] = "ok"
    stop_reason: Optional[str] = None
    is_error: Optional[bool] = None
    usage: dict[str, Any] = Field(default_factory=dict)
    cost_usd_list: Optional[float] = None
    cost_usd_reported: Optional[float] = None
    latency_ms: Optional[float] = None
    duration_ms: Optional[float] = None
    wall_ms: Optional[float] = None
    attempts: int = 1
    claude_code_version: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    ts: str = ""


class ErrorRow(BaseModel):
    case_id: str
    system: str
    task: str
    rep: int
    requested_model: str
    failure_class: str
    message: str = ""
    attempts: int = 1
    stdout: Optional[str] = None
    stderr: Optional[str] = None
    raw: dict[str, Any] = Field(default_factory=dict)
    wall_ms: Optional[float] = None
    ts: str = ""


def stable_hash(obj: Any) -> str:
    """sha256 of a canonical JSON encoding; used for the flag set and the prompts."""
    if isinstance(obj, (str, bytes)):
        data = obj.encode() if isinstance(obj, str) else obj
    else:
        data = json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
    return hashlib.sha256(data).hexdigest()
