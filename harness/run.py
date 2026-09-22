"""The runner — PLAN.md §6.

    python -m harness.run --task task2 --system opus5 --rep 1 --limit 50

One row per (case, rep) in results/<task>/<system>/results.jsonl. Attempts that produce no
scorable output go to errors.jsonl with a failure class and never into results.jsonl.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import random
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Optional

from harness.adapters.base import Outcome
from harness.schemas import (
    SEED,
    ErrorRow,
    ResultRow,
    System,
    TASK_SCHEMA,
    get_system,
    parse_case,
)
from harness import tasks as taskdefs

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data"
RESULTS_DIR = REPO_ROOT / "results"

MAX_ATTEMPTS = 5
BACKOFF_BASE_S = 2.0
BACKOFF_CAP_S = 60.0


def utcnow() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# --------------------------------------------------------------------------------------
# Cases and splits
# --------------------------------------------------------------------------------------


def default_cases_path(task: str) -> Path:
    return DATA_DIR / f"{task}_cases.jsonl"


def load_cases(task: str, path: Optional[Path] = None) -> list[Any]:
    path = Path(path) if path else default_cases_path(task)
    if not path.exists():
        raise SystemExit(
            f"{path} does not exist yet (WP2/WP3 own it). Pass --cases <file> to run on "
            f"a fixture set."
        )
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            out.append(parse_case(task, json.loads(line)))
    # Determinism: cases run in sorted id order (PLAN.md §6).
    return sorted(out, key=lambda c: c.id)


def load_split_ids(task: str, split: str, path: Optional[Path] = None) -> Optional[set[str]]:
    if split == "all":
        return None
    path = Path(path) if path else DATA_DIR / "splits.json"
    if not path.exists():
        raise SystemExit(f"--split {split} needs {path} (WP4 owns it); use --split all for now")
    obj = json.loads(path.read_text(encoding="utf-8"))
    per_task = obj.get(task, obj)
    ids = per_task.get(split)
    if ids is None:
        raise SystemExit(f"{path} has no {task}/{split} list; keys: {sorted(per_task)}")
    return set(ids)


def select_cases(
    cases: list[Any], *, split_ids: Optional[set[str]], limit: Optional[int]
) -> list[Any]:
    if split_ids is not None:
        cases = [c for c in cases if c.id in split_ids]
    if limit:
        cases = cases[:limit]
    return cases


# --------------------------------------------------------------------------------------
# Scoring
# --------------------------------------------------------------------------------------


def score(task: str, case: Any, outcome: Outcome) -> dict[str, Any]:
    """Strict / lenient / top-3. A non-"ok" status is never scored (PLAN.md §2)."""
    if outcome.status != "ok" or outcome.decision is None:
        return {"correct": None, "correct_lenient": None, "top3_hit": None}
    gold = case.gold
    acceptable = list(case.acceptable) or [gold]
    strict = outcome.decision == gold
    lenient = outcome.decision in acceptable
    top3_hit = None
    if task == "task1":
        top3 = outcome.top3 or []
        top3_hit = any(x in acceptable for x in top3[:3]) if top3 else None
    return {"correct": strict, "correct_lenient": lenient, "top3_hit": top3_hit}


# --------------------------------------------------------------------------------------
# Output files
# --------------------------------------------------------------------------------------


class RunWriter:
    def __init__(self, root: Path, task: str, system_id: str) -> None:
        self.dir = Path(root) / task / system_id
        self.dir.mkdir(parents=True, exist_ok=True)
        self.results_path = self.dir / "results.jsonl"
        self.errors_path = self.dir / "errors.jsonl"
        self.meta_path = self.dir / "run_meta.json"
        self._lock = asyncio.Lock()

    def existing_keys(self) -> set[tuple[str, int]]:
        """(case_id, rep) rows already present — resume skips these (PLAN.md §6)."""
        keys: set[tuple[str, int]] = set()
        if not self.results_path.exists():
            return keys
        for line in self.results_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            keys.add((obj.get("case_id"), int(obj.get("rep", 1))))
        return keys

    async def write_result(self, row: ResultRow) -> None:
        async with self._lock:
            with self.results_path.open("a", encoding="utf-8") as fh:
                fh.write(row.model_dump_json() + "\n")

    async def write_error(self, row: ErrorRow) -> None:
        async with self._lock:
            with self.errors_path.open("a", encoding="utf-8") as fh:
                fh.write(row.model_dump_json() + "\n")

    def write_meta(self, meta: dict[str, Any]) -> None:
        self.meta_path.write_text(
            json.dumps(meta, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )


# --------------------------------------------------------------------------------------
# Pause gate — a usage-limit response stops the whole run (PLAN.md §6)
# --------------------------------------------------------------------------------------


class PauseGate:
    def __init__(self, sleeper=None) -> None:
        self._event = asyncio.Event()
        self._event.set()
        self._until: Optional[float] = None
        self.pauses: list[dict[str, Any]] = []
        self._sleep = sleeper or asyncio.sleep

    async def wait(self) -> None:
        await self._event.wait()

    async def pause_until(self, epoch: float, reason: str) -> None:
        now = time.time()
        if self._until is not None and epoch <= self._until:
            await self.wait()
            return
        self._until = epoch
        self._event.clear()
        seconds = max(0.0, epoch - now)
        record = {
            "started": utcnow(),
            "reason": reason[:500],
            "resume_epoch": epoch,
            "resume_iso": datetime.fromtimestamp(epoch, timezone.utc).strftime(
                "%Y-%m-%dT%H:%M:%SZ"
            ),
            "seconds": round(seconds, 1),
        }
        self.pauses.append(record)
        print(
            f"[pause] usage limit; sleeping {seconds:.0f}s until {record['resume_iso']}: "
            f"{reason[:160]}",
            file=sys.stderr,
            flush=True,
        )
        try:
            await self._sleep(seconds)
        finally:
            self._until = None
            self._event.set()


# --------------------------------------------------------------------------------------
# Adapters
# --------------------------------------------------------------------------------------


def build_adapter(system: System, *, strict_served_model: bool = False, fake_kind: str = ""):
    if system.kind == "claude":
        from harness.adapters.claude_cli import ClaudeCLIAdapter

        return ClaudeCLIAdapter(
            system,
            system_prompts=taskdefs.build_system_prompts(),
            schemas=TASK_SCHEMA,
            strict_served_model=strict_served_model,
        )
    if system.kind == "jev":
        from harness.adapters.jev import JevAdapter

        catalogue = None
        try:
            catalogue = taskdefs.load_catalogue()
        except FileNotFoundError:
            catalogue = None
        return JevAdapter(
            system,
            questions={
                "task1": taskdefs.jev_questions("task1", catalogue) if catalogue else {},
                "task2": taskdefs.jev_questions("task2"),
            },
            state_fn=taskdefs.jev_state,
        )
    if system.kind == "fake":
        from harness.adapters.fake import FakeAdapter

        return FakeAdapter(system, mode=fake_kind or system.model)
    raise SystemExit(f"no adapter for kind {system.kind!r}")


class _PerTaskQuestions(dict):
    pass


# --------------------------------------------------------------------------------------
# The run
# --------------------------------------------------------------------------------------


async def run_one(
    *,
    adapter,
    task: str,
    case: Any,
    system: System,
    rep: int,
    writer: RunWriter,
    gate: PauseGate,
    claude_version: Optional[str],
    rng: random.Random,
    sleeper=None,
) -> str:
    sleep = sleeper or asyncio.sleep
    attempts = 0
    t0 = time.perf_counter()
    last: Optional[Outcome] = None
    while attempts < MAX_ATTEMPTS:
        await gate.wait()
        attempts += 1
        try:
            outcome = await adapter.call(task, case)
        except Exception as exc:  # an adapter that raises must land in errors.jsonl
            outcome = Outcome.failure("adapter_exception", f"{type(exc).__name__}: {exc}")
        last = outcome
        if outcome.ok:
            break
        if outcome.pause_until_epoch:
            await gate.pause_until(outcome.pause_until_epoch, outcome.message)
            attempts -= 1  # a pause is not a failed attempt
            if attempts >= MAX_ATTEMPTS:
                break
            continue
        if not outcome.retryable or attempts >= MAX_ATTEMPTS:
            break
        delay = min(BACKOFF_CAP_S, BACKOFF_BASE_S * (2 ** (attempts - 1)))
        await sleep(delay * (0.5 + rng.random()))  # jitter

    wall_ms = (time.perf_counter() - t0) * 1000.0
    assert last is not None

    if not last.ok:
        await writer.write_error(
            ErrorRow(
                case_id=case.id,
                system=system.id,
                task=task,
                rep=rep,
                requested_model=system.model,
                failure_class=last.failure_class or "unknown",
                message=last.message,
                attempts=attempts,
                stdout=last.stdout,
                stderr=last.stderr,
                raw=last.raw,
                wall_ms=round(wall_ms, 1),
                ts=utcnow(),
            )
        )
        return "error"

    scored = score(task, case, last)
    await writer.write_result(
        ResultRow(
            case_id=case.id,
            system=system.id,
            task=task,
            rep=rep,
            requested_model=system.model,
            served_model=last.served_model,
            decision=last.decision,
            p=last.p,
            top3=last.top3,
            raw=last.raw,
            gold=case.gold,
            status=last.status,
            stop_reason=last.stop_reason,
            is_error=last.is_error,
            usage=last.usage,
            cost_usd_list=last.cost_usd_list,
            cost_usd_reported=last.cost_usd_reported,
            latency_ms=last.latency_ms,
            duration_ms=last.duration_ms,
            wall_ms=round(wall_ms, 1),
            attempts=attempts,
            claude_code_version=claude_version,
            tags=list(getattr(case, "tags", []) or []),
            ts=utcnow(),
            **scored,
        )
    )
    return last.status


async def run(
    *,
    task: str,
    system_id: str,
    rep: int = 1,
    limit: Optional[int] = None,
    split: str = "all",
    cases_path: Optional[Path] = None,
    splits_path: Optional[Path] = None,
    out_root: Optional[Path] = None,
    strict_served_model: bool = False,
    adapter=None,
    sleeper=None,
    progress: bool = True,
) -> dict[str, Any]:
    system = get_system(system_id)
    cases = select_cases(
        load_cases(task, cases_path),
        split_ids=load_split_ids(task, split, splits_path),
        limit=limit,
    )
    writer = RunWriter(out_root or RESULTS_DIR, task, system_id)
    done = writer.existing_keys()
    todo = [c for c in cases if (c.id, rep) not in done]

    owns_adapter = adapter is None
    if adapter is None:
        adapter = build_adapter(system, strict_served_model=strict_served_model)
    # The Jev adapter holds one question set per task.
    if system.kind == "jev" and isinstance(getattr(adapter, "questions", None), dict):
        per_task = adapter.questions
        if set(per_task) <= {"task1", "task2"}:
            adapter.questions = per_task[task]

    claude_version = None
    if system.kind == "claude":
        claude_version = adapter.meta().get("claude_code_version")

    gate = PauseGate(sleeper=sleeper)
    rng = random.Random(SEED)
    sem = asyncio.Semaphore(system.concurrency)
    counts = {"ok": 0, "truncated": 0, "refusal": 0, "error": 0}
    started = utcnow()
    t0 = time.perf_counter()

    async def worker(case: Any) -> None:
        async with sem:
            status = await run_one(
                adapter=adapter,
                task=task,
                case=case,
                system=system,
                rep=rep,
                writer=writer,
                gate=gate,
                claude_version=claude_version,
                rng=rng,
                sleeper=sleeper,
            )
            counts[status] = counts.get(status, 0) + 1
            if progress and sum(counts.values()) % 10 == 0:
                print(f"  {sum(counts.values())}/{len(todo)} {counts}", file=sys.stderr, flush=True)

    try:
        await asyncio.gather(*(worker(c) for c in todo))
    finally:
        if owns_adapter:
            await adapter.aclose()

    meta = {
        "task": task,
        "system": system_id,
        "rep": rep,
        "split": split,
        "limit": limit,
        "cases_path": str(cases_path or default_cases_path(task)),
        "cases_total": len(cases),
        "cases_run": len(todo),
        "cases_skipped_resume": len(cases) - len(todo),
        "counts": counts,
        "pauses": gate.pauses,
        "started": started,
        "ended": utcnow(),
        "elapsed_s": round(time.perf_counter() - t0, 1),
        "git_sha": git_sha(),
        "python": sys.version.split()[0],
        "packages": package_versions(),
        "adapter": adapter.meta(),
        "prompt_sha256": taskdefs.prompt_hashes(),
        "seed": SEED,
        "strict_served_model": strict_served_model,
    }
    # Preserve earlier run_meta blocks so a resumed run keeps its history.
    if writer.meta_path.exists():
        try:
            prev = json.loads(writer.meta_path.read_text(encoding="utf-8"))
            history = prev.get("history", [])
            history.append({k: v for k, v in prev.items() if k != "history"})
            meta["history"] = history[-20:]
        except (json.JSONDecodeError, OSError):
            pass
    writer.write_meta(meta)
    return meta


def git_sha() -> Optional[str]:
    try:
        return subprocess.run(
            ["git", "-C", str(REPO_ROOT), "rev-parse", "HEAD"],
            capture_output=True, text=True, timeout=15,
        ).stdout.strip() or None
    except Exception:
        return None


def package_versions() -> dict[str, str]:
    import importlib.metadata as md

    out = {}
    for name in ("httpx", "pydantic", "numpy", "scikit-learn", "pytest", "python-dotenv"):
        try:
            out[name] = md.version(name)
        except md.PackageNotFoundError:
            out[name] = "not installed"
    return out


def load_dotenv_if_present() -> None:
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    load_dotenv(REPO_ROOT / ".env")


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(prog="harness.run", description="Jev vs Claude eval runner")
    ap.add_argument("--task", required=True, choices=("task1", "task2"))
    ap.add_argument("--system", required=True)
    ap.add_argument("--rep", type=int, default=1)
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--split", default="all", choices=("train", "test", "all", "variance"))
    ap.add_argument("--cases", type=Path, default=None, help="override data/<task>_cases.jsonl")
    ap.add_argument("--splits", type=Path, default=None)
    ap.add_argument("--out", type=Path, default=None, help="override results/")
    ap.add_argument(
        "--strict-served-model",
        action="store_true",
        help="PLAN.md's literal one-modelUsage-key rule; see claude_cli.py for why it is off",
    )
    args = ap.parse_args(argv)
    load_dotenv_if_present()
    meta = asyncio.run(
        run(
            task=args.task,
            system_id=args.system,
            rep=args.rep,
            limit=args.limit,
            split=args.split,
            cases_path=args.cases,
            splits_path=args.splits,
            out_root=args.out,
            strict_served_model=args.strict_served_model,
        )
    )
    print(json.dumps({k: meta[k] for k in ("task", "system", "counts", "elapsed_s", "pauses")}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
