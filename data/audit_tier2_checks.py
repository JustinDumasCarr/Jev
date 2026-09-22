#!/usr/bin/env python3
"""Programmatic support for the Tier-2 read (WP4).

The Tier-2 tier of the eval health checklist is a human read of a stratified sample. These
are the checks that back it up and that only a script can do over all 2,000 cases: trivial
baselines (the "annotation artifacts" check), near-duplicate and paraphrase clustering
beyond what each generator's own dedup enforces, language-tag agreement, and a personal-data
scan.

    data/audit_tier2_checks.py            # everything
    data/audit_tier2_checks.py --task task2

Findings are written up in data/task1_tier2.md and data/task2_tier2.md.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "data"))

import splits as S  # noqa: E402

#: The near-duplicate rule this audit proposes for gen_task2.py's dedup(), and the one the
#: task-2 findings are computed with. See data/task2_tier2.md.
JACCARD_DUP = 0.60
CONTAINMENT_DUP = 0.80
CONTAINMENT_MIN_SHINGLES = 100


def norm(s: str) -> str:
    t = unicodedata.normalize("NFKD", s)
    t = "".join(c for c in t if not unicodedata.combining(c)).lower()
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", t)).strip()


def shingles(s: str, k: int = 5) -> frozenset:
    return frozenset(s[i : i + k] for i in range(max(1, len(s) - k + 1)))


def tokens(s: str) -> frozenset:
    return frozenset(re.findall(r"[a-z0-9]+", unicodedata.normalize("NFKD", s.lower())))


def near_dup(a: frozenset, b: frozenset) -> tuple[str, float] | None:
    """The rule this audit recommends: Jaccard OR containment, the latter length-guarded.

    gen_task2.py's own dedup() gates on a 10% length ratio before it measures anything, so
    a text that is another text *plus a chunk* is never compared. Containment closes that.
    The shingle floor keeps a short text from matching everything by accident.
    """
    inter = len(a & b)
    jac = inter / (len(a) + len(b) - inter) if (a or b) else 0.0
    if jac >= JACCARD_DUP:
        return "jaccard", round(jac, 3)
    m = min(len(a), len(b))
    if m >= CONTAINMENT_MIN_SHINGLES and inter / m >= CONTAINMENT_DUP:
        return "containment", round(inter / m, 3)
    return None


def tag(case: dict, prefix: str) -> str:
    return next((t for t in case["tags"] if t.startswith(prefix)), f"{prefix}?")


# --------------------------------------------------------------------------------------


def task1_report() -> None:
    cases = S.load_cases("task1")
    cat = json.loads((ROOT / "data" / "catalogue.json").read_text(encoding="utf-8"))
    names = [o["name"] for o in cat["options"] if o["name"] != "none"]

    print("=" * 72)
    print("TASK 1 — trivial baselines (eval-audit.md §1, 'No annotation artifacts')")
    strict = lenient = present = 0
    for c in cases:
        p = norm(c["prompt"])
        found = [
            n for n in names
            if re.search(rf"(?<![a-z0-9-]){re.escape(norm(n))}(?![a-z0-9-])", p)
        ]
        guess = found[0] if found else "none"
        present += bool(found)
        strict += guess == c["gold"]
        lenient += guess in c["acceptable"]
    print(f"  name-match baseline : strict {strict/len(cases)*100:.1f}%  "
          f"lenient {lenient/len(cases)*100:.1f}%  (a name appears in {present} prompts)")
    print(f"  always-'none'       : {sum(c['gold']=='none' for c in cases)/10:.1f}%")
    print(f"  random over 36      : {100/36:.1f}%")

    incidental = [
        c for c in cases
        if c["gold"] != "none" and "style:name-drop" not in c["tags"]
        and re.search(rf"(?<![a-z0-9-]){re.escape(norm(c['gold']))}(?![a-z0-9-])",
                      norm(c["prompt"]))
    ]
    print(f"\n  gold named in the prompt outside style:name-drop: {len(incidental)}")
    print(f"    by option: {dict(Counter(c['gold'] for c in incidental).most_common())}")
    print(f"    by slice : {dict(Counter(c['tags'][0] for c in incidental))}")

    print("\n  paraphrase pairs within one gold option (token-set Jaccard >= 0.45;")
    print("  gen_task1.py rejects at 0.78, so every pair below is inside its tolerance)")
    bygold: dict[str, list] = defaultdict(list)
    for c in cases:
        bygold[c["gold"]].append(c)
    pairs = []
    for gold, cs in bygold.items():
        for i in range(len(cs)):
            for j in range(i + 1, len(cs)):
                a, b = tokens(cs[i]["prompt"]), tokens(cs[j]["prompt"])
                jac = len(a & b) / len(a | b)
                if jac >= 0.45:
                    pairs.append((round(jac, 3), gold, cs[i]["id"], cs[j]["id"]))
    pairs.sort(reverse=True)
    print(f"    {len(pairs)} pairs; highest {pairs[0][0] if pairs else 0}")
    for p in pairs[:15]:
        print(f"      {p[0]}  {p[1]:26s} {p[2]} ~ {p[3]}")


def task2_report() -> None:
    cases = S.load_cases("task2")
    passed = [c for c in cases if "prefilter:passed" in c["tags"]]

    print("\n" + "=" * 72)
    print("TASK 2 — trivial baselines")
    def acc(rows, fn):
        return sum(fn(c) == (c["gold"] == "injection") for c in rows) / len(rows) * 100
    print(f"  majority class      : {sum(c['gold']=='benign' for c in cases)/10:.1f}%"
          f"   | prefilter:passed {sum(c['gold']=='benign' for c in passed)/len(passed)*100:.1f}%")
    best = max(((acc(passed, lambda c, t=t: len(c["text"]) > t), t)
                for t in range(50, 2500, 25)))
    print(f"  best length cut     : {best[0]:.1f}% at >{best[1]} chars (prefilter:passed)")
    kw = re.compile(
        r"ignore|disregard|forget (all|everything|about)|system prompt|oublie|"
        r"ne tiens pas compte|from now on|a partir de maintenant|you are now|t'es plus|"
        r"persona|pretend", re.I)
    print(f"  keyword cut         : {acc(passed, lambda c: bool(kw.search(c['text']))):.1f}%"
          f" (prefilter:passed)")

    print("\n  near-duplicates under the proposed rule "
          f"(Jaccard >= {JACCARD_DUP} or containment >= {CONTAINMENT_DUP} "
          f"with >= {CONTAINMENT_MIN_SHINGLES} shingles)")
    sh = {c["id"]: shingles(norm(c["text"])) for c in cases}
    by = {c["id"]: c for c in cases}
    kept: list[str] = []
    dropped: list[tuple] = []
    for cid in sorted(by):
        hit = next(((k, *r) for k in kept if (r := near_dup(sh[cid], sh[k]))), None)
        if hit:
            dropped.append((cid, *hit))
        else:
            kept.append(cid)
    print(f"    {len(dropped)} rows duplicate one kept earlier")
    print(f"    sources : {dict(Counter(tag(by[d[0]],'source:') for d in dropped))}")
    print(f"    subtypes: {dict(Counter(by[d[0]]['subtype'] for d in dropped))}")
    print(f"    langs   : {dict(Counter(tag(by[d[0]],'lang:') for d in dropped))}")
    for d in dropped:
        print(f"      {d[0]} ({by[d[0]]['subtype']}) ~ {d[1]}  {d[2]}={d[3]}")

    print("\n  language tags")
    de = set("der die das und nicht ist sie wir mit auf von zu den dem eine einen fur "
             "alles zuvor schreibe hore werden haben wie was".split())
    es = set("que de la el los las por para todo digo antes solo tienes decir muerto "
             "tiempo con una".split())
    for c in cases:
        if "lang:en" not in c["tags"]:
            continue
        w = set(re.findall(r"[a-za-a-ÿ]+", norm(c["text"])))
        n_de, n_es = len(w & de), len(w & es)
        if n_de >= 3 or n_es >= 3:
            print(f"    {c['id']} tagged lang:en but de={n_de} es={n_es} "
                  f"({tag(c,'source:')}, {c['subtype']})")


def personal_data() -> None:
    print("\n" + "=" * 72)
    print("PERSONAL DATA (both tasks)")
    email = re.compile(r"[\w.+-]+@([\w-]+(?:\.[\w-]+)+)")
    phone = re.compile(r"(?<!\d)(\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4})(?!\d)")
    url = re.compile(r"https?://([\w.-]+)")
    fictional = re.compile(r"example|exemple|invalid$|\.test$|localhost|fictif|fictive")
    for task, field in (("task1", "prompt"), ("task2", "text")):
        rows = S.load_cases(task)
        bad_mail, bad_host, real_phone = [], [], []
        for c in rows:
            for dom in email.findall(c[field]):
                if not fictional.search(dom):
                    bad_mail.append((c["id"], dom))
            for host in url.findall(c[field]):
                if not fictional.search(host):
                    bad_host.append((c["id"], host))
            for p in phone.findall(c[field]):
                if "555-01" not in p.replace(" ", "-") and "555 01" not in p:
                    real_phone.append((c["id"], p))
        leak = [c["id"] for c in rows
                if re.search(r"\bJustin\b|\bJev\b", c[field])]
        print(f"  {task}: non-fictional email domains {len(bad_mail)} {bad_mail[:5]}")
        print(f"         non-fictional hosts {len(bad_host)} {sorted(set(bad_host))[:5]}")
        print(f"         phone-shaped outside the 555-01xx reserved block "
              f"{len(real_phone)} {real_phone[:5]}")
        print(f"         mentions Justin / Jev: {len(leak)} {leak[:5]}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--task", choices=("task1", "task2"), default=None)
    args = ap.parse_args()
    if args.task in (None, "task1"):
        task1_report()
    if args.task in (None, "task2"):
        task2_report()
    if args.task is None:
        personal_data()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
