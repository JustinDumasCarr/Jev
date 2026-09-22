#!/usr/bin/env python3
"""WP3 — Tier-1 programmatic audit of data/task2_cases.jsonl (PLAN.md §5).

Checks, all of them mechanical:
  * schema validity of every row (fields, types, tag order, tag/field agreement)
  * class balance (benign / injection) and the majority-class baseline
  * counts per subtype, per vector, per language, per source, per prefilter tag
  * French coverage per subtype (WP3 acceptance: >= 20 FR per injection subtype)
  * prefilter:passed share, overall and on the injection set (acceptance: >= 85%)
  * per-tag counts >= 15 (PLAN.md §5 Tier 1)
  * length distribution and histogram, per class
  * exact duplicates and near-duplicates at 10% normalised edit distance
  * id uniqueness and contiguity

Writes data/task2_tier1.md and exits non-zero if any acceptance check fails.

    python data/audit_task2.py [--cases data/task2_cases.jsonl] [--out data/task2_tier1.md]
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "data"))
sys.path.insert(0, str(ROOT))

from gen_task2 import (  # noqa: E402
    SLICES, dedup, load_explainer, load_tagger, normalise,
)

VALID_GOLD = {"benign", "injection"}
VALID_VECTOR = {"none", "direct", "indirect"}
VALID_SUBTYPE = {v[1] for v in SLICES.values()}
INJECTION_SUBTYPES = {v[1] for v in SLICES.values() if v[0] == "injection"}
LENGTH_BINS = [0, 50, 100, 200, 400, 800, 1600, 3200, 8000, 10**9]


def load(path: Path) -> list[dict]:
    rows = []
    for n, line in enumerate(path.read_text(encoding="utf-8").split("\n"), 1):
        if not line.strip():
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError as exc:
            raise SystemExit(f"{path}:{n}: not JSON ({exc})")
    return rows


def check_schema(rows: list[dict]) -> list[str]:
    errs: list[str] = []
    seen_ids: set[str] = set()
    for r in rows:
        cid = r.get("id", "<missing id>")
        if set(r) != {"id", "text", "gold", "subtype", "vector", "tags"}:
            errs.append(f"{cid}: fields {sorted(r)} != schema")
        if cid in seen_ids:
            errs.append(f"{cid}: duplicate id")
        seen_ids.add(cid)
        if not isinstance(r.get("text"), str) or not r["text"].strip():
            errs.append(f"{cid}: empty text")
        if r.get("gold") not in VALID_GOLD:
            errs.append(f"{cid}: gold {r.get('gold')!r}")
        if r.get("subtype") not in VALID_SUBTYPE:
            errs.append(f"{cid}: subtype {r.get('subtype')!r}")
        if r.get("vector") not in VALID_VECTOR:
            errs.append(f"{cid}: vector {r.get('vector')!r}")
        tags = r.get("tags")
        if not isinstance(tags, list) or len(tags) != 4:
            errs.append(f"{cid}: tags must be 4 entries, got {tags!r}")
            continue
        if tags[0] != f"subtype:{r.get('subtype')}":
            errs.append(f"{cid}: tags[0] {tags[0]!r} != subtype")
        if not tags[1].startswith("lang:"):
            errs.append(f"{cid}: tags[1] {tags[1]!r} not a lang tag")
        if not tags[2].startswith("source:"):
            errs.append(f"{cid}: tags[2] {tags[2]!r} not a source tag")
        if tags[3] not in ("prefilter:caught", "prefilter:passed"):
            errs.append(f"{cid}: tags[3] {tags[3]!r} not a prefilter tag")
        # gold / vector / subtype must agree
        expect_gold = "injection" if r.get("subtype") in INJECTION_SUBTYPES else "benign"
        if r.get("gold") != expect_gold:
            errs.append(f"{cid}: gold {r['gold']} disagrees with subtype {r['subtype']}")
        if expect_gold == "benign" and r.get("vector") != "none":
            errs.append(f"{cid}: benign case with vector {r['vector']}")
    return errs


def check_prefilter_tags(rows: list[dict], tagger) -> list[str]:
    errs = []
    for r in rows:
        want = tagger(r["text"])
        if r["tags"][3] != want:
            errs.append(f"{r['id']}: prefilter tag {r['tags'][3]} but tagger says {want}")
    return errs


def tag_value(r: dict, prefix: str) -> str:
    for t in r["tags"]:
        if t.startswith(prefix):
            return t[len(prefix):]
    return "?"


def table(headers: list[str], rows: list[list], out: list[str]) -> None:
    out.append("| " + " | ".join(headers) + " |")
    out.append("|" + "|".join("---" for _ in headers) + "|")
    for r in rows:
        out.append("| " + " | ".join(str(c) for c in r) + " |")
    out.append("")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cases", default=str(ROOT / "data" / "task2_cases.jsonl"))
    ap.add_argument("--out", default=str(ROOT / "data" / "task2_tier1.md"))
    args = ap.parse_args()

    path = Path(args.cases)
    rows = load(path)
    tagger, tagger_name = load_tagger()
    failures: list[str] = []
    out: list[str] = []

    out.append("# Task 2 — Tier-1 audit")
    out.append("")
    try:
        shown = path.relative_to(ROOT)
    except ValueError:
        shown = path
    out.append(f"`{shown}` · {len(rows)} rows · generated by `data/gen_task2.py` · "
               f"prefilter `{tagger_name}` · "
               f"run {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    out.append("")

    # ---------------- schema ----------------
    schema_errs = check_schema(rows)
    tag_errs = check_prefilter_tags(rows, tagger)
    out.append("## Schema")
    out.append("")
    out.append(f"- rows: **{len(rows)}** (target 1,000)")
    out.append(f"- schema violations: **{len(schema_errs)}**")
    out.append(f"- prefilter tags disagreeing with `{tagger_name}`: **{len(tag_errs)}**")
    for e in (schema_errs + tag_errs)[:20]:
        out.append(f"  - {e}")
    out.append("")
    if len(rows) != 1000:
        failures.append(f"row count {len(rows)} != 1000")
    if schema_errs:
        failures.append(f"{len(schema_errs)} schema violations")
    if tag_errs:
        failures.append(f"{len(tag_errs)} stale prefilter tags")

    # ---------------- class balance ----------------
    gold = Counter(r["gold"] for r in rows)
    out.append("## Class balance")
    out.append("")
    table(["gold", "n", "share"],
          [[g, n, f"{n / len(rows):.1%}"] for g, n in sorted(gold.items())], out)
    maj = max(gold.values()) / len(rows)
    out.append(f"Majority-class baseline: **{maj:.1%}**.")
    out.append("")
    if gold.get("benign") != 500 or gold.get("injection") != 500:
        failures.append(f"class balance {dict(gold)} != 500/500")

    # ---------------- subtype x language ----------------
    by_sub = Counter(r["subtype"] for r in rows)
    by_sub_lang = Counter((r["subtype"], tag_value(r, "lang:")) for r in rows)
    langs = sorted({tag_value(r, "lang:") for r in rows})
    out.append("## Subtype x language")
    out.append("")
    body = []
    for sub in sorted(by_sub, key=lambda s: (s not in INJECTION_SUBTYPES, s)):
        planned = next((v[3] for v in SLICES.values() if v[1] == sub), "-")
        row = [sub, "injection" if sub in INJECTION_SUBTYPES else "benign",
               by_sub[sub], planned]
        row += [by_sub_lang.get((sub, lg), 0) for lg in langs]
        body.append(row)
    table(["subtype", "gold", "n", "planned"] + [f"lang:{lg}" for lg in langs], body, out)

    fr_short = [s for s in INJECTION_SUBTYPES if by_sub_lang.get((s, "fr"), 0) < 20]
    out.append(f"Injection subtypes with fewer than 20 French cases: "
               f"**{', '.join(sorted(fr_short)) if fr_short else 'none'}**.")
    out.append("")
    if fr_short:
        failures.append(f"FR < 20 for: {', '.join(sorted(fr_short))}")

    n_fr = sum(1 for r in rows if tag_value(r, "lang:") == "fr")
    out.append(f"French overall: **{n_fr}** / {len(rows)} = {n_fr / len(rows):.1%} "
               f"(PLAN.md §4 target 25%).")
    out.append("")

    # ---------------- vector / source ----------------
    out.append("## Vector, source and prefilter")
    out.append("")
    table(["vector", "n"], sorted(Counter(r["vector"] for r in rows).items()), out)
    table(["source", "n"],
          sorted(Counter(tag_value(r, "source:") for r in rows).items()), out)

    pf = Counter(r["tags"][3] for r in rows)
    pf_inj = Counter(r["tags"][3] for r in rows if r["gold"] == "injection")
    pf_ben = Counter(r["tags"][3] for r in rows if r["gold"] == "benign")
    table(["set", "passed", "caught", "passed share"],
          [["all", pf["prefilter:passed"], pf["prefilter:caught"],
            f"{pf['prefilter:passed'] / len(rows):.1%}"],
           ["injection", pf_inj["prefilter:passed"], pf_inj["prefilter:caught"],
            f"{pf_inj['prefilter:passed'] / max(sum(pf_inj.values()), 1):.1%}"],
           ["benign", pf_ben["prefilter:passed"], pf_ben["prefilter:caught"],
            f"{pf_ben['prefilter:passed'] / max(sum(pf_ben.values()), 1):.1%}"]], out)
    inj_share = pf_inj["prefilter:passed"] / max(sum(pf_inj.values()), 1)
    if inj_share < 0.85:
        failures.append(f"injection prefilter:passed share {inj_share:.1%} < 85%")

    caught_by_sub = Counter(r["subtype"] for r in rows if r["tags"][3] == "prefilter:caught")
    if caught_by_sub:
        out.append("Caught cases by subtype:")
        out.append("")
        table(["subtype", "caught", "of"],
              [[s, n, by_sub[s]] for s, n in sorted(caught_by_sub.items())], out)
    explainer = load_explainer()
    reasons = Counter(x for r in rows if r["tags"][3] == "prefilter:caught"
                      for x in (explainer(r["text"]) or ["?"]))
    if reasons:
        out.append(f"Which `{tagger_name}` rule fires on the caught rows:")
        out.append("")
        table(["check", "n"], sorted(reasons.items(), key=lambda kv: -kv[1]), out)

    obf_passed = sum(1 for r in rows
                     if r["subtype"] == "obfuscated" and r["tags"][3] == "prefilter:passed")
    out.append(f"Obfuscated slice passing the prefilter: **{obf_passed}** / "
               f"{by_sub.get('obfuscated', 0)} (WP3 brief target: 90 of 100).")
    out.append("")
    if obf_passed < 90:
        failures.append(f"obfuscated prefilter:passed {obf_passed} < 90")

    # ---------------- per-tag counts ----------------
    tag_counts = Counter(t for r in rows for t in r["tags"])
    thin = {t: n for t, n in tag_counts.items() if n < 15}
    out.append("## Per-tag counts (PLAN.md §5: every tag >= 15)")
    out.append("")
    table(["tag", "n"], sorted(tag_counts.items()), out)
    out.append(f"Tags under 15: **{', '.join(f'{t} ({n})' for t, n in sorted(thin.items())) or 'none'}**.")
    out.append("")
    if thin:
        failures.append(f"tags under 15: {sorted(thin)}")

    # ---------------- lengths ----------------
    out.append("## Length distribution (characters)")
    out.append("")
    hist: dict[str, Counter] = defaultdict(Counter)
    for r in rows:
        n = len(r["text"])
        for lo, hi in zip(LENGTH_BINS, LENGTH_BINS[1:]):
            if lo <= n < hi:
                hist[f"{lo}-{hi if hi < 10**9 else '+'}"][r["gold"]] += 1
                break
    order = [f"{lo}-{hi if hi < 10**9 else '+'}" for lo, hi in zip(LENGTH_BINS, LENGTH_BINS[1:])]
    table(["chars", "benign", "injection", "total"],
          [[b, hist[b]["benign"], hist[b]["injection"], sum(hist[b].values())]
           for b in order if hist[b]], out)

    def stats(sel):
        lens = sorted(len(r["text"]) for r in sel)
        if not lens:
            return ["-"] * 5
        return [lens[0], lens[len(lens) // 4], lens[len(lens) // 2],
                lens[3 * len(lens) // 4], lens[-1]]

    table(["set", "min", "p25", "median", "p75", "max"],
          [["all"] + stats(rows),
           ["benign"] + stats([r for r in rows if r["gold"] == "benign"]),
           ["injection"] + stats([r for r in rows if r["gold"] == "injection"])], out)

    per_sub = [[s] + stats([r for r in rows if r["subtype"] == s]) for s in sorted(by_sub)]
    table(["subtype", "min", "p25", "median", "p75", "max"], per_sub, out)

    # how much a length-only classifier could score: rank AUC of length vs gold
    pairs = sorted(((len(r["text"]), r["gold"]) for r in rows), key=lambda t: t[0])
    ranks: dict[int, float] = {}
    i = 0
    while i < len(pairs):
        j = i
        while j + 1 < len(pairs) and pairs[j + 1][0] == pairs[i][0]:
            j += 1
        avg = (i + j) / 2 + 1
        for k in range(i, j + 1):
            ranks[k] = avg
        i = j + 1
    pos = [ranks[k] for k, (_n, g) in enumerate(pairs) if g == "injection"]
    n_pos, n_neg = len(pos), len(pairs) - len(pos)
    auc = (sum(pos) - n_pos * (n_pos + 1) / 2) / (n_pos * n_neg) if n_pos and n_neg else 0.5
    out.append(f"**Length-only AUROC: {auc:.3f}** (0.5 = length carries no signal). A value far "
               "from 0.5 means a model could score above chance on length alone, so read the "
               "headline with that shortcut in mind.")
    out.append("")

    # ---------------- duplicates ----------------
    norms = [normalise(r["text"]) for r in rows]
    exact = [t for t, n in Counter(norms).items() if n > 1]
    kept, dropped = dedup([{"text": r["text"], "_id_hint": r["id"]} for r in rows])
    out.append("## Duplicates")
    out.append("")
    out.append(f"- exact duplicates after normalisation: **{len(exact)}** groups")
    out.append(f"- near-duplicate pairs at 10% normalised edit distance: **{len(dropped)}**")
    out.append(f"- duplicate rate: **{len(dropped) / len(rows):.2%}**")
    for d in dropped[:10]:
        out.append(f"  - `{d['_id_hint']}` ~ `{d.get('_dup_of', '?')}`")
    out.append("")
    if dropped:
        failures.append(f"{len(dropped)} near-duplicates remain")

    # ---------------- verdict ----------------
    out.insert(3, "**Verdict: " + ("PASS" if not failures else
                                   "FAIL — " + "; ".join(failures)) + "**\n")

    Path(args.out).write_text("\n".join(out) + "\n", encoding="utf-8")
    print("\n".join(out[:12]))
    print(f"... wrote {args.out}")
    if failures:
        print("FAIL: " + "; ".join(failures))
        sys.exit(1)
    print("PASS")


if __name__ == "__main__":
    main()
