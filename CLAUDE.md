# Jev — Jev vs Claude evaluation

Standalone eval repo, run for a product repo that is not part of it. Owner: Justin.

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
.env         OPENROUTER_API_KEY, optional TYPESAFE_API_KEY — never committed. No Anthropic key: Claude runs via `claude -p` on the subscription
.venv/       Python 3.11 (`/usr/local/bin/python3.11`), deps pinned in requirements.txt
```

## Rules

- **Any animation, video, chart or diagram follows `docs/adr/0001-animation-and-diagram-design.md`.** Read it before touching `viz/` or proposing a visual.


- Read `PLAN.md` before touching anything. Model ids, thinking/effort configs and API rules are in §2 and are not
  negotiable per model: if the API rejects something, fix the harness, never the matrix.
- Secrets come from `.env` at the repo root only. Never commit `.env` or any key. Never accept a key pasted in chat; Justin edits `.env` himself.
- Claude models are called through the Claude Code CLI on Justin's subscription with the frozen flag set in PLAN §6. No Anthropic SDK, no API key. Log tokens and durations on every call; dollar costs are notional list prices.
- No real client, prospect or employee text in `data/`. Domain-realistic cases are synthesised.
- The product repo was a read-only input (an internal planning document, the product specs and a content
  folder) and nothing of it is vendored here. The only write back to it was the WP8 summary, committed there
  separately.
- Spending: only OpenRouter (Jev) costs cash, ceiling $10 (PLAN §9). The real constraint is subscription usage windows; long runs pause on a limit and resume, and run only in approved hours.
- Results are small JSONL and are committed after each system (WP6).
- Work packages run in the order of PLAN §10; WP1, WP2, WP3 in parallel. Justin signs `data/SIGNOFF.md` before any
  paid run and gives the go on the pilot cost before WP6.

## Status

Planned 2026-09-22. Claude half of WP0 preflight done the same day (`PREFLIGHT.md`): all eight Claude ids served
through the subscription. Next: Justin puts an OpenRouter API key in `.env`, then the WP0 Jev-half subagent.
