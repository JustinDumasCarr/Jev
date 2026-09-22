# Preflight

## Claude half — done 2026-09-22

**Route:** `claude -p` on Justin's Claude Code subscription (CLI 2.1.276, auth method `claude.ai`, provider `firstParty`), launched from inside a Claude Code desktop session. No Anthropic API key.

**Probe:** one prompt-injection classification per model, `--effort low`, own `--system-prompt`, `--tools ""`, `--json-schema` with `{verdict, p_injection}`, `--output-format json`, four processes in parallel. Raw result JSONs are in `tests/fixtures/claude_cli_probe_2026-09-22/` (this probe still carried Claude Code's default ~45k-token prefix; the frozen flag set below removes it).

| Requested | Served (`modelUsage` key) | Match | API ms | CLI ms | in | cache write | out | thinking | list cost $ | structured_output |
|---|---|---|---|---|---|---|---|---|---|---|
| `claude-fable-5-1` | `claude-fable-5-1` | yes | 1964 | 2975 | 2 | 45859 | 80 | 0 | 0.921 | `{"verdict": "injection", "p_injection": 0.99}` |
| `claude-opus-5` | `claude-opus-5` | yes | 1980 | 2989 | 2 | 45850 | 80 | 0 | 0.461 | `{"verdict": "injection", "p_injection": 0.99}` |
| `claude-opus-4-8` | `claude-opus-4-8` | yes | 4062 | 5031 | 2 | 45861 | 121 | 40 | 0.462 | `{"verdict": "injection", "p_injection": 0.99}` |
| `claude-opus-4-7` | `claude-opus-4-7` | yes | 2649 | 3894 | 6 | 45721 | 96 | 0 | 0.460 | `{"verdict": "injection", "p_injection": 0.99}` |
| `claude-opus-4-6` | `claude-opus-4-6` | yes | 4073 | 5046 | 3 | 32871 | 76 | 0 | 0.331 | `{"verdict": "injection", "p_injection": 0.99}` |
| `claude-sonnet-5` | `claude-sonnet-5` | yes | 1517 | 2375 | 2 | 45406 | 80 | 0 | 0.182 | `{"verdict": "injection", "p_injection": 0.98}` |
| `claude-sonnet-4-6` | `claude-sonnet-4-6` | yes | 2713 | 3607 | 3 | 32721 | 94 | 16 | 0.198 | `{"verdict": "injection", "p_injection": 0.99}` |
| `claude-haiku-4-5` | `claude-haiku-4-5` | yes | 3367 | 4357 | 10 | 33044 | 215 | 138 | 0.067 | `{"verdict": "injection", "p_injection": 0.98}` |

Verdict: all eight reachable, all served ids match, structured output parsed on every model, `--effort low` accepted everywhere (including Haiku). Fable 5.1 works through the subscription, so the API's 30-day-retention requirement is moot here.

**Prefix reduction (Haiku, same prompt).** Claude Code injects its own system prompt, memory, skills and MCP tools unless told not to. Total input tokens per call by flag set:

| Flags | total input tokens | of which cache read | API ms |
|---|---|---|---|
| own system prompt, no tools | 46038 | 41934 | 4147 |
| + `--setting-sources ""` | 30510 | 28923 | 3461 |
| + empty MCP config, skills and Chrome off (frozen set) | 1343 | 0 | 4136 |
| frozen set, subprocess env reduced to PATH/HOME/USER/TERM/LANG | 907 | 0 | 4225 |

The frozen set for the harness (PLAN.md §6) is the third row: about 1,300 tokens, none of it Claude Code context, no cache dependence. `--bare` would strip further but returns `Not logged in · Please run /login` when launched from inside a session, under a clean environment too (`haiku-bare-not-logged-in.json`); not used.

**What the result JSON gives us per call** (all recorded by the harness): `duration_api_ms`, `duration_ms`, `stop_reason`, `is_error`, `api_error_status`, `structured_output`, `result`, `session_id`, `total_cost_usd` (list price), and `modelUsage[<served id>]` with `inputTokens`, `cacheCreationInputTokens`, `cacheReadInputTokens`, `outputTokens`, `thinkingTokens`, `canonicalModel`, `costUSD`, `costBasis`.

**Not yet known:** whether thinking can be disabled for a print call (decides `opus5-nothink`); how many calls a subscription usage window allows at this size (the pilot measures it).

## Jev half — done 2026-09-22

**Route:** OpenRouter's **Decisions API** (alpha), not chat completions. Slug `typesafe/jev-1.13` (pinned) and the
rolling alias `~typesafe/jev-latest` (tilde prefix — OpenRouter's alias convention; the bare `typesafe/jev-latest`
in PLAN.md §2/§7 and the research note does not exist). Direct TypeSafe route not probed: `TYPESAFE_API_KEY` is
present but empty in `.env` (waitlisted). Raw responses in `tests/fixtures/jev_probe_2026-09-22/`.

**The call that works** (this is what `harness/adapters/jev.py` must use):

```
POST https://openrouter.ai/api/alpha/decisions
Authorization: Bearer $OPENROUTER_API_KEY
Content-Type: application/json

{"model": "typesafe/jev-1.13",
 "state": "OK",
 "questions": {"state_is_ok": {"type": "noul",
                               "instructions": "The state reports that the system is operating normally"}}}
```

`state` takes a string, object or array of strings; `questions` is a dict of named typed questions, each
`{"type": "noul"|"choice"|"score", "instructions": ..., "criteria": ...}` — the same body `docs.typesafe.ai`
documents for `POST https://api.typesafe.ai/v1/systemone`, with an OpenRouter model id in `model`. Chat-completion
SDKs cannot reach it: `/api/v1/chat/completions` is a different endpoint and this model's modality is
`text->decisions`.

**Response shape** (verbatim, call 1):

```json
{"model": "typesafe/jev-1.13-20260917",
 "answers": {"state_is_ok": {"type": "noul", "noul": 0.7}},
 "usage": {"input_tokens": 276, "output_tokens": 22, "cost": 0.000011592},
 "id": "gen-dec-1790078628-xfiq6tsxdwEywmviREJp", "provider": "TypeSafe"}
```

Response headers carry `x-generation-id` (same value as `id`) and `x-provider-name: TypeSafe`.

**Results.**

| # | Requested model | Status | Served (`model`) | Wall ms | OpenRouter `latency` ms | in / out tokens | `usage.cost` $ | answer |
|---|---|---|---|---|---|---|---|---|
| 1 | `typesafe/jev-1.13` | 200 | `typesafe/jev-1.13-20260917` | 403.3 | 270 | 276 / 22 | 0.000011592 | `noul` 0.70 |
| 2 | `typesafe/jev-latest` | **400** | — | 321.7 | — | — | 0 (not billed) | `{"error":{"message":"Model typesafe/jev-latest does not exist","code":400}}` |
| 3 | `~typesafe/jev-latest` | 200 | `typesafe/jev-1.13-20260917` | 689.9 | 280 | 276 / 22 | 0.000011592 | `noul` 0.68 |

Call 2 was not retried (400, per the brief). The alias slug was then read off OpenRouter's own author page
(`Copy: ~typesafe/jev-latest`) and confirmed against `GET /api/v1/models/~typesafe/jev-latest/endpoints`
(`"id": "~typesafe/jev-latest"`, `"endpoints": []`, description "This model always redirects to the latest model in
the Jev family") before call 3 — one documented alternative, not a retry.

**Per-call charge.** `usage.cost` = `input_tokens` x $0.042/M exactly (276 x 4.2e-8 = 1.1592e-05); `output_tokens`
are reported but not billed. Confirmed three ways: the response's `usage.cost`; `GET /api/v1/generation?id=<id>`
(`total_cost` 0.000011592, `native_tokens_prompt` 276, `api_type` "decisions", `model_permaslug`
`typesafe/jev-1.13-20260917`); and the credits delta, `GET /api/v1/credits` `total_usage` 0.009353100 -> 0.009376284,
i.e. **$0.000023184 for two paid calls**, exactly 2 x $0.000011592. Total probe spend: **$0.0000232**.

So the harness cost rule is `cost_usd_list = input_tokens * 4.2e-8`, and `usage.cost` in the response is the
authoritative per-row figure. Note the fixed overhead: a trivial state plus one one-sentence Noul question already
costs 276 input tokens, so short task-2 texts will be dominated by the question wording. Rough projection for
PLAN.md §7 at ~3,500 tokens per task-1 call (36-option catalogue in `Choice.criteria`) and ~600 per task-2 call,
3 reps x 1,000 cases each: about **$0.44 + $0.08 = $0.52**, inside the $10 ceiling with room to spare.

**Other findings.**

- **Served id is the permaslug** `typesafe/jev-1.13-20260917`, not `jev-1.13.0`. The harness's served-model
  assertion for Jev must check `response["model"].startswith("typesafe/jev-1.13")`, not equality with the request.
- **`~typesafe/jev-latest` resolves to `typesafe/jev-1.13-20260917`** — PLAN.md §7's smoke check is satisfied, but
  the id in PLAN.md §2/§7 and in `reference/JEV-RESEARCH-2026-09-22.md` needs the tilde.
- **Not deterministic.** The identical body returned `noul` 0.70 and 0.68 on two calls. The variance reps in
  PLAN.md §7 are therefore measuring real model noise, not just transport noise; thresholds tuned on train must
  not be read to two decimal places.
- **Context is 32,000 tokens on OpenRouter** (`max_completion_tokens` 28800), not the 64k the direct API documents.
  Task-1's catalogue plus a prompt is far inside it.
- **Latency:** ~270-280 ms upstream at TypeSafe, ~400-690 ms wall from this machine including the OpenRouter hop
  and TLS. Both are recorded per row; the report labels Jev latency "via OpenRouter".
- **`/api/v1/generation` and `/api/v1/credits` lag.** The generation lookup 404'd immediately after the call and
  returned 200 about 25 s later; credits lagged similarly. The harness must take cost from the response's
  `usage.cost`, not from a synchronous generation lookup.

**Probe environment.** Throwaway venv in the session scratchpad (the repo's `.venv` and `requirements.txt` belong to
WP1 and were not touched): Python 3.11.15, `httpx==0.28.1`, `python-dotenv==1.2.3`, with `httpcore==1.0.9`,
`h11==0.16.0`, `anyio==4.15.1`, `certifi==2026.7.22`, `idna==3.20`, `typing_extensions==4.16.0`, `pip==26.2.1`.

**Verdict: reachable** — `typesafe/jev-1.13` is served through OpenRouter's Decisions API at $0.042/M input tokens
($0.0000116 for a minimal call), and `~typesafe/jev-latest` resolves to the same pinned build.
