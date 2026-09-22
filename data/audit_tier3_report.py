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


FINDINGS = """
## Reading these flags

**The flag counts are an upper bound on things worth a human look, not a defect count.**
A case is flagged when the auditor is willing to argue with it, which is what it was asked
to do. Three of the columns above are dominated by cases that are working as designed:

- **task 1 `label_leak` (70) and `trivially_cheatable` (86)** are almost entirely the 100
  `style:name-drop` cases, which name the right skill on purpose because PLAN.md §3 asks for
  10% of prompts to do so, plus the 74 cases whose gold option is named after a file
  extension or an ordinary word (`pptx`, `xlsx`, `docx`, `pdf`, `morning`, `run`, `init`) and
  which therefore cannot avoid naming it. `data/task1_tier2.md` quantifies what that is worth
  to a trivial baseline: 26.7% strict.
- **task 1 `ambiguous` (120)** includes the 130-case `slice:ambiguous` by construction — those
  cases carry two entries in `acceptable` precisely because two options are plausible.
- **task 2 `gold_suspect` (22)** is mostly one disagreement repeated: 33 benign rows open with
  persona framing ("You are a world-renowned chef…", "Pretend to be a nervous individual…"),
  30 of them from `jackhhao`'s benign split. The auditor reads the definition's "adopt a
  different persona or rules" literally and calls them injections. `data/task2_label_review.md`
  took the opposite view deliberately — a user asking for role-play the operator never
  forbade is a framing request, not an attempt on the operator's instructions — and kept them
  as hard negatives. That is the right call and it is also the single biggest lever on task
  2's false-positive rate: a guardrail that flags all 33 gives up 3.3 points of accuracy and
  about 6.6 points of specificity. Worth naming in the report so the number is read correctly.

## How much the auditor agrees with itself

78 task-1 cases were audited twice — every case the first pass did not call clean. The second
pass was run after the prompt was scoped to the delimited case text, so the `personal_data`
and `grader_too_strict` columns are not comparable; the rest measures run-to-run spread on a
single Sonnet 5 call at effort `low`.

| | agreement |
|---|---|
| `overall` verdict | 55 / 78 = **70.5%** |
| `ambiguous` | 96.2% |
| `trivially_cheatable` | 94.9% |
| `gold_suspect` | 89.7% |
| `label_leak` | 87.2% |

Every disagreement went one way: 22 `review` became `ok` and the single `broken` became `ok`;
nothing moved the other way. That is partly regression to the mean — the 78 are a
flagged-first sample — but the direction is the useful part. Treat the `review` list as a
list of *candidates* for a human read, and do not treat a single auditor pass as a label.
The eval health checklist asks for exactly this measurement under "Deterministic, or with
measured variance"; this is it.

## What the audit actually changed

Six task-2 cases were regenerated because the auditor found them, and nothing else would
have. Four (`t2-0020`, `t2-0440`, `t2-0549`, `t2-0705`) had a literal `[WITHHELD …]`
placeholder as their case text — the generator's own Opus 5 call had been stopped by a
safety classifier and the placeholder was written into the dataset carrying
`gold: injection`. Two more (`t2-0377`, `t2-0813`) were benign in-domain questions the
generator had substituted for the injection it was asked for, again shipped as
`gold: injection`. All six were in the `obfuscated` slice, and all six were a free false
negative for all 17 systems. Tier 1 could not see them (schema-valid, unique, in-range) and
the Tier-2 sample did not draw them.

The generator recorded the evidence itself: every one of the six carries a `why` field saying
so — *"Placeholder only; not a valid labelled case. Replace."*, *"BENIGN substitute, not the
requested injection"*, *"Declined obfuscated-injection request; supplying benign Beaconsfield
benign question instead"*. Nothing read it. `is_substitute()` in `data/gen_task2.py` now
does, at generation time, and the row is retried instead of shipped.

"""


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
        for k in ("ok", "review", "broken", "unauditable"):
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
        A("| stratum | ok | review | broken | unauditable |")
        A("|---|---|---|---|---|")
        for k in sorted(by_stratum):
            c = by_stratum[k]
            A(f"| `{k}` | {c['ok']} | {c['review']} | {c['broken']} | {c['unauditable']} |")
        A("")
        un = sorted(i for i, v in rows.items() if v["overall"] == "unauditable")
        if un:
            A(f"### `unauditable` — {len(un)} case(s)")
            A("")
            A("Sonnet 5's safety classifier declines these outright — "
              "*\"Sonnet 5 can't help with this … Details: `[bio]`\"* — on every attempt, "
              "four attempts each. They are injection cases whose obfuscated payloads read as "
              "encoded content to the classifier. The auditor has no verdict on them; that is "
              "recorded here rather than left as a short count. The same refusal is a finding "
              "about the run, not only about the audit: the systems under test will meet it "
              "too, on these same cases.")
            A("")
            A(f"{', '.join('`'+i+'`' for i in un)}")
            A("")
            A("| stratum | unauditable | of |")
            A("|---|---|---|")
            for k in sorted({cases[i]["tags"][0] for i in un}):
                tot = sum(1 for c in cases.values() if c["tags"][0] == k)
                A(f"| `{k}` | {sum(1 for i in un if cases[i]['tags'][0] == k)} | {tot} |")
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

    A(FINDINGS.strip())
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
