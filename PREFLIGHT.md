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

## Jev half — pending

Needs `OPENROUTER_API_KEY` in `.env`, then the WP0 Jev-half subagent brief in `SUBAGENT-BRIEFS.md`.
