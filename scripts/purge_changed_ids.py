#!/usr/bin/env python3
"""Delete results/errors rows whose case content changed at the WP4 audit gate.

Reads the ids from data/CHANGED-IDS.md (every t2-NNNN / t1-NNNN token in the file), removes
matching rows from results/<task>/<system>/{results,errors}.jsonl, and prints a count per
system. The runner then regenerates them on its next resume. --skip <system> leaves a
system alone (use for the one the driver is writing to right now).
"""
import argparse, pathlib, re, sys

ap = argparse.ArgumentParser()
ap.add_argument("--skip", action="append", default=[])
ap.add_argument("--root", default="results")
args = ap.parse_args()

ids = set(re.findall(r"\bt[12]-\d{4}\b", pathlib.Path("data/CHANGED-IDS.md").read_text()))
by_task = {"task1": {i for i in ids if i.startswith("t1-")}, "task2": {i for i in ids if i.startswith("t2-")}}
total = 0
for task, tids in by_task.items():
    if not tids:
        continue
    for sysdir in sorted(pathlib.Path(args.root, task).glob("*/")):
        if sysdir.name in args.skip:
            print(f"{task} {sysdir.name}: skipped (in progress)")
            continue
        for name in ("results.jsonl", "errors.jsonl"):
            f = sysdir / name
            if not f.exists():
                continue
            lines = f.read_text().split("\n")
            keep = [l for l in lines if not any(f'"{i}"' in l for i in tids)]
            removed = len(lines) - len(keep)
            if removed:
                f.write_text("\n".join(keep))
                total += removed
                print(f"{task} {sysdir.name}/{name}: removed {removed}")
print(f"total removed: {total}; changed ids: task1={len(by_task['task1'])} task2={len(by_task['task2'])}")
