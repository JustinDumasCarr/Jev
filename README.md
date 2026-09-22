# Jev vs Claude eval

Does TypeSafe's Jev — a typed-decision model that returns probabilities instead of text, at roughly 1/100th the
cost and latency of an LLM call — match a Claude model on the two decision points in our stack where that shape
fits: skill/agent routing and prompt-injection validation?

1,000 labelled cases per task, run through Jev 1.13 and nine Claude configurations (Fable 5.1, Opus 5 / 4.8 /
4.7 / 4.6, Sonnet 5 / 4.6, Haiku 4.5), scored on accuracy, precision/recall, calibration, latency and cost, with
a pre-registered 2-point non-inferiority margin. The answer is "which Claude tier Jev is as good as", per task,
per language and per attack vector.

- `PLAN.md` — the full design: systems under test, both tasks, dataset audit gate, harness, runs, analysis,
  budget, work packages, decision rule.
- `SUBAGENT-BRIEFS.md` — one paste-ready prompt per work package (WP0–WP8).
- `reference/JEV-RESEARCH-2026-09-22.md` — what is publicly known about Jev.
- `data/`, `harness/`, `results/` — filled by the work packages.

## Setup

```bash
/usr/local/bin/python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt      # written by WP0
cp .env.example .env                 # then fill in OPENROUTER_API_KEY (Claude runs via the logged-in `claude` CLI)
```

This repo is self-contained. The skill catalogue and the domain vocabulary behind the datasets were drawn from an internal planning document and a content folder in the product repo the eval was run for; neither is part of this repo. Status and
working rules are in `CLAUDE.md`.
