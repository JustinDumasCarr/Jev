# Jev — Jev vs Claude evaluation

Standalone eval repo. Sibling of `../Arianne2026` (the product repo the eval is for). Owner: Justin.

## What this is

Measures TypeSafe's Jev (`jev-1.13.0`, via OpenRouter `typesafe/jev-1.13`) against every current Claude model on two
decision tasks — skill/agent routing and prompt-injection validation — on 1,000 labelled cases each, and answers
"which Claude model is Jev as good as". Full design in `PLAN.md`; one paste-ready brief per work package in
`SUBAGENT-BRIEFS.md`; vendor background in `reference/JEV-RESEARCH-2026-09-22.md`.

## Layout

```
PLAN.md  SUBAGENT-BRIEFS.md  PREFLIGHT.md  REPORT.md      (the last two are produced by WP0 and WP8)
reference/   JEV-RESEARCH-2026-09-22.md
data/        catalogue.json  task1_cases.jsonl  task2_cases.jsonl  splits.json  SIGNOFF.md   (WP2–WP4)
harness/     run.py  adapters/  prefilter.py  prompts/  schemas.py  metrics.py  report.py   (WP1)
results/     <task>/<system>/results.jsonl  errors.jsonl  run_meta.json                   (WP5–WP7)
.env         ANTHROPIC_API_KEY, OPENROUTER_API_KEY, optional TYPESAFE_API_KEY — never committed
.venv/       Python 3.11 (`/usr/local/bin/python3.11`), deps pinned in requirements.txt
```

## Rules

- Read `PLAN.md` before touching anything. Model ids, thinking/effort configs and API rules are in §2 and are not
  negotiable per model: if the API rejects something, fix the harness, never the matrix.
- Secrets come from `.env` at the repo root only. Never commit `.env` or any key.
- No real client, prospect or employee text in `data/`. Domain-realistic cases are synthesised.
- Arianne2026 is a read-only input: `../Arianne2026/.planning/HUB-PLAN.md`, `../Arianne2026/.planning/specs/`,
  `../Arianne2026/content/`. The only writes to Arianne2026 are the ones `SUBAGENT-BRIEFS.md` names explicitly
  (the WP8 summary in `../Arianne2026/reports/`), committed there separately.
- Spending: each brief carries a cost ceiling; total ceiling $250 (PLAN §9). Stop and report before exceeding.
- Results are small JSONL and are committed after each system (WP6).
- Work packages run in the order of PLAN §10; WP1, WP2, WP3 in parallel. Justin signs `data/SIGNOFF.md` before any
  paid run and gives the go on the pilot cost before WP6.

## Status

Planned 2026-09-22. Nothing run yet. Next: WP0 human steps (OpenRouter key, Anthropic retention check), then
WP0 preflight subagent.
