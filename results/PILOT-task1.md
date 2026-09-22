# Task-1 pilot — WP5

**Run 2026-09-22, 15:07–15:36 local (13:07–13:36 UTC).** Task 1 only; `data/task2_cases.jsonl`
was not ready and task 2 was not run. Claude CLI 2.1.276, harness at the commit this file
lands in.

**Dataset state.** Every run here used `--split all`, because `data/splits.json` did not
exist when they started. WP4 committed it at 15:34, during the pilot (commit `7f25632`), and
`data/task1_cases.jsonl` is byte-identical to what these runs used — the WP4 fixes so far
touched task 2 only. So nothing needs rerunning, and the test split can simply be applied at
analysis time: `metrics.py --split test` on the Jev full run gives **0.939 strict on all
three reps** (n = 700), against 0.935 / 0.935 / 0.937 on all 1,000. Each `run_meta.json` records the sha256 of the exact dataset bytes used (`data_sha256`), so
any case a later audit pass regenerates can be identified and its rows rerun:

- `data/task1_cases.jsonl` `712bf31b7f12c2f4a016c42ffb71bbd4c23f2c89228a419f1817e75f54fb6630`
- `data/catalogue.json` `9c85e07da3554044a3260639e8bf36eb8558c6db5be12f742340683b09521650`

## 1. Smoke — 18 systems, 5 cases, rep 1

`results/smoke-wp5/task1/`. All 17 primary systems (jev + 8 thinking + 8 no-thinking) plus
the rolling alias. 90 rows, **0 errors, 0 refusals, 0 truncations**.

- **Served model matched the request on every row.** Each Claude row's scored `modelUsage`
  entry is the requested id; each Jev row's `model` is `typesafe/jev-1.13-20260917`.
- **`~typesafe/jev-latest` resolves to the same build as `typesafe/jev-1.13`** —
  `typesafe/jev-1.13-20260917` on all five smoke rows. (The bare `typesafe/jev-latest` of
  PLAN.md §2/§7 still 400s; the tilde form is the one that works, as PREFLIGHT.md records.)
- One thing the smoke shows that the cost table below corrects for: with only five calls a
  Claude system pays prompt-cache **creation** on most of them, which made `fable51` look
  like $112 per 1,000. Over 50 calls it settles at $17.40. Never read a cost per 1,000 off a
  five-call run.

## 2. Pilot — 17 systems, 50 stratified cases, rep 1

`results/pilot/task1/`. The 50 cases are stratified by `tags[0]` and derived
deterministically by `results/pilot/sample_pilot_task1.py` (seed 20260922; per-stratum seed
from `zlib.crc32(stratum) ^ seed`, `random.Random.sample`, never `hash()`); the sample is
frozen in `results/pilot/task1_pilot_cases.jsonl`
(sha256 `0369cd2c448b24d9d946b0066d06d539aad5a953b888529af4e4398a9a555c9a`). Allocation:
clear 23, implicit 10, ambiguous 6, none 6, adversarial 5.

850 rows. **0 errors, 0 refusals, 0 truncations, 0 usage-limit pauses.** `errors.jsonl` was
not created for any system, so there was nothing to inspect; no error rate is anywhere near
the 10% stop rule.

**No prompt change was made.** Every system returned schema-valid `structured_output` on
every case, so the condition for a one-time shared-prompt fix never arose. The prompts are
exactly what WP1 froze (`harness/prompts/task1_system.md` plus the catalogue;
`prompt_sha256` in each `run_meta.json`).

| system | requested | served | rows | err | refus | trunc | acc (n=50) | lenient | top-3 | p50 ms | p95 ms | think med | think max | $/1k | wall |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `jev` | `typesafe/jev-1.13` | `typesafe/jev-1.13-20260917` | 50 | 0 | 0 | 0 | 0.88 | 0.90 | 1.00 | 697 | 1031 | 0 | 0 | 0.17 | 2s |
| `fable51` | `claude-fable-5-1` | `claude-fable-5-1` | 50 | 0 | 0 | 0 | 0.94 | 0.96 | 1.00 | 2824 | 5378 | 0 | 276 | 17.40 | 51s |
| `opus5` | `claude-opus-5` | `claude-opus-5` | 50 | 0 | 0 | 0 | 0.98 | 0.98 | 1.00 | 2710 | 3633 | 0 | 103 | 10.79 | 55s |
| `opus48` | `claude-opus-4-8` | `claude-opus-4-8` | 50 | 0 | 0 | 0 | 0.94 | 0.96 | 1.00 | 3406 | 7359 | 26 | 296 | 11.60 | 69s |
| `opus47` | `claude-opus-4-7` | `claude-opus-4-7` | 50 | 0 | 0 | 0 | 0.94 | 0.96 | 0.98 | 5006 | 10114 | 0 | 0 | 15.17 | 93s |
| `opus46` | `claude-opus-4-6` | `claude-opus-4-6` | 50 | 0 | 0 | 0 | 0.94 | 0.96 | 1.00 | 8288 | 15226 | 0 | 278 | 12.74 | 129s |
| `sonnet5` | `claude-sonnet-5` | `claude-sonnet-5` | 50 | 0 | 0 | 0 | 0.92 | 0.94 | 1.00 | 4875 | 12398 | 0 | 98 | 4.63 | 85s |
| `sonnet46` | `claude-sonnet-4-6` | `claude-sonnet-4-6` | 50 | 0 | 0 | 0 | 0.90 | 0.92 | 0.98 | 6128 | 13272 | 16 | 337 | 7.55 | 108s |
| `haiku45` | `claude-haiku-4-5` | `claude-haiku-4-5` | 50 | 0 | 0 | 0 | 0.90 | 0.94 | 0.98 | 10929 | 22376 | 356 | 1530 | 5.34 | 161s |
| `fable51-nothink` | `claude-fable-5-1` | `claude-fable-5-1` | 50 | 0 | 0 | 0 | 0.94 | 0.96 | 1.00 | 2894 | 3732 | 0 | 156 | 6.76 | 60s |
| `opus5-nothink` | `claude-opus-5` | `claude-opus-5` | 50 | 0 | 0 | 0 | 0.96 | 0.96 | 1.00 | 2554 | 3752 | 0 | 0 | 10.85 | 48s |
| `opus48-nothink` | `claude-opus-4-8` | `claude-opus-4-8` | 50 | 0 | 0 | 0 | 0.94 | 0.96 | 1.00 | 3045 | 4155 | 0 | 0 | 10.94 | 51s |
| `opus47-nothink` | `claude-opus-4-7` | `claude-opus-4-7` | 50 | 0 | 0 | 0 | 0.94 | 0.96 | 1.00 | 4643 | 9796 | 0 | 0 | 15.17 | 80s |
| `opus46-nothink` | `claude-opus-4-6` | `claude-opus-4-6` | 50 | 0 | 0 | 0 | 0.94 | 0.96 | 1.00 | 8021 | 18256 | 0 | 0 | 12.30 | 132s |
| `sonnet5-nothink` | `claude-sonnet-5` | `claude-sonnet-5` | 50 | 0 | 0 | 0 | 0.94 | 0.94 | 1.00 | 5211 | 14598 | 0 | 0 | 5.00 | 97s |
| `sonnet46-nothink` | `claude-sonnet-4-6` | `claude-sonnet-4-6` | 50 | 0 | 0 | 0 | 0.94 | 0.94 | 1.00 | 4021 | 8090 | 0 | 0 | 6.84 | 70s |
| `haiku45-nothink` | `claude-haiku-4-5` | `claude-haiku-4-5` | 50 | 0 | 0 | 0 | 0.86 | 0.86 | 0.98 | 5431 | 13583 | 0 | 0 | 2.78 | 96s |

**Accuracy at n = 50 means nothing on its own.** The 95% interval on a 0.94 estimate from 50
cases is roughly ±7 points, and ±14 points on a 0.50 one (PLAN.md §7 uses ±14 as the
blanket caveat). Every Claude system sits between 0.86 and 0.98 — one case is two points, so
the whole Claude spread here is about six cases. Do not rank models off this table; that is
what the 1,000-case run and WP7's paired CIs are for. The one number that is already solid
is Jev's, because Jev also ran the full set: **0.935 / 0.935 / 0.937 top-1 strict over 1,000
cases across three reps** (§4), against 0.88 on these 50.

**Thinking is nearly absent at effort `low` on this task.** Median thinking tokens are 0 for
every system except `haiku45` (356, max 1,530), `opus48` (26) and `sonnet46` (16). The
no-thinking family still earns its place on latency — `haiku45` p50 10.9 s vs
`haiku45-nothink` 5.4 s, and the p95 gap is larger — but on task 1 the thinking/no-thinking
accuracy difference is inside the noise everywhere.

**Latency is "via Claude Code"** (`duration_api_ms`), and every Claude system is 4–16x
slower at p50 than Jev's 0.70 s via OpenRouter.

## 3. Cost per 1,000 calls, and a caveat that matters

| system | in (median) | of which cache read | cache create | out | $/1k measured | $/1k if nothing cached | side-call $/1k |
|---|---:|---:|---:|---:|---:|---:|---:|
| `jev` | 4079 | — | — | 318 | 0.171 | (same) | — |
| `fable51` | 6566 | 6035 | 529 | 106 | 17.40 | 70.95 | 1.00 |
| `opus5` | 6562 | 6035 | 525 | 100 | 10.79 | 35.32 | 1.02 |
| `opus48` | 6569 | 6039 | 528 | 132 | 11.60 | 36.14 | 1.02 |
| `opus47` | 6921 | 5972 | 943 | 109 | 15.17 | 37.32 | 1.02 |
| `opus46` | 4970 | 4262 | 705 | 142 | 12.74 | 28.40 | 1.02 |
| `sonnet5` | 6604 | 6010 | 592 | 106 | 4.63 | 14.27 | 1.02 |
| `sonnet46` | 4972 | 4262 | 707 | 135 | 7.55 | 16.94 | 1.02 |
| `haiku45` | 5618 | 4673 | 935 | 599 | 5.34 | 8.61 | 1.02 |
| `fable51-nothink` | 6566 | 6564 | 0 | 102 | 6.76 | 70.76 | 1.02 |
| `opus5-nothink` | 6695 | 6166 | 526 | 100 | 10.85 | 35.96 | 1.02 |
| `opus48-nothink` | 6569 | 6039 | 528 | 105 | 10.94 | 35.48 | 1.02 |
| `opus47-nothink` | 6921 | 5972 | 943 | 109 | 15.17 | 37.33 | 1.02 |
| `opus46-nothink` | 4970 | 4262 | 705 | 124 | 12.30 | 27.96 | 1.02 |
| `sonnet5-nothink` | 6604 | 6010 | 592 | 142 | 5.00 | 14.63 | 1.02 |
| `sonnet46-nothink` | 4972 | 4262 | 707 | 87 | 6.84 | 16.23 | 1.02 |
| `haiku45-nothink` | 5396 | 4658 | 735 | 168 | 2.78 | 6.24 | 1.02 |

Two things to know before using these numbers:

1. **Task-1 prompts do get prompt-cached, unlike task 2's.** PREFLIGHT.md notes that the
   frozen flag set produces "1,343 plain input tokens, 0 cached" — that was measured on the
   short task-2 prompt. Task 1 carries the 36-option catalogue (~6,600 tokens), which the
   API caches: in the pilot ~90% of input tokens per call were cache **reads**, at 0.1x
   input. The "$/1k if nothing cached" column is the upper bound if that stops happening.
   The measured column depends on run shape (4 processes in flight, one system at a time,
   continuous), so it holds for the full run but not for a stop-start one.
2. **`fable51`'s cache-read rate is an open question** and it is now material.
   `harness/schemas.py` uses 0.25/Mtok for Fable 5.1 cache reads because the WP1 brief says
   so; every other model uses 0.1x input (1.00/Mtok for Fable). WP1 flagged it as near-moot
   on the grounds that nothing would be cached. On task 1 almost everything is, so the
   choice moves Fable's notional full-run cost between roughly $9 and $24. **Decision needed
   from Justin** (§6).

The CLI's own Haiku side call adds a flat ~$1.02 per 1,000 calls on every Claude system. It
is booked separately (`usage.overhead_cost_usd_list`) and never attributed to the model
under test, per WP1's finding 1.

## 4. Jev full run — 1,000 cases x 3 reps

`results/task1/jev/`, logged in `results/RUNLOG.md`. 3,000 rows, **0 errors, 0 refusals, 0
pauses**, 62 s of wall time for the whole thing.

| rep | rows | acc (strict, all 1,000) | p50 ms | p95 ms | real charge |
|---|---:|---:|---:|---:|---:|
| 1 | 1000 | 0.935 [0.919, 0.949] | 517 | 907 | $0.1713 |
| 2 | 1000 | 0.935 [0.919, 0.949] | 545 | 971 | $0.1713 |
| 3 | 1000 | 0.937 [0.921, 0.951] | 686 | 1176 | $0.1713 |

Run-to-run spread on the headline is 0.2 points, which is reassuring given PREFLIGHT.md
found Jev non-deterministic at the single-call level (0.70 vs 0.68 on the same body).
These are all 1,000 cases. On the test split that WP4 committed mid-pilot, all three reps
give 0.939 [0.920, 0.956] (n = 700, `metrics.py --split test`).

**OpenRouter cash.** **$0.5242 for this work package** (smoke $0.0017 + pilot $0.0086 +
full run $0.5140), summed from each response's `usage.cost`. Cross-checked against
`/api/v1/credits`: `total_usage` has moved $0.5248 since the WP0 probe, the extra $0.0005
being the three Jev rows in `results/smoke/` that WP1 wrote. Cumulative spend for the whole
eval is **$0.5342 of the $10 ceiling**; the WP5 brief's $1 limit holds with $0.48 to spare.

## 5. Extrapolation to the full task-1 plan

PLAN.md §7 for task 1, Claude only: 1,000 cases x 16 systems at rep 1, plus the 200-case
variance subset at reps 2 and 3 = 1,400 calls per system, **22,400 Claude calls**. Scaled
from the pilot's measured per-call tokens, cost and throughput.

| system | calls | input Mtok | output Mtok | notional $ | side-call $ | wall (h) |
|---|---:|---:|---:|---:|---:|---:|
| `fable51` | 1400 | 9.2 | 0.148 | 24 | 1.4 | 0.40 |
| `opus5` | 1400 | 9.2 | 0.140 | 15 | 1.4 | 0.43 |
| `opus48` | 1400 | 9.2 | 0.184 | 16 | 1.4 | 0.54 |
| `opus47` | 1400 | 9.7 | 0.152 | 21 | 1.4 | 0.72 |
| `opus46` | 1400 | 7.0 | 0.199 | 18 | 1.4 | 1.01 |
| `sonnet5` | 1400 | 9.2 | 0.148 | 6 | 1.4 | 0.66 |
| `sonnet46` | 1400 | 7.0 | 0.188 | 11 | 1.4 | 0.84 |
| `haiku45` | 1400 | 7.9 | 0.838 | 7 | 1.4 | 1.26 |
| `fable51-nothink` | 1400 | 9.2 | 0.143 | 9 | 1.4 | 0.47 |
| `opus5-nothink` | 1400 | 9.4 | 0.139 | 15 | 1.4 | 0.37 |
| `opus48-nothink` | 1400 | 9.2 | 0.147 | 15 | 1.4 | 0.40 |
| `opus47-nothink` | 1400 | 9.7 | 0.152 | 21 | 1.4 | 0.62 |
| `opus46-nothink` | 1400 | 7.0 | 0.174 | 17 | 1.4 | 1.03 |
| `sonnet5-nothink` | 1400 | 9.2 | 0.199 | 7 | 1.4 | 0.75 |
| `sonnet46-nothink` | 1400 | 7.0 | 0.122 | 10 | 1.4 | 0.55 |
| `haiku45-nothink` | 1400 | 7.6 | 0.236 | 4 | 1.4 | 0.75 |
| **total (16 Claude systems)** | **22400** | **136** | **3.31** | **218** | **23** | **10.8** |

- **Notional list cost ~$218** for task 1's Claude half (plus ~$23 of CLI side calls). Not
  paid — it runs on the subscription. PLAN.md §9 estimated ~$150 for *both* tasks, so that
  estimate was low, mostly because the catalogue makes task-1 prompts ~6,600 tokens rather
  than the 2,300 + 1,300 assumed.
- **Jev's task-1 half is already done** and cost $0.51 in real money.
- **Wall time ~11 hours** at the pilot's throughput (4 processes per system, one system at a
  time), assuming no usage-limit pause. The pilot did 800 Claude calls in 23 minutes.
- **Usage windows: no pause was hit, so the window size is still unmeasured.** The pilot
  consumed 800 calls / 4.87M input tokens (90% cache reads) / 118k output tokens in 23
  minutes of one 5-hour window without a limit response. The full task-1 plan is 28x that —
  136M input tokens — so pauses are likely, but the pilot gives only a lower bound
  (>= 800 calls at this size per window), not an estimate of how many windows the run needs.
  The runner pauses and resumes correctly, and `run_meta.json` logs every pause; expect the
  full run to span more than one window even though its raw compute is ~11 hours.

Per-system wall time in the pilot, oldest models slowest: `haiku45` 161 s, `opus46-nothink`
132 s, `opus46` 129 s, `sonnet46` 108 s, `sonnet5-nothink` 97 s, `haiku45-nothink` 96 s,
`opus47` 93 s, `sonnet5` 85 s, `opus47-nothink` 80 s, `sonnet46-nothink` 70 s, `opus48` 69 s,
`fable51-nothink` 60 s, `opus5` 55 s, `opus48-nothink` 51 s, `fable51` 51 s,
`opus5-nothink` 48 s. **No usage-limit pause in any system** (`pauses: []` in all 17
`run_meta.json`).

## 6. Status and what is needed from Justin

**Done:** smoke (18 systems), pilot (17 systems, 50 cases), Jev full task-1 run (3 reps).
Zero errors, zero refusals, zero pauses anywhere. Nothing hit a stop rule.

**Not done, deliberately:** the Claude full runs (WP6, launched separately), task 2 (data
not ready), and anything that depends on `data/splits.json` (WP4).

**Decisions wanted:**

1. **Fable 5.1's cache-read rate** — 0.25/Mtok as the WP1 brief states, or 1.00/Mtok (0.1x
   input) as every other model in the table uses? It changes Fable's notional task-1 cost
   from ~$24 to ~$9 and it is no longer a rounding error now that task-1 prompts cache.
2. **Rerun policy after the WP4 audit.** The Jev full run and the pilot are bound to the
   dataset sha256 above. If the audit regenerates cases, the cheap fix is to rerun Jev
   entirely ($0.51, one minute); for Claude, rerunning only the changed case ids is the
   sensible route, and the harness's `(case_id, rep)` resume makes that a matter of deleting
   those rows.
3. **Go / no-go on WP6 task-1 Claude runs** at ~11 hours of wall time, ~$218 notional, and
   an unknown number of usage windows — and the hours in which they may run, since they will
   compete with interactive use.
