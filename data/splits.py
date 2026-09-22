#!/usr/bin/env python3
"""Stratified sampling and data/splits.json (WP4, PLAN.md §5 and §7).

Every sample this project draws — the Tier-2 read, Justin's 100-case sign-off sample, the
300/700 train/test split, the 200-case variance subset — comes out of `stratified()` here,
so all of them are re-derivable byte for byte from the seed alone.

Seeding rule (PLAN.md §5): per-item and per-stratum seeds come from `zlib.crc32`, never
Python's `hash()` on a string, which is salted per process. WP2 was bitten by exactly that.

Usage:
    data/splits.py write          # writes data/splits.json
    data/splits.py check          # re-derives it and diffs against the file on disk
    data/splits.py sample --task task1 --n 50 --salt tier2
"""

from __future__ import annotations

import argparse
import json
import os
import random
import sys
import zlib
from collections import Counter, defaultdict
from pathlib import Path

DATA = Path(__file__).resolve().parent


def _case_path(task: str) -> Path:
    """The case file a split is derived from. Overridable so a regenerated dataset can be
    split where it is staged, without touching the shipped files."""
    env = {"task1": "JEV_T1_CASES", "task2": "JEV_T2_CASES"}[task]
    return Path(os.environ[env]) if os.environ.get(env) else DATA / f"{task}_cases.jsonl"


SPLITS_PATH = (Path(os.environ["JEV_SPLITS"]) if os.environ.get("JEV_SPLITS")
               else DATA / "splits.json")
SEED = 20260922
TRAIN_N = 300
TEST_N = 700
VARIANCE_N = 200
TASKS = ("task1", "task2")


def load_cases(task: str) -> list[dict]:
    """Read a case file with split("\\n"), never splitlines().

    A U+2028 / U+2029 / U+0085 inside a case would make splitlines() cut one JSON row into
    two and the read would die on a JSONDecodeError. WP3 sanitises those out of task 2;
    reading this way keeps the loader correct regardless.
    """
    path = _case_path(task)
    rows = [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").split("\n")
        if line.strip()
    ]
    return sorted(rows, key=lambda r: r["id"])


def stratum_of(case: dict) -> str:
    """PLAN.md §3/§4: tags[0] is the stratification key."""
    tags = case.get("tags") or []
    return tags[0] if tags else "untagged"


def by_stratum(cases: list[dict]) -> dict[str, list[str]]:
    out: dict[str, list[str]] = defaultdict(list)
    for c in cases:
        out[stratum_of(c)].append(c["id"])
    return {k: sorted(v) for k, v in sorted(out.items())}


def _rng(salt: str) -> random.Random:
    """A generator seeded stably from SEED and a string salt (crc32, not hash())."""
    return random.Random(SEED + zlib.crc32(salt.encode("utf-8")))


def largest_remainder(groups: dict[str, list[str]], n: int) -> dict[str, int]:
    """Allocate n across strata in proportion to size, deterministically.

    Largest-remainder, ties broken by stratum name, so the allocation never depends on
    dict order or on a float comparison that could flip between machines.
    """
    total = sum(len(v) for v in groups.values())
    if total == 0 or n <= 0:
        return {k: 0 for k in groups}
    exact = {k: len(v) * n / total for k in groups for v in [groups[k]]}
    base = {k: min(int(exact[k]), len(groups[k])) for k in groups}
    left = n - sum(base.values())
    order = sorted(
        groups,
        key=lambda k: (-(exact[k] - base[k]), -len(groups[k]), k),
    )
    i = 0
    while left > 0 and i < len(order) * 4:
        k = order[i % len(order)]
        if base[k] < len(groups[k]):
            base[k] += 1
            left -= 1
        i += 1
    return base


def stratified(groups: dict[str, list[str]], n: int, salt: str) -> list[str]:
    """n ids drawn stratified across `groups`, re-derivable from (SEED, salt)."""
    quota = largest_remainder(groups, n)
    picked: list[str] = []
    for key in sorted(groups):
        pool = sorted(groups[key])
        rng = _rng(f"{salt}|{key}")
        rng.shuffle(pool)
        picked.extend(pool[: quota[key]])
    return sorted(picked)


def sample_task(task: str, n: int, salt: str) -> list[str]:
    return stratified(by_stratum(load_cases(task)), n, f"{salt}|{task}")


def build_splits() -> dict:
    out: dict = {
        "seed": SEED,
        "generated_by": "data/splits.py",
        "rule": (
            "Stratified by tags[0]. Per-stratum seeds are SEED + zlib.crc32(salt|stratum); "
            "Python's hash() is never used (PLAN.md §5). Quotas are largest-remainder, ties "
            "broken by stratum name, so the allocation is machine-independent. "
            "Re-derive with `data/splits.py check`."
        ),
        "train_n": TRAIN_N,
        "test_n": TEST_N,
        "variance_n": VARIANCE_N,
    }
    for task in TASKS:
        cases = load_cases(task)
        groups = by_stratum(cases)
        train = stratified(groups, TRAIN_N, f"train|{task}")
        train_set = set(train)
        test = sorted(c["id"] for c in cases if c["id"] not in train_set)
        # The variance subset is drawn from test only: every reported number is on test
        # (PLAN.md §7), so run-to-run spread must be measured on test cases.
        test_groups = {
            k: [i for i in v if i not in train_set] for k, v in groups.items()
        }
        test_groups = {k: v for k, v in test_groups.items() if v}
        variance = stratified(test_groups, VARIANCE_N, f"variance|{task}")
        out[task] = {
            "n": len(cases),
            "strata": {k: len(v) for k, v in groups.items()},
            "train": train,
            "test": test,
            "variance": variance,
        }
    return out


def distribution_report(obj: dict) -> list[str]:
    lines: list[str] = []
    for task in TASKS:
        cases = {c["id"]: c for c in load_cases(task)}
        lines.append(f"\n## {task}")
        gold_key = "gold"
        for split in ("train", "test", "variance"):
            ids = obj[task][split]
            strata = Counter(stratum_of(cases[i]) for i in ids)
            gold = Counter(cases[i][gold_key] for i in ids)
            lang = Counter(
                next((t for t in cases[i]["tags"] if t.startswith("lang:")), "lang:?")
                for i in ids
            )
            lines.append(f"- {split} n={len(ids)}")
            lines.append(f"  strata: {dict(sorted(strata.items()))}")
            lines.append(f"  lang:   {dict(sorted(lang.items()))}")
            if len(gold) <= 6:
                lines.append(f"  gold:   {dict(sorted(gold.items()))}")
        tr, te = set(obj[task]["train"]), set(obj[task]["test"])
        lines.append(f"- train∩test = {len(tr & te)} (must be 0); "
                     f"train∪test = {len(tr | te)} (must be {obj[task]['n']})")
        lines.append(f"- variance ⊆ test: {set(obj[task]['variance']) <= te}")
    return lines


def main() -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("write")
    sub.add_parser("check")
    p = sub.add_parser("sample")
    p.add_argument("--task", required=True, choices=TASKS)
    p.add_argument("--n", type=int, required=True)
    p.add_argument("--salt", required=True)
    args = ap.parse_args()

    if args.cmd == "sample":
        for i in sample_task(args.task, args.n, args.salt):
            print(i)
        return 0

    obj = build_splits()
    blob = json.dumps(obj, ensure_ascii=False, indent=2, sort_keys=False) + "\n"
    path = SPLITS_PATH
    if args.cmd == "write":
        path.write_text(blob, encoding="utf-8")
        print(f"wrote {path} ({len(blob)} bytes)")
        print("\n".join(distribution_report(obj)))
        return 0

    if not path.exists():
        print("splits.json does not exist", file=sys.stderr)
        return 1
    on_disk = path.read_text(encoding="utf-8")
    same = on_disk == blob
    print("splits.json re-derives byte for byte" if same
          else "MISMATCH: splits.json differs from a fresh derivation")
    return 0 if same else 1


if __name__ == "__main__":
    raise SystemExit(main())
