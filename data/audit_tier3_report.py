#!/usr/bin/env python3
"""Aggregate the Tier-3 verdicts into data/audit_tier3.md (WP4).

    data/audit_tier3_report.py            # writes the report
    data/audit_tier3_report.py --print    # to stdout instead
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "data"))

import splits as S  # noqa: E402

DATA = ROOT / "data"
FLAGS = ("ambiguous", "gold_suspect", "label_leak", "tag_wrong", "personal_data",
         "grader_too_strict", "grader_too_lenient", "trivially_cheatable", "other")


def load_verdicts() -> dict[str, dict]:
    path = DATA / "audit_tier3.jsonl"
    out = {}
    for line in path.read_text(encoding="utf-8").split("\n"):
        if line.strip():
            row = json.loads(line)
            out[row["case_id"]] = row
    return out


def load_log() -> list[dict]:
    path = DATA / "audit_tier3_log.jsonl"
    if not path.exists():
        return []
    return [json.loads(l) for l in path.read_text(encoding="utf-8").split("\n") if l.strip()]


def totals(log: list[dict]) -> dict:
    ok = [r for r in log if r.get("ok")]
    t = {
        "calls_logged": len(log),
        "calls_ok": len(ok),
        "calls_failed": len(log) - len(ok),
        "usage_limit_pauses": sum(1 for r in log if r.get("failure") == "usage_limit"),
        "input_tokens": sum((r.get("usage") or {}).get("input_tokens", 0) for r in log),
        "output_tokens": sum((r.get("usage") or {}).get("output_tokens", 0) for r in log),
        "thinking_tokens": sum((r.get("usage") or {}).get("thinking_tokens", 0) for r in log),
        "cache_read_tokens": sum(
            (r.get("usage") or {}).get("cache_read_input_tokens", 0) for r in log),
        "cache_creation_tokens": sum(
            (r.get("usage") or {}).get("cache_creation_input_tokens", 0) for r in log),
        "overhead_tokens": sum((r.get("usage") or {}).get("overhead_tokens", 0) for r in log),
        "cost_usd_list": round(sum(r.get("cost_usd_list") or 0.0 for r in log), 4),
        "cost_usd_reported": round(sum(r.get("total_cost_usd") or 0.0 for r in log), 4),
        "api_ms": sum(r.get("duration_api_ms") or 0 for r in log),
        "wall_ms": sum(r.get("wall_ms") or 0 for r in log),
    }
    lat = sorted(r.get("duration_api_ms") or 0 for r in ok)
    if lat:
        t["api_ms_p50"] = lat[len(lat) // 2]
        t["api_ms_p95"] = lat[int(len(lat) * 0.95)]
    return t


def render() -> str:
    verdicts = load_verdicts()
    log = load_log()
    t = totals(log)
    L: list[str] = []
    A = L.append

    A("# Tier-3 audit — the per-case LLM auditor (WP4)")
    A("")
    A("One `claude-sonnet-5` call per case at effort `low` with structured output, through "
      "the harness's frozen flag set (`harness/adapters/claude_cli.py`: `FLAG_TEMPLATE`, the "
      "reduced environment, stdin `DEVNULL`, the neutral working directory), 4 processes in "
      "flight. Script: `data/audit_tier3.py`. Verdicts: `data/audit_tier3.jsonl`. Every "
      "call's tokens and durations, including the failures: `data/audit_tier3_log.jsonl`.")
    A("")
    A("The prompt is the eval health checklist's per-case auditor prompt "
      "(`claude-api` skill, `shared/evals/eval-audit.md` §1 Tier 3), adapted to each task's "
      "schema and extended with the three per-case checks PLAN.md §5 names that the generic "
      "prompt does not cover: label leakage, tag correctness, personal data.")
    A("")

    for task in ("task1", "task2"):
        cases = {c["id"]: c for c in S.load_cases(task)}
        rows = {i: v for i, v in verdicts.items() if v["task"] == task}
        A(f"## {task}")
        A("")
        if not rows:
            A("_not audited yet_")
            A("")
            continue
        missing = sorted(set(cases) - set(rows))
        A(f"{len(rows)} of {len(cases)} cases audited"
          + (f"; **{len(missing)} not audited**: {', '.join(missing[:12])}"
             f"{' …' if len(missing) > 12 else ''}" if missing else "; all of them."))
        A("")
        pv = Counter(v.get("prompt_version", 1) for v in rows.values())
        A(f"Auditor prompt version: {dict(sorted(pv.items()))} "
          f"(v2 scopes every check to the delimited case text; see data/audit_tier3.py).")
        A("")
        overall = Counter(v["overall"] for v in rows.values())
        A("| overall | n | share |")
        A("|---|---|---|")
        for k in ("ok", "review", "broken"):
            n = overall.get(k, 0)
            A(f"| `{k}` | {n} | {n/len(rows)*100:.1f}% |")
        A("")
        A("| flag | n | share | example ids |")
        A("|---|---|---|---|")
        for f in FLAGS:
            hit = sorted(i for i, v in rows.items() if v["flags"].get(f))
            A(f"| `{f}` | {len(hit)} | {len(hit)/len(rows)*100:.1f}% | "
              f"{', '.join('`'+i+'`' for i in hit[:5])}{' …' if len(hit) > 5 else ''} |")
        A("")
        by_stratum: dict[str, Counter] = defaultdict(Counter)
        for i, v in rows.items():
            by_stratum[cases[i]["tags"][0]][v["overall"]] += 1
        A("| stratum | ok | review | broken |")
        A("|---|---|---|---|")
        for k in sorted(by_stratum):
            c = by_stratum[k]
            A(f"| `{k}` | {c['ok']} | {c['review']} | {c['broken']} |")
        A("")
        broken = sorted(i for i, v in rows.items() if v["overall"] == "broken")
        if broken:
            A(f"### `broken` — {len(broken)} case(s)")
            A("")
            for i in broken:
                A(f"- **`{i}`** — {rows[i]['notes']}")
            A("")
        else:
            A("No case was marked `broken`.")
            A("")

    A("## Auditor cost")
    A("")
    A("| | |")
    A("|---|---|")
    for k, v in t.items():
        shown = f"{v:,}" if isinstance(v, int) else f"{v}"
        A(f"| {k.replace('_', ' ')} | {shown} |")
    A("")
    A("No cash: the auditor runs on the Claude Code subscription. "
      "`cost_usd_list` is the notional list-price cost of the auditor's own tokens at the "
      "`claude-api` rate table; `cost_usd_reported` is what the CLI reported, which also "
      "includes its own Haiku side call (`overhead tokens`).")
    A("")
    return "\n".join(L) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--print", action="store_true")
    args = ap.parse_args()
    body = render()
    if args.print:
        print(body)
    else:
        (DATA / "audit_tier3.md").write_text(body, encoding="utf-8")
        print(f"wrote {DATA / 'audit_tier3.md'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
