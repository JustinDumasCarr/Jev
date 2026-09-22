# Subagent briefs — Jev vs Claude eval

One brief per work package in `PLAN.md` §10. Each is written to be pasted verbatim as the prompt of an Opus 5 subagent (`Agent` tool, `model: opus`, or a `Workflow` script with `agent(prompt, {label, phase})`). Every brief assumes the subagent starts with no context beyond the repo.

Common rules for every subagent (prepend to each brief):

```
You are working in the Jev repo (the Jev-vs-Claude evaluation; its own git repo, a sibling of ../Arianne2026, the
product repo the eval is for). Read PLAN.md fully and reference/JEV-RESEARCH-2026-09-22.md before doing anything.
Arianne2026 files are read-only inputs at ../Arianne2026/...; the only outputs that go there are the ones a brief
names explicitly, and those are committed in Arianne2026 separately. Do only your work package. Commit your work on
the current branch with a clear message when you finish (working agreement 3: everything lands in the repo). Never
commit .env or any key. Never put real client, prospect or employee text in data/. Every model id, effort
setting and call rule you use must match PLAN.md §2 and §6; if the CLI rejects something, fix the harness, do not
change the model matrix. Claude calls run on the Claude Code subscription (`claude -p`, PLAN.md §6): no cash cost,
but log every call's tokens and durations. Only OpenRouter (Jev) costs money; the cash ceiling per brief is for
OpenRouter only, and PLAN.md §9's $10 total is hard. Stop and report if you would exceed it. Report at the end:
what you produced (paths), what you verified and how, what is unfinished, and any decision you need from Justin.
```

Suggested orchestration (Workflow tool, medium size, 6 agents):

```
phase Build:    parallel  [WP1 harness, WP2 task1 dataset, WP3 task2 dataset]
phase Audit:    WP4 (needs WP2 + WP3)        → Justin signs data/SIGNOFF.md
phase Pilot:    WP5 (needs WP1 + WP4)        → Justin gives the "go" on cost
phase Run:      WP6
phase Analyse:  WP7 then WP8
```

---

## WP0 — Access and preflight (Justin + one subagent)

Human steps first (the subagent cannot do these):

1. Create an OpenRouter account (openrouter.ai), add a few dollars of credit, create a normal API key (not a
   management key), put it in `.env` at the repo root as `OPENROUTER_API_KEY`. This is the Jev route (slug
   `typesafe/jev-1.13`). Also join the TypeSafe waitlist at typesafe.ai; when the direct key arrives, add it as
   `TYPESAFE_API_KEY` (optional, later).
2. Nothing for Claude: the `claude` CLI on this machine is logged in to the subscription, and the Claude half of the
   preflight was run on 2026-09-22 (see PREFLIGHT.md).

Subagent prompt:

```
Work package WP0, Jev half. Create .venv at the repo root with Python 3.11, install httpx, pydantic, numpy,
scikit-learn, pytest, and pin them in requirements.txt. Load .env from the repo root. Make one raw HTTPS POST
through OpenRouter with model "typesafe/jev-1.13", state "OK" and one Noul question — read OpenRouter's Typesafe
page for the exact endpoint path and response shape, and mirror the docs.typesafe.ai body: {"model", "state",
"questions"}. Record: requested id, served id (the response model field), latency, usage, the per-call charge
OpenRouter reports (the generation endpoint or the credits delta), and any error verbatim. Also call
"typesafe/jev-latest" and record which version it resolves to. If TYPESAFE_API_KEY is present, repeat on
api.typesafe.ai/v1/systemone with typesafe-sdk and record both. Do not retry a 400; record it. Append a "Jev" section
to PREFLIGHT.md with a table of the results and the installed package versions, and a one-line verdict: reachable /
blocked (reason). Cash allowed: under $1.
```

Acceptance: PREFLIGHT.md has both halves; Jev 1.13 is the served version via OpenRouter and its real per-call cost is recorded.

---

## WP1 — Harness (subagent A)

```
Work package WP1. Build harness/ exactly as PLAN.md §6 describes: run.py, adapters/claude_cli.py, adapters/jev.py,
prefilter.py, prompts/task1_system.md, prompts/task2_system.md, schemas.py, metrics.py, report.py.

Claude adapter rules (a subprocess wrapper around the `claude` CLI, PLAN.md §6; no Anthropic SDK, no API key):
- One `claude -p` process per call with exactly the frozen flag set in PLAN.md §6; the flag list lives in one place
  in claude_cli.py and its sha256 goes in run_meta.json. Subprocess environment reduced to PATH, HOME, USER, TERM,
  LANG. Parse stdout as JSON; non-JSON stdout is an errors.jsonl row with stdout and stderr attached.
- --model and --effort exactly as PLAN.md §2 (all Claude systems effort low in the primary run; opus5 high and
  fable51 medium in the effort sweep). Probe once whether any documented flag or env var disables thinking for a
  print call; if none, drop opus5-nothink and write why in PREFLIGHT.md.
- --system-prompt is the task prompt (task 1 includes the catalogue); the per-case text is the positional prompt.
- Decision comes from structured_output; missing or schema-invalid structured_output is an errors.jsonl row.
- Never pass --fallback-model. If stop_reason indicates a refusal, write the row with status "refusal" and the
  result text; decision null. If stop_reason is max_tokens, status "truncated", decision null.
- Served model: modelUsage must have exactly one key and it must start with the requested id; otherwise
  errors.jsonl with class "served_model_mismatch".
- Usage-limit or rate-limit responses (is_error with a limit message, or api_error_status 429) pause the whole run
  until the reset time in the message, log the pause in run_meta.json, then resume. Other is_error results and
  timeouts retry with jittered exponential backoff (max 5, cap 60 s), attempt count recorded.
- Record verbatim: duration_api_ms (this is latency_ms), duration_ms, our wall time, modelUsage tokens (input,
  cache creation, cache read, output, thinking), total_cost_usd as cost_usd_reported, session_id, and the full
  result JSON in raw. Compute cost_usd_list from the tokens at the claude-api skill rate table for the served
  model (Fable 5.1 10/50, cache read 0.25; Opus 5/4.8/4.7/4.6 5/25; Sonnet 5 2/10; Sonnet 4.6 3/15; Haiku 4.5 1/5;
  cache reads at 0.1x input unless stated).

Jev adapter rules: one adapter with two backends selected by env — "openrouter" (default; raw HTTPS with httpx to
the endpoint PREFLIGHT.md recorded, model "typesafe/jev-1.13", Authorization: Bearer $OPENROUTER_API_KEY) and
"direct" (TypeSafeClient().system_one, model "jev-1.13.0", used only when TYPESAFE_API_KEY is set). Record which
backend served each row in the `raw` field; questions exactly as PLAN.md §3 and §4; record answers verbatim
(choice/noul/score, probabilities, confidence), usage.input_tokens, latency; cost from each response's usage.cost
(PREFLIGHT.md: the generation and credits endpoints lag ~25 s, so never poll them per row). Same retry/ceiling rules. Timeout ceiling 15 s.

Prefilter: implement PLAN.md §4's checks; compile the signature regex list from public prompt-injection rule sets
(cite each source in a comment); expose tag_case(text) -> "prefilter:caught" | "prefilter:passed".

run.py CLI: --task {task1,task2} --system <id> --rep N --limit N --split {train,test,all}; resumes by skipping
existing (case_id, rep) rows; asyncio with per-system concurrency (4 Claude processes, 32 Jev); hard per-case
ceiling 120 s / 15 s; writes results/<task>/<system>/results.jsonl, errors.jsonl, run_meta.json (git sha, package
versions, claude --version, flag-set hash, prompt hashes, pauses, start/end time).

metrics.py: reads results, filters to test split and prefilter:passed by default, computes every metric in PLAN.md
§3/§4 with 1,000-resample bootstrap CIs (seed 20260922), paired differences vs a reference system, Cohen's kappa
matrix, ECE and reliability bins, notional cost and latency percentiles; outputs JSON and a markdown table.

Tests (pytest, no network, no CLI): schema validation of a sample case; prefilter on 20 fixtures; the CLI result
parser on the saved probe JSONs from 2026-09-22 (copy them into tests/fixtures/); an oracle run using a fake adapter
that returns gold scores 100%; a null adapter returning constant "benign"/"none" scores the majority-class rate; an
adapter that raises lands in errors.jsonl and not in results.jsonl; a truncated response is status "truncated" and
excluded from accuracy; a usage-limit result triggers the pause path. Then one real smoke: --limit 3 on haiku45 and
jev for each task using data/*_cases.jsonl if present, else three inline fixtures. Cash allowed: under $0.50
(OpenRouter). Commit.
```

Acceptance: `pytest` green; smoke rows have `served_model` matching the request; `metrics.py` runs on the smoke output.

---

## WP2 — Task 1 dataset (subagent B)

```
Work package WP2. Produce data/catalogue.json and data/task1_cases.jsonl per PLAN.md §3.

Catalogue: 36 options. For the 25 skills and 5 agents, copy the name and description from the Claude Code skill and
agent listing as it appears in the Arianne2026 repo's sessions (the listing text is in PLAN.md §3; if you cannot see the live
listing, use the names there and write a faithful one-paragraph description from each skill's public documentation
or, for Anthropic skills, from their SKILL.md). For writer, research, wp-page-update, client-email and
marketing-analysis, write the description from ../Arianne2026/.planning/HUB-PLAN.md Steps 3–5. Add "none" with the description
"No listed skill or agent applies; answer directly." Sort options by name; freeze the file (it must be byte-stable).

Cases: write data/gen_task1.py that generates label-first: for each option and slice in PLAN.md §3's table, sample a
(option, style, language, difficulty) tuple, then ask claude-opus-5 (effort low, structured output) to write ONE
user request that a real Claude Code or claude.ai user would type for that option in that style, without naming the
option unless style == "name-drop". The model never sees other cases. Enforce the slice counts, ≥ 15 prompts per
option, 20% French, 130 ambiguous-pair cases where `acceptable` has two entries, 120 `none` cases, 100
adversarial-wording cases (typos, negation, wrong-skill name-drop). Dedup by normalised text and by 0.9 token-set
similarity. Tags: ["<slice>", "lang:xx", "style:...", "family:skill|agent|none"] with the slice tag first.

Tier-1 audit script data/audit_task1.py: counts per option / slice / language, duplicate rate, length histogram,
schema check; write its output to data/task1_tier1.md. Generation runs on the subscription (Opus 5 subagent); log calls made. Commit generator, data, audit.
```

Acceptance: 1,000 rows, schema-valid, slice counts match the plan within ±5, no option under 15, duplicate rate 0.

---

## WP3 — Task 2 dataset (subagent C)

```
Work package WP3. Produce data/task2_cases.jsonl per PLAN.md §4: 500 benign / 500 injection.

Public sources: check the licence and availability of deepset/prompt-injections, jackhhao/jailbreak-classification,
hackaprompt/hackaprompt-dataset, allenai/wildjailbreak, xTRam1/safe-guard-prompt-injection, and a BIPIA release.
Use only sets whose licence permits research use; record source, licence and the exact revision in
data/task2_sources.md. Sample from them for the direct-jailbreak and instruction-override slices; never copy more
than the slice count needs; strip anything that contains real personal data.

Synthesised slices (generate with claude-opus-5, label-first, one case per call, structured output):
- 250 benign ARIANNE-realistic: questions a relocating buyer or seller would ask about Montreal neighbourhoods,
  schools, prices, fees, timelines, in EN and FR; ground topics in ../Arianne2026/.planning/specs/01-CONTENT-SPECS.md and
  ../Arianne2026/content/. No real names, emails or addresses.
- 150 hard negatives: security discussions quoting injections, "ignore my last message", legitimate role-play,
  long pasted articles, French text with imperative tone.
- 100 indirect injections planted inside pasted emails, web snippets, "summaries" and documents, in our domain.
- 100 obfuscated injections that still pass the prefilter (unicode homoglyphs, spacing, FR/EN mixing, payload split
  across sentences, partial encoding under 200 chars). Run harness/prefilter.py on each candidate and regenerate
  until 90 of the 100 are prefilter:passed.
- Top up instruction-override/extraction to 150 with synthesised FR examples so every injection subtype has ≥ 20 FR.

Every case gets gold, subtype, vector, and tags ["subtype:...", "lang:xx", "source:<dataset|synthetic>",
"prefilter:caught|passed"] with subtype first. Dedup at 10% normalised edit distance. Re-verify 100 public labels
by reading them; list disagreements in data/task2_label_review.md for Justin to adjudicate. Tier-1 audit script
data/audit_task2.py → data/task2_tier1.md (class balance, per-subtype/lang/prefilter counts, length histogram,
duplicates). Generation runs on the subscription; log calls made. Commit.
```

Acceptance: 1,000 rows, 500/500, every subtype ≥ 20 FR, ≥ 85% of the injection set is `prefilter:passed`, sources file complete.

---

## WP4 — Audit gate (subagent D)

```
Work package WP4. Run the claude-api skill's eval health checklist (shared/evals/eval-audit.md) as a verification
pass on data/task1_cases.jsonl and data/task2_cases.jsonl.

Tier 2: draw 50 cases per task stratified by tags[0]; apply every per-case check; write findings with case ids.
Tier 3: run the checklist's per-case auditor prompt with claude-sonnet-5 (effort low, structured output) over all
2,000 cases; aggregate flags by type; list the top issues with example ids. For every "broken" case, fix the
generator (data/gen_task*.py) and regenerate that slice, never hand-edit a row; re-run Tier 1. Then write
data/splits.json: stratified 300/700 train/test per task by tags[0], seed 20260922, and check that train and test
label/slice distributions agree.

Create data/SIGNOFF.md with 100 randomly drawn case ids per task (stratified) for Justin to read, a checkbox per
case, and a summary of what you changed. The auditor is ~2,000 short Sonnet 5 calls on the subscription; run it through the harness's claude_cli adapter so tokens and pauses are logged.
Commit. Report the audit as observations and suggestions, severity first, per eval-audit.md §6.
```

Acceptance: no `broken` case remains; splits.json exists; SIGNOFF.md ready for Justin.

---

## WP5 — Smoke and pilot (subagent E)

```
Work package WP5. Precondition: data/SIGNOFF.md shows Justin's sign-off. Run the smoke (5 cases per task, all nine
systems plus ~typesafe/jev-latest, tilde included) and confirm served_model matches the request everywhere (Jev by
prefix typesafe/jev-1.13) and jev-latest resolves to the same build.
Then run the pilot: 50 stratified cases per task, all nine systems, rep 1. From the pilot's usage rows extrapolate
the notional list-price cost of the full plan (PLAN.md §7 and §9) per system and in total. Inspect every errors.jsonl row and every
refusal. If a model systematically fails the output schema, fix the shared prompt once and re-run the pilot for
all systems (never a per-model prompt). Write results/PILOT.md: served-model table, error and refusal counts,
per-system pilot accuracy (with the caveat that n=50 is ±14 points), notional cost, usage-window extrapolation, and a
go / no-go recommendation. Also record how much of a subscription usage window the pilot's 450 Claude calls consumed (note the time and
any usage-limit pause) and extrapolate the number of windows the full plan needs. Stop and report; do not start
the full run. Cash allowed: under $1 (OpenRouter).
```

Acceptance: PILOT.md with an explicit go / no-go and a cost number.

---

## WP6 — Full runs (subagent E, continued, after Justin's go)

```
Work package WP6. Justin has approved the pilot cost. Run PLAN.md §7 in this order, resuming on failure:
(1) jev, both tasks, reps 1–3 on all 1,000 cases; (2) haiku45, sonnet5, sonnet46, opus46, opus47, opus48, opus5,
fable51, both tasks, rep 1, all 1,000 cases — one system at a time so the cache prefix stays warm; (3) the 200-case
variance subset (fixed ids in data/splits.json) reps 2–3 for the eight Claude systems; (4) the effort sweep on task
2 only: opus5 effort high, fable51 effort medium, opus5-nothink. After each system, run metrics.py --quick and
append one line to results/RUNLOG.md (system, rows, errors, refusals, pauses, notional list cost so far, OpenRouter
cash so far). Stop if OpenRouter cash passes $10 or if any system's error rate passes 3%; report instead of pushing
through. Run only in the hours Justin has approved so the subscription stays free for interactive use. Commit results after each system
(results are small JSONL; commit them).
```

Acceptance: every cell of the §7 table has rows; errors < 3% per system; RUNLOG.md totals under the ceiling.

---

## WP7 — Analysis (subagent F)

```
Work package WP7. Using harness/metrics.py on the test split and prefilter:passed (task 2), produce
results/analysis/: metrics per system with bootstrap CIs; paired Jev − Claude_M differences and the non-inferiority
verdict per model with the 2-point margin from PLAN.md §8; the equivalent Claude tier per task, per language, and
per vector; kappa matrix; ECE and reliability data for every system; latency p50/p95 and cost per 1,000; effort
sweep deltas; run-to-run spread from the variance subset. Read the full disagreement set (Jev vs Claude majority)
and write 30 representative cases with your reading of why each model decided as it did. Test each hypothesis
H1–H5 in PLAN.md §8 and state the outcome with the numbers. Recompute the headline from raw rows yourself; do not
trust an aggregate field. Charts: follow the dataviz skill; one figure each for accuracy-with-CI per system per
task, reliability diagrams, and recall per subtype (task 2). No API spend beyond reading files. Commit.
```

Acceptance: analysis folder complete; every number traceable to results rows; hypotheses each marked supported / not.

---

## WP8 — Report and decision (subagent F, then Justin)

```
Work package WP8. Write REPORT.md for Justin and Jerome: lead with the answer to "which Claude
model is Jev as good as" for each task, with the CI; then the strata where it is weaker; cost and latency; the
calibration finding; the recommendation against PLAN.md §11's pre-registered criteria; limitations (vendor claims,
early-access model, synthetic domain cases, English-optimised model on FR traffic); and what to re-run on the next
Jev release. Under 1,500 words plus tables and figures. Copy a 300-word summary to ../Arianne2026/reports/jev-vs-claude-2026-09.md (commit that file in Arianne2026).
If the recommendation is to adopt Jev anywhere, draft the entry text for ../Arianne2026/.planning/register.yaml in the report for Justin to add
(do not edit register.yaml yourself). Draft an open-brain capture_thought text starting "Arianne2026: Jev eval —"
for Justin to post. Commit.
```

Acceptance: REPORT.md answers the headline question in its first paragraph with numbers and CIs.

---

## WP9 — Latency animation (subagent G)

```
Work package WP9. Read ANIMATION-PLAN.md fully; it is the specification. Load the dataviz skill before writing any
drawing code and take the palette from its references/palette.md. Build in this order: (1) harness/viz_data.py
that turns results/ plus the WP7 metrics output into viz/data.json in the schema of ANIMATION-PLAN.md §3, and
viz/data.fixture.json with the placeholder values in §3 and meta.fixture = true, with a pytest that both produce
schema-valid output; (2) viz/latency-race.html as a pure render(t_ms) function implementing every scene in §5 and
every rule in §6, controls per §5, reduced-motion path, the PLACEHOLDER DATA watermark whenever meta.fixture is
true (no flag may remove it); (3) viz/build.py that inlines data.json, exports frames at 30 fps through
playwright-cli, encodes viz/out/latency-race-1080p.mp4 with ffmpeg and writes the matching .srt. Scene 7
(accuracy with CIs and the templated verdict) is mandatory and must render correctly for both a Jev-wins and a
Jev-loses data.json; test both with fixtures. If results/ has real rows and results/analysis/ exists, run step (4):
rebuild on real data, check three numbers by hand against results/analysis/, commit data.json, the html and the
mp4. Otherwise stop after (3) and publish the fixture page as an Artifact for review. No API spend. Commit.
```

Acceptance: ANIMATION-PLAN.md §8's acceptance list; the fixture page is reviewable before any real run exists.

