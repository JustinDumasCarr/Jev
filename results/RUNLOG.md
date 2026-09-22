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
| task1 | oracle | 1000 | 0 | 0 | 0 | 0.0000 | 0.0000 | 0.2 s |
| task1 | null | 1000 | 0 | 0 | 0 | 0.0000 | 0.0000 | 0.2 s |
| task2 | oracle | 1000 | 0 | 0 | 0 | 0.0000 | 0.0000 | 0.2 s |
| task2 | null | 1000 | 0 | 0 | 0 | 0.0000 | 0.0000 | 0.2 s |

_Reset 2026-09-22 by the WP10 privacy scrub: both system prompts, the task-1 catalogue and
1,000 of the 2,000 cases changed, so every row produced before that date was scored against
text that no longer exists. The runs that produced them are archived, untracked, in
`results-pre-scrub/`; see `data/CHANGED-IDS.md`._

**PLAN.md §5 oracle and null, re-run 2026-09-22 on the post-scrub files.** The gold answers
score 100% through the grader on both tasks; a constant answer scores the majority-class rate
and nothing better — task 1 `none` 12.0% (120 of 1,000), task 2 `benign` 50.0% (500 of 1,000).
Both are offline fake adapters, no model call and no cost. Their rows are not kept: this line
is the record, and `--system oracle|null` re-derives them in under a second.
