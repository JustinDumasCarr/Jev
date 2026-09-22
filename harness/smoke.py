"""The WP1 smoke: a small number of real calls to prove the wiring end to end.

    python -m harness.smoke                 # haiku45 only, 3 cases per task (no cash cost)
    python -m harness.smoke --jev           # adds Jev (OpenRouter, real money, ~$0.0001)
    python -m harness.smoke --thinking-probe

Claude calls run on the subscription, so the default costs nothing but usage window. Jev
costs money and is therefore opt-in: WP1 was told to skip it, and WP5 runs the full smoke
(5 cases per task, all nine systems plus the `jev-latest` alias) against the real data sets.

Cases come from tests/fixtures/cases/, not data/, so the smoke runs before WP2 and WP3
have landed their files and never depends on work in progress.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path
from typing import Optional

from harness import metrics as M
from harness import tasks as taskdefs
from harness.run import RESULTS_DIR, load_dotenv_if_present, run
from harness.schemas import SYSTEMS, TASK_SCHEMA

REPO_ROOT = Path(__file__).resolve().parent.parent
FIXTURE_CASES = REPO_ROOT / "tests" / "fixtures" / "cases"
FIXTURE_CATALOGUE = REPO_ROOT / "tests" / "fixtures" / "catalogue_fixture.json"
SMOKE_ROOT = RESULTS_DIR / "smoke"


def catalogue_for_smoke() -> list[dict[str, str]]:
    """data/catalogue.json once WP2 has landed it, else the 5-option test fixture."""
    try:
        return taskdefs.load_catalogue()
    except FileNotFoundError:
        return taskdefs.load_catalogue(FIXTURE_CATALOGUE)


def claude_adapter(system_id: str, catalogue):
    from harness.adapters.claude_cli import ClaudeCLIAdapter

    return ClaudeCLIAdapter(
        SYSTEMS[system_id],
        system_prompts=taskdefs.build_system_prompts(catalogue),
        schemas=TASK_SCHEMA,
    )


def jev_adapter(system_id: str, catalogue, task: str):
    from harness.adapters.jev import JevAdapter

    return JevAdapter(
        SYSTEMS[system_id],
        questions=taskdefs.jev_questions(task, catalogue),
        state_fn=taskdefs.jev_state,
    )


async def smoke(
    *, systems: list[str], limit: int, out_root: Path, catalogue
) -> list[dict]:
    metas = []
    for task in ("task1", "task2"):
        cases = FIXTURE_CASES / f"{task}_fixture.jsonl"
        for sid in systems:
            system = SYSTEMS[sid]
            adapter = (
                claude_adapter(sid, catalogue)
                if system.kind == "claude"
                else jev_adapter(sid, catalogue, task)
            )
            print(f"\n== {task} / {sid} ({system.model}) ==", file=sys.stderr, flush=True)
            meta = await run(
                task=task,
                system_id=sid,
                limit=limit,
                split="all",
                cases_path=cases,
                out_root=out_root,
                adapter=adapter,
                progress=False,
            )
            metas.append(meta)
            await adapter.aclose()
    return metas


def print_rows(out_root: Path, systems: list[str]) -> int:
    """One line per smoke row, and the served-model assertion."""
    bad = 0
    print("\n=== smoke rows ===")
    header = (
        f"{'task':6s} {'system':10s} {'case':9s} {'served':28s} {'dec':10s} "
        f"{'p':>5s} {'ok':>3s} {'api ms':>7s} {'wall ms':>8s} {'in':>6s} {'out':>5s} "
        f"{'think':>6s} {'$list':>9s}"
    )
    print(header)
    for task in ("task1", "task2"):
        for sid in systems:
            for r in M.load_rows(task, sid, out_root):
                u = r.get("usage") or {}
                served_ok = (r.get("served_model") or "").startswith(
                    SYSTEMS[sid].model.lstrip("~").replace("~", "")
                ) or (SYSTEMS[sid].kind == "jev" and (r.get("served_model") or "").startswith("typesafe/jev-"))
                bad += 0 if served_ok else 1
                print(
                    f"{task:6s} {sid:10s} {r['case_id']:9s} {str(r.get('served_model')):28s} "
                    f"{str(r.get('decision')):10s} {_f(r.get('p')):>5s} "
                    f"{str(r.get('correct')):>3s} {_f(r.get('latency_ms'), 0):>7s} "
                    f"{_f(r.get('wall_ms'), 0):>8s} {u.get('input_tokens', 0):>6d} "
                    f"{u.get('output_tokens', 0):>5d} {u.get('thinking_tokens', 0):>6d} "
                    f"{_f(r.get('cost_usd_list'), 6):>9s}"
                    + ("" if served_ok else "   <-- SERVED MODEL MISMATCH")
                )
            for e in M.load_errors(task, sid, out_root):
                bad += 1
                print(f"{task:6s} {sid:10s} {e['case_id']:9s} ERROR {e['failure_class']}: "
                      f"{e['message'][:120]}")
    return bad


def _f(v, digits=2) -> str:
    return "—" if v is None else f"{v:.{digits}f}"


async def thinking_probe(catalogue) -> dict:
    """One extra Haiku call with MAX_THINKING_TOKENS=0, to check the documented switch.

    PLAN.md §2 makes the `opus5-nothink` config conditional on Claude Code exposing a way
    to disable thinking for a print call. `claude --help` shows no flag; the docs give the
    environment variable. This measures whether it actually reaches the model.
    """
    from harness.adapters.claude_cli import ClaudeCLIAdapter
    from harness.schemas import System, parse_case

    case = parse_case(
        "task2",
        json.loads(FIXTURE_CASES.joinpath("task2_fixture.jsonl").read_text().splitlines()[1]),
    )
    prompts = taskdefs.build_system_prompts(catalogue)
    out = {}
    for label, extra in (("baseline", {}), ("MAX_THINKING_TOKENS=0", {"MAX_THINKING_TOKENS": "0"})):
        system = System(
            id=f"probe-{label}", kind="claude", model="claude-haiku-4-5", effort="low",
            extra_env=extra, primary=False,
        )
        adapter = ClaudeCLIAdapter(system, system_prompts=prompts, schemas=TASK_SCHEMA)
        outcome = await adapter.call("task2", case)
        out[label] = {
            "ok": outcome.ok,
            "failure": outcome.failure_class,
            "message": outcome.message[:200],
            "thinking_tokens": (outcome.usage or {}).get("thinking_tokens"),
            "output_tokens": (outcome.usage or {}).get("output_tokens"),
            "latency_ms": outcome.latency_ms,
            "decision": outcome.decision,
        }
        print(f"[thinking probe] {label}: {out[label]}", file=sys.stderr, flush=True)
    return out


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(prog="harness.smoke")
    ap.add_argument("--systems", default="haiku45", help="comma-separated system ids")
    ap.add_argument("--jev", action="store_true", help="also call Jev (costs real money)")
    ap.add_argument("--limit", type=int, default=3)
    ap.add_argument("--out", type=Path, default=SMOKE_ROOT)
    ap.add_argument("--thinking-probe", action="store_true")
    ap.add_argument("--probe-out", type=Path, default=None)
    args = ap.parse_args(argv)

    load_dotenv_if_present()
    catalogue = catalogue_for_smoke()
    systems = [s.strip() for s in args.systems.split(",") if s.strip()]
    if args.jev:
        systems.append("jev")
    else:
        print("skipped: Jev smoke not run (WP1 was told not to spend money; "
              "use --jev to include it)", file=sys.stderr)

    asyncio.run(smoke(systems=systems, limit=args.limit, out_root=args.out, catalogue=catalogue))
    bad = print_rows(args.out, systems)

    print("\n=== metrics.py on the smoke output ===")
    for task in ("task1", "task2"):
        rep = M.compute(task, systems=systems, split="all", prefilter="all",
                        ref=systems[0], root=args.out)
        for sid in systems:
            print(M.quick_line(rep, sid))

    if args.thinking_probe:
        probe = asyncio.run(thinking_probe(catalogue))
        if args.probe_out:
            args.probe_out.parent.mkdir(parents=True, exist_ok=True)
            args.probe_out.write_text(json.dumps(probe, indent=2) + "\n", encoding="utf-8")

    print(f"\nserved-model mismatches / errors: {bad}")
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
