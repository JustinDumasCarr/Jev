# Run log

One line per completed run (WP5/WP6). `notional $` is the list-price cost of the rows in
that run computed from logged tokens (`cost_usd_list`, the model under test only — the
CLI's own Haiku side call is booked separately as `usage.overhead_cost_usd_list`). For Jev
rows `notional $` **is** the real charge. `cash $` is cumulative OpenRouter spend by this work
package (WP5), summed from each response's `usage.cost`; add $0.0100 for the WP0 probe and
WP1's smoke to get the eval total ($0.5342, confirmed against /api/v1/credits). `pauses` counts usage-limit pauses
recorded in `run_meta.json`.

| task | system | rows | errors | refusals | pauses | notional $ | cash $ (cum.) | wall |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| task1 | smoke, 18 systems x 5 cases | 90 | 0 | 0 | 0 | 3.27 | 0.0017 | 3m36s |
| task1 | pilot, 17 systems x 50 cases | 850 | 0 | 0 | 0 | 7.79 | 0.0103 | 23m15s |
| task1 | jev full (rep 1) | 1000 | 0 | 0 | 0 | 0.1713 | 0.5242 | 18s |
| task1 | jev full (rep 2) | 1000 | 0 | 0 | 0 | 0.1713 | 0.5242 | 21s |
| task1 | jev full (rep 3) | 1000 | 0 | 0 | 0 | 0.1713 | 0.5242 | 24s |

`metrics.py --quick` on the Jev full run. `--split all` (all 1,000 cases) is what the run
itself used, since `data/splits.json` did not exist when it started; WP4 committed it during
the pilot and the task-1 cases are unchanged, so the test-split numbers below are the same
rows re-filtered, not a rerun:

```
task1 jev: rows=1000 scored=1000 errors=0 refusals=0 acc=0.935 [0.919, 0.949] p50=517ms cost/1k=$0.171   (rep 1)
task1 jev: rows=1000 scored=1000 errors=0 refusals=0 acc=0.935 [0.919, 0.949] p50=545ms cost/1k=$0.171   (rep 2)
task1 jev: rows=1000 scored=1000 errors=0 refusals=0 acc=0.937 [0.921, 0.951] p50=686ms cost/1k=$0.171   (rep 3)

task1 jev: rows=700  scored=700  errors=0 refusals=0 acc=0.939 [0.920, 0.956] p50=516ms cost/1k=$0.171   (rep 1, --split test)
task1 jev: rows=700  scored=700  errors=0 refusals=0 acc=0.939 [0.921, 0.956] p50=542ms cost/1k=$0.171   (rep 2, --split test)
task1 jev: rows=700  scored=700  errors=0 refusals=0 acc=0.939 [0.921, 0.956] p50=688ms cost/1k=$0.171   (rep 3, --split test)
```
| task2 | 2026-09-22 15:48:41 | task2 jev: rows=1000 scored=1000 errors=0 refusals=0 acc=0.915 [0.898, 0.933] p50=501ms cost/1k=$0.032
| task1 | 2026-09-22 16:30:44 | task1 haiku45-nothink: rows=1000 scored=1000 errors=0 refusals=0 acc=0.885 [0.865, 0.903] p50=2430ms cost/1k=$2.630
| task2 | 2026-09-22 17:02:59 | task2 haiku45-nothink: rows=1000 scored=1000 errors=0 refusals=0 acc=0.934 [0.918, 0.949] p50=5681ms cost/1k=$3.468
| task1 | 2026-09-22 17:48:01 | task1 haiku45: rows=1000 scored=1000 errors=0 refusals=0 acc=0.929 [0.914, 0.944] p50=7264ms cost/1k=$5.926
| task1 | 2026-09-22 18:13:26 | task1 haiku45: rows=1000 scored=1000 errors=0 refusals=0 acc=0.929 [0.914, 0.944] p50=7264ms cost/1k=$5.926
| task1 | 2026-09-22 18:46:26 | task1 sonnet5: rows=1000 scored=1000 errors=0 refusals=0 acc=0.954 [0.941, 0.966] p50=2604ms cost/1k=$4.828
| task1 | 2026-09-22 18:47:12 | task1 sonnet5-nothink: rows=1000 scored=1000 errors=0 refusals=0 acc=0.943 [0.930, 0.957] p50=2607ms cost/1k=$4.956
| task2 | 2026-09-22 18:47:48 | task2 haiku45: rows=1000 scored=1000 errors=0 refusals=0 acc=0.936 [0.920, 0.951] p50=10956ms cost/1k=$6.409
| task1 | 2026-09-22 18:48:20 | task1 sonnet46-nothink: rows=1000 scored=1000 errors=0 refusals=0 acc=0.934 [0.919, 0.948] p50=3105ms cost/1k=$7.000
