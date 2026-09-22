#!/usr/bin/env python3
"""WP2 — Tier-1 (programmatic) audit of data/task1_cases.jsonl.

Implements the Tier-1 half of PLAN.md section 5: schema validity, duplicates,
label balance, length distributions, per-tag counts, plus the WP2 acceptance
checks in SUBAGENT-BRIEFS.md. Writes a markdown report to data/task1_tier1.md
and exits non-zero if any hard check fails.

    python3 data/audit_task1.py            # writes data/task1_tier1.md
    python3 data/audit_task1.py --stdout   # also print the report
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

DATA = Path(__file__).resolve().parent
CATALOGUE = DATA / "catalogue.json"
CASES = DATA / "task1_cases.jsonl"
OUT = DATA / "task1_tier1.md"

EXPECTED_SLICES = {
    "slice:clear": 450,
    "slice:implicit": 200,
    "slice:ambiguous": 130,
    "slice:none": 120,
    "slice:adversarial": 100,
}
SLICE_TOLERANCE = 5
EXPECTED_TOTAL = 1000
MIN_PER_OPTION = 15
SHORT_TARGET = 150          # cases carrying tags[4] == "len:short"
SHORT_MAX_WORDS = 15        # the generator caps at 14 and tolerates one over
FR_TARGET = 0.20
NAME_DROP_TARGET = 0.10
SIM_THRESHOLD = 0.9

_PUNCT = re.compile(r"[^\w\s]", re.UNICODE)
_WS = re.compile(r"\s+")


def normalise(text: str) -> str:
    t = unicodedata.normalize("NFKD", text.lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    return _WS.sub(" ", _PUNCT.sub(" ", t)).strip()


def jaccard(a: frozenset[str], b: frozenset[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def histogram(values: list[int], edges: list[int]) -> list[tuple[str, int]]:
    out = []
    prev = 0
    for e in edges:
        out.append((f"{prev}-{e - 1}", sum(1 for v in values if prev <= v < e)))
        prev = e
    out.append((f"{prev}+", sum(1 for v in values if v >= prev)))
    return out


def bar(n: int, total: int, width: int = 28) -> str:
    if total <= 0:
        return ""
    return "#" * max(0, round(width * n / total))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stdout", action="store_true")
    args = ap.parse_args()

    cat = json.loads(CATALOGUE.read_text(encoding="utf-8"))
    options = {o["name"]: o for o in cat["options"]}
    routable = sorted(n for n in options if n != "none")

    rows, bad_json = [], []
    for i, line in enumerate(CASES.read_text(encoding="utf-8").splitlines(), start=1):
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError as exc:
            bad_json.append((i, str(exc)))

    failures: list[str] = []
    warnings: list[str] = []

    # ---------------- schema ------------------------------------------------ #
    schema_errors: list[str] = []
    seen_ids: set[str] = set()
    for r in rows:
        rid = r.get("id", "<no id>")
        if not isinstance(rid, str) or not re.fullmatch(r"t1-\d{4}", rid):
            schema_errors.append(f"{rid}: id not t1-NNNN")
        if rid in seen_ids:
            schema_errors.append(f"{rid}: duplicate id")
        seen_ids.add(rid)
        if set(r) != {"id", "prompt", "gold", "acceptable", "tags"}:
            schema_errors.append(f"{rid}: keys {sorted(r)}")
        p = r.get("prompt")
        if not isinstance(p, str) or not p.strip():
            schema_errors.append(f"{rid}: prompt empty or not a string")
        elif "\n" in p:
            schema_errors.append(f"{rid}: prompt contains a newline")
        g = r.get("gold")
        if g not in options:
            schema_errors.append(f"{rid}: gold {g!r} not in catalogue")
        acc = r.get("acceptable")
        if not isinstance(acc, list) or not acc:
            schema_errors.append(f"{rid}: acceptable not a non-empty list")
        else:
            if acc[0] != g:
                schema_errors.append(f"{rid}: acceptable[0] != gold")
            if len(set(acc)) != len(acc):
                schema_errors.append(f"{rid}: acceptable has repeats")
            for a in acc:
                if a not in options:
                    schema_errors.append(f"{rid}: acceptable {a!r} not in catalogue")
        tags = r.get("tags")
        if not isinstance(tags, list) or len(tags) not in (4, 5):
            schema_errors.append(f"{rid}: tags not a 4- or 5-element list")
        else:
            if len(tags) == 5 and tags[4] != "len:short":
                schema_errors.append(f"{rid}: tags[4] {tags[4]!r} is not len:short")
            if tags[0] not in EXPECTED_SLICES:
                schema_errors.append(f"{rid}: tags[0] {tags[0]!r} not a known slice")
            if not tags[1].startswith("lang:"):
                schema_errors.append(f"{rid}: tags[1] not lang:")
            if not tags[2].startswith("style:"):
                schema_errors.append(f"{rid}: tags[2] not style:")
            if not tags[3].startswith("family:"):
                schema_errors.append(f"{rid}: tags[3] not family:")
            elif g in options and tags[3] != f"family:{options[g]['family']}":
                schema_errors.append(f"{rid}: family tag disagrees with the catalogue")
            if tags[0] == "slice:ambiguous" and len(r.get("acceptable") or []) != 2:
                schema_errors.append(f"{rid}: ambiguous case without 2 acceptable options")
            if tags[0] != "slice:ambiguous" and len(r.get("acceptable") or []) != 1:
                schema_errors.append(f"{rid}: non-ambiguous case with != 1 acceptable option")
            if (tags[0] == "slice:none") != (g == "none"):
                schema_errors.append(f"{rid}: slice:none and gold=none disagree")

    if bad_json:
        failures.append(f"{len(bad_json)} unparseable line(s)")
    if schema_errors:
        failures.append(f"{len(schema_errors)} schema error(s)")

    # ---------------- counts ------------------------------------------------ #
    if len(rows) != EXPECTED_TOTAL:
        failures.append(f"row count {len(rows)} != {EXPECTED_TOTAL}")

    slices = Counter(r["tags"][0] for r in rows)
    for s, want in EXPECTED_SLICES.items():
        got = slices.get(s, 0)
        if abs(got - want) > SLICE_TOLERANCE:
            failures.append(f"{s}: {got} vs plan {want} (tolerance +/-{SLICE_TOLERANCE})")

    gold_counts = Counter(r["gold"] for r in rows)
    under = [(o, gold_counts.get(o, 0)) for o in routable if gold_counts.get(o, 0) < MIN_PER_OPTION]
    if under:
        failures.append(f"{len(under)} option(s) under {MIN_PER_OPTION} gold prompts: {under}")
    missing = [o for o in routable if o not in gold_counts]
    if missing:
        failures.append(f"option(s) with no prompt at all: {missing}")

    langs = Counter(r["tags"][1] for r in rows)
    fr = langs.get("lang:fr", 0) / max(1, len(rows))
    if abs(fr - FR_TARGET) > 0.02:
        warnings.append(f"French share {fr:.1%} vs target {FR_TARGET:.0%}")

    styles = Counter(r["tags"][2] for r in rows)
    nd = styles.get("style:name-drop", 0) / max(1, len(rows))
    if abs(nd - NAME_DROP_TARGET) > 0.02:
        warnings.append(f"correct-name-drop share {nd:.1%} vs target {NAME_DROP_TARGET:.0%}")

    families = Counter(r["tags"][3] for r in rows)

    # ---------------- duplicates ------------------------------------------- #
    norms = [normalise(r["prompt"]) for r in rows]
    exact = Counter(norms)
    exact_dups = [(n, c) for n, c in exact.items() if c > 1]
    toks = [frozenset(n.split()) for n in norms]
    near: list[tuple[str, str, float]] = []
    top_sim = 0.0
    top_pair = ("", "")
    for i in range(len(rows)):
        ti = toks[i]
        for j in range(i + 1, len(rows)):
            s = jaccard(ti, toks[j])
            if s >= SIM_THRESHOLD:
                near.append((rows[i]["id"], rows[j]["id"], s))
            if s > top_sim:
                top_sim, top_pair = s, (rows[i]["id"], rows[j]["id"])
    dup_rate = (sum(c - 1 for _, c in exact_dups) + len(near)) / max(1, len(rows))
    if exact_dups:
        failures.append(f"{len(exact_dups)} exact duplicate group(s) after normalisation")
    if near:
        failures.append(f"{len(near)} near-duplicate pair(s) at Jaccard >= {SIM_THRESHOLD}")

    # ---------------- lengths ----------------------------------------------- #
    wl = [len(r["prompt"].split()) for r in rows]
    cl = [len(r["prompt"]) for r in rows]
    wl_sorted = sorted(wl)

    def pct(p: float) -> int:
        return wl_sorted[min(len(wl_sorted) - 1, int(p * len(wl_sorted)))]

    by_slice_len = defaultdict(list)
    for r, w in zip(rows, wl):
        by_slice_len[r["tags"][0]].append(w)

    # length must not leak the label: if one slice's median is wildly different
    for s, vals in by_slice_len.items():
        med = sorted(vals)[len(vals) // 2]
        overall = wl_sorted[len(wl_sorted) // 2]
        if abs(med - overall) > 12:
            warnings.append(f"{s} median length {med} words vs overall {overall} (possible length tell)")

    # ---------------- short stratum ----------------------------------------- #
    short = [r for r in rows if "len:short" in r["tags"]]
    long_ = [r for r in rows if "len:short" not in r["tags"]]
    short_wl = [len(r["prompt"].split()) for r in short]
    long_wl = [len(r["prompt"].split()) for r in long_]
    over_cap = [r["id"] for r, w in zip(short, short_wl) if w > SHORT_MAX_WORDS]
    if len(short) != SHORT_TARGET:
        failures.append(f"short stratum {len(short)} != {SHORT_TARGET}")
    if over_cap:
        failures.append(f"{len(over_cap)} short case(s) over {SHORT_MAX_WORDS} words: {over_cap[:8]}")
    short_by_slice = Counter(r["tags"][0] for r in short)
    short_by_lang = Counter(r["tags"][1] for r in short)
    short_fr = short_by_lang.get("lang:fr", 0) / max(1, len(short))
    if abs(short_fr - FR_TARGET) > 0.05:
        warnings.append(f"short stratum is {short_fr:.1%} French vs {FR_TARGET:.0%} overall")
    short_opts = {r["gold"] for r in short}
    if len(short_opts) < len(options):
        warnings.append(f"short stratum covers {len(short_opts)}/{len(options)} options")

    # ---------------- ambiguous pairs --------------------------------------- #
    pair_counts = Counter(
        tuple(sorted(r["acceptable"])) for r in rows if len(r["acceptable"]) == 2
    )

    # ---------------- report ------------------------------------------------ #
    L: list[str] = []
    a = L.append
    a("# Task 1 — Tier-1 dataset audit")
    a("")
    a(f"`data/task1_cases.jsonl` · {len(rows)} rows · catalogue `{cat['catalogue_version']}` "
      f"({cat['option_count']} options) · generated by `data/gen_task1.py`")
    a("")
    verdict = "PASS" if not failures else "FAIL"
    a(f"**Verdict: {verdict}**"
      + ("" if not failures else "  — " + "; ".join(failures)))
    if warnings:
        a("")
        a("Warnings: " + "; ".join(warnings))
    a("")

    a("## Acceptance checks (SUBAGENT-BRIEFS.md, WP2)")
    a("")
    a("| Check | Target | Actual | |")
    a("|---|---|---|---|")
    checks = [
        ("Rows", str(EXPECTED_TOTAL), str(len(rows)), len(rows) == EXPECTED_TOTAL),
        ("Schema-valid rows", "1000", str(len(rows) - len({e.split(':')[0] for e in schema_errors})),
         not schema_errors and not bad_json),
        ("Slice counts vs plan", f"+/-{SLICE_TOLERANCE}",
         "exact" if all(slices.get(s, 0) == w for s, w in EXPECTED_SLICES.items()) else "within tolerance",
         all(abs(slices.get(s, 0) - w) <= SLICE_TOLERANCE for s, w in EXPECTED_SLICES.items())),
        ("Minimum gold prompts per option", f">= {MIN_PER_OPTION}",
         str(min(gold_counts.get(o, 0) for o in routable)),
         min(gold_counts.get(o, 0) for o in routable) >= MIN_PER_OPTION),
        ("Duplicate rate", "0", f"{dup_rate:.3f}", dup_rate == 0.0),
        ("French share", f"{FR_TARGET:.0%}", f"{fr:.1%}", abs(fr - FR_TARGET) <= 0.02),
        ("Names a skill correctly", f"{NAME_DROP_TARGET:.0%}", f"{nd:.1%}",
         abs(nd - NAME_DROP_TARGET) <= 0.02),
        ("Ambiguous cases with 2 acceptable", "130",
         str(sum(1 for r in rows if len(r["acceptable"]) == 2)),
         sum(1 for r in rows if len(r["acceptable"]) == 2) == EXPECTED_SLICES["slice:ambiguous"]),
        ("`none` cases", "120", str(gold_counts.get("none", 0)),
         gold_counts.get("none", 0) == EXPECTED_SLICES["slice:none"]),
        ("Short stratum (`len:short`)", str(SHORT_TARGET), str(len(short)),
         len(short) == SHORT_TARGET),
        ("Short cases within the word cap", f"<= {SHORT_MAX_WORDS}",
         f"max {max(short_wl) if short_wl else 0}", not over_cap),
    ]
    for name, target, actual, ok in checks:
        a(f"| {name} | {target} | {actual} | {'ok' if ok else 'FAIL'} |")
    a("")

    a("## Slice distribution (`tags[0]`, the stratification key)")
    a("")
    a("| Slice | Plan | Actual | FR | Share |")
    a("|---|---|---|---|---|")
    for s, want in EXPECTED_SLICES.items():
        got = slices.get(s, 0)
        frn = sum(1 for r in rows if r["tags"][0] == s and r["tags"][1] == "lang:fr")
        a(f"| `{s}` | {want} | {got} | {frn} | {got / max(1, len(rows)):.1%} |")
    a(f"| **total** | {EXPECTED_TOTAL} | {len(rows)} | {langs.get('lang:fr', 0)} | |")
    a("")

    a("## Style and family")
    a("")
    a("| Style | Count | | Family | Count |")
    a("|---|---|---|---|---|")
    st = sorted(styles.items())
    fa = sorted(families.items())
    for i in range(max(len(st), len(fa))):
        left = f"`{st[i][0]}` | {st[i][1]}" if i < len(st) else " | "
        right = f"`{fa[i][0]}` | {fa[i][1]}" if i < len(fa) else " | "
        a(f"| {left} | | {right} |")
    a("")
    wrong_nd = styles.get("style:wrong-name-drop", 0)
    a(f"`style:name-drop` names the *correct* option ({styles.get('style:name-drop', 0)} cases, "
      f"{nd:.1%} of the set). A further {wrong_nd} adversarial cases name a *different* option "
      f"than the gold one, so {(styles.get('style:name-drop', 0) + wrong_nd) / max(1, len(rows)):.1%} "
      "of prompts mention some option by name.")
    a("")

    a("## Gold label balance (prompts per option)")
    a("")
    a("| Option | Family | Gold | Also acceptable | Total | |")
    a("|---|---|---|---|---|---|")
    also = Counter()
    for r in rows:
        for x in r["acceptable"][1:]:
            also[x] += 1
    for o in sorted(options, key=lambda n: (-gold_counts.get(n, 0), n)):
        g = gold_counts.get(o, 0)
        al = also.get(o, 0)
        a(f"| `{o}` | {options[o]['family']} | {g} | {al} | {g + al} | {bar(g, max(gold_counts.values()))} |")
    a("")
    a(f"Routable options (excluding `none`): min {min(gold_counts.get(o, 0) for o in routable)}, "
      f"max {max(gold_counts.get(o, 0) for o in routable)}, "
      f"mean {sum(gold_counts.get(o, 0) for o in routable) / len(routable):.1f}.")
    a("")

    a("## Language")
    a("")
    a("| Language | Count | Share |")
    a("|---|---|---|")
    for lg, n in sorted(langs.items()):
        a(f"| `{lg}` | {n} | {n / max(1, len(rows)):.1%} |")
    a("")
    fr_by_opt = Counter(r["gold"] for r in rows if r["tags"][1] == "lang:fr")
    no_fr = [o for o in routable if fr_by_opt.get(o, 0) == 0]
    a(f"Options with no French prompt: {len(no_fr)}"
      + (f" — {', '.join('`' + o + '`' for o in no_fr)}" if no_fr else ""))
    a("")

    a("## Length distribution")
    a("")
    a(f"Words: min {min(wl)}, p10 {pct(0.10)}, median {pct(0.50)}, p90 {pct(0.90)}, max {max(wl)}. "
      f"Characters: min {min(cl)}, median {sorted(cl)[len(cl) // 2]}, max {max(cl)}.")
    a("")
    a("| Words | Count | |")
    a("|---|---|---|")
    hist = histogram(wl, [10, 15, 20, 25, 30, 35, 40, 50])
    for label, n in hist:
        a(f"| {label} | {n} | {bar(n, max(c for _, c in hist))} |")
    a("")
    a("| Slice | median words | min | max |")
    a("|---|---|---|---|")
    for s in EXPECTED_SLICES:
        v = sorted(by_slice_len.get(s, [0]))
        a(f"| `{s}` | {v[len(v) // 2]} | {v[0]} | {v[-1]} |")
    a("")

    a("### Short stratum (`len:short`)")
    a("")
    a(f"{len(short)} of the {len(rows)} cases were generated under a hard {SHORT_MAX_WORDS - 1}-word "
      "cap, so the set is not made entirely of the context-rich requests Opus 5 writes by default. "
      "They are the same cases — same slice, same gold option, same language — written short, so "
      "every other distribution in this report is unaffected.")
    a("")
    sw = sorted(short_wl)
    lw = sorted(long_wl)
    a("| Stratum | Cases | min | median | p90 | max |")
    a("|---|---|---|---|---|---|")
    a(f"| `len:short` | {len(sw)} | {sw[0]} | {sw[len(sw) // 2]} | "
      f"{sw[min(len(sw) - 1, int(0.9 * len(sw)))]} | {sw[-1]} |")
    a(f"| rest | {len(lw)} | {lw[0]} | {lw[len(lw) // 2]} | "
      f"{lw[min(len(lw) - 1, int(0.9 * len(lw)))]} | {lw[-1]} |")
    a("")
    a("| Slice | Short | Share of slice | | Language | Short |")
    a("|---|---|---|---|---|---|")
    langs_s = sorted(short_by_lang.items())
    sl_s = list(EXPECTED_SLICES)
    for i in range(max(len(sl_s), len(langs_s))):
        if i < len(sl_s):
            s = sl_s[i]
            left = f"`{s}` | {short_by_slice.get(s, 0)} | {short_by_slice.get(s, 0) / max(1, slices.get(s, 1)):.1%}"
        else:
            left = " |  | "
        right = f"`{langs_s[i][0]}` | {langs_s[i][1]}" if i < len(langs_s) else " | "
        a(f"| {left} | | {right} |")
    a("")
    a(f"The short stratum is {short_fr:.1%} French (set overall {fr:.1%}) and covers "
      f"{len(short_opts)}/{len(options)} options.")
    a("")
    a("Examples:")
    for r in sorted(short, key=lambda r: len(r["prompt"].split()))[:3]:
        a(f"- `{r['gold']}` ({r['tags'][0].split(':')[1]}, {len(r['prompt'].split())} words) — "
          f"{r['prompt']}")
    a("")

    a("## Duplicates")
    a("")
    a(f"Exact duplicates after normalisation (lowercase, accents and punctuation stripped, "
      f"whitespace collapsed): **{len(exact_dups)}** group(s).")
    a(f"Near-duplicate pairs at token-set Jaccard >= {SIM_THRESHOLD}: **{len(near)}**.")
    a(f"Highest pairwise similarity in the set: {top_sim:.3f} "
      f"({top_pair[0]} / {top_pair[1]}).")
    a("`data/gen_task1.py` rejects and regenerates at a stricter 0.78, so the gap between "
      f"{top_sim:.3f} and the 0.9 reporting threshold is real headroom, not a threshold artefact.")
    a(f"Duplicate rate: **{dup_rate:.4f}**.")
    if exact_dups:
        a("")
        for n, c in exact_dups[:10]:
            a(f"- x{c}: `{n[:110]}`")
    if near:
        a("")
        for i1, i2, s in sorted(near, key=lambda t: -t[2])[:15]:
            a(f"- {i1} / {i2} — {s:.3f}")
    a("")

    a("## Ambiguous pairs")
    a("")
    a(f"{len(pair_counts)} distinct (gold, alternative) pairs across "
      f"{sum(pair_counts.values())} cases.")
    a("")
    a("| Pair | Cases |")
    a("|---|---|")
    for p, n in sorted(pair_counts.items(), key=lambda kv: (-kv[1], kv[0])):
        a(f"| `{p[0]}` / `{p[1]}` | {n} |")
    a("")

    if schema_errors or bad_json:
        a("## Schema errors")
        a("")
        for i, e in bad_json[:20]:
            a(f"- line {i}: unparseable JSON — {e}")
        for e in schema_errors[:60]:
            a(f"- {e}")
        if len(schema_errors) > 60:
            a(f"- ... and {len(schema_errors) - 60} more")
        a("")

    a("## Notes")
    a("")
    a("- Tier-1 only. Tier 2 (a 50-case stratified read plus Justin's 100) and Tier 3 "
      "(the per-case Sonnet 5 auditor over all 2,000 cases) are WP4's job, per PLAN.md section 5.")
    a("- Gold provenance: every case is label-first synthetic — the option was chosen by "
      "`data/gen_task1.py` from a fixed plan (seed 20260922) and `claude-opus-5` was then asked "
      "to write a user request for it. No prompt was labelled after the fact, and no real user, "
      "client or prospect text is in this file.")
    a("- Per-call tokens, durations and cost for every generation call are in "
      "`data/gen_task1_log.jsonl`.")
    a(f"- **Length:** the median prompt is {pct(0.50)} words (p10 {pct(0.10)}, p90 {pct(0.90)}). "
      "Opus 5 writes at the top of whatever range it is given, so the first pass came out "
      f"uniformly verbose; {len(short)} cases were then regenerated under a "
      f"{SHORT_MAX_WORDS - 1}-word cap to give the analysis a short-prompt stratum "
      "(`len:short`, section above). Length is still uniform across slices, so it is not a tell "
      "for the label; accuracy on `len:short` versus the rest is the contrast to report, and it "
      "is where Jev's documented literal-reading weakness should show if it is real.")
    a("")

    report = "\n".join(L) + "\n"
    OUT.write_text(report, encoding="utf-8")
    if args.stdout:
        print(report)
    print(f"{verdict}: {len(rows)} rows, {len(failures)} failure(s), "
          f"{len(warnings)} warning(s) -> {OUT}", file=sys.stderr)
    for f in failures:
        print(f"  FAIL {f}", file=sys.stderr)
    for w in warnings:
        print(f"  warn {w}", file=sys.stderr)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
