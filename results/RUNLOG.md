# Run log

One line per completed run (WP5/WP6). `notional $` is the list-price cost of the rows in
that run computed from logged tokens (`cost_usd_list`, the model under test only — the
CLI's own Haiku side call is booked separately as `usage.overhead_cost_usd_list`). For Jev
rows `notional $` **is** the real charge. `cash $` is cumulative OpenRouter spend across the
whole eval, summed from each response's `usage.cost`. `pauses` counts usage-limit pauses
recorded in `run_meta.json`.

| task | system | rows | errors | refusals | pauses | notional $ | cash $ (cum.) | wall |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| task1 | jev (rep 1) | 1000 | 0 | 0 | 0 | 0.1713 | 0.5247 | 18s |
| task1 | jev (rep 2) | 1000 | 0 | 0 | 0 | 0.1713 | 0.5247 | 21s |
| task1 | jev (rep 3) | 1000 | 0 | 0 | 0 | 0.1713 | 0.5247 | 24s |

`metrics.py --quick` on the Jev full run (`--task task1 --systems jev --split all`;
`data/splits.json` does not exist yet, so this is all 1,000 cases, not the test split):

```
task1 jev: rows=1000 scored=1000 errors=0 refusals=0 acc=0.935 [0.919, 0.949] p50=517ms cost/1k=$0.171   (rep 1)
task1 jev: rows=1000 scored=1000 errors=0 refusals=0 acc=0.935 [0.919, 0.949] p50=545ms cost/1k=$0.171   (rep 2)
task1 jev: rows=1000 scored=1000 errors=0 refusals=0 acc=0.937 [0.921, 0.951] p50=686ms cost/1k=$0.171   (rep 3)
```
