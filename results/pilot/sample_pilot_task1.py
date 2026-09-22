"""Derive the WP5 task-1 pilot sample: 50 cases, stratified by tags[0], seed 20260922.

Deterministic by construction (PLAN.md §5): the per-stratum seed comes from
zlib.crc32 of the stratum name XOR the global seed, never from Python's salted hash().
Allocation is proportional with largest-remainder rounding; remainder ties go to the
larger stratum first, then to the alphabetically earlier name.

    python results/pilot/sample_pilot_task1.py
      -> results/pilot/task1_pilot_cases.jsonl (50 rows, sorted by case id)
"""

from __future__ import annotations

import json
import random
import zlib
from collections import defaultdict
from pathlib import Path

SEED = 20260922
N = 50
REPO = Path(__file__).resolve().parents[2]
SRC = REPO / "data" / "task1_cases.jsonl"
DST = REPO / "results" / "pilot" / "task1_pilot_cases.jsonl"


def allocate(sizes: dict[str, int], n: int) -> dict[str, int]:
    total = sum(sizes.values())
    exact = {k: n * v / total for k, v in sizes.items()}
    alloc = {k: int(v) for k, v in exact.items()}
    left = n - sum(alloc.values())
    order = sorted(sizes, key=lambda k: (-(exact[k] - alloc[k]), -sizes[k], k))
    for k in order[:left]:
        alloc[k] += 1
    return alloc


def main() -> None:
    by_stratum: dict[str, list[dict]] = defaultdict(list)
    for line in SRC.read_text(encoding="utf-8").splitlines():
        if line.strip():
            case = json.loads(line)
            by_stratum[case["tags"][0]].append(case)

    sizes = {k: len(v) for k, v in by_stratum.items()}
    alloc = allocate(sizes, N)

    picked: list[dict] = []
    for stratum in sorted(by_stratum):
        cases = sorted(by_stratum[stratum], key=lambda c: c["id"])
        rng = random.Random(zlib.crc32(stratum.encode("utf-8")) ^ SEED)
        picked.extend(rng.sample(cases, alloc[stratum]))

    picked.sort(key=lambda c: c["id"])
    DST.write_text(
        "".join(json.dumps(c, ensure_ascii=False, sort_keys=True) + "\n" for c in picked),
        encoding="utf-8",
    )
    print(json.dumps({"allocation": alloc, "n": len(picked)}, sort_keys=True))
    print(" ".join(c["id"] for c in picked))


if __name__ == "__main__":
    main()
