# Latency animation — plan

**Purpose.** One 60–75 second animation that makes the speed gap between Jev and every Claude model *felt*, not read: the viewer waits in real time for the Claude answers after Jev has already returned. It ends on quality, so speed is never shown alone (PLAN.md §8: cost and latency alongside quality, never as a ratio alone). **Status:** planned 2026-09-22, not started. **Work package:** WP9 in `PLAN.md` §10, brief in `SUBAGENT-BRIEFS.md`.

## 1. What the viewer takes away

1. A decision that takes Jev about a tenth of a second takes a Claude model one to several seconds. You sit through that gap once, in real time.
2. That gap is a distribution, not one number: p50 and p95 per system, from 1,000 real cases.
3. Over a batch, the gap compounds into throughput and dollars.
4. And here is what the speed costs in accuracy, per system, with confidence intervals. The verdict shown is whatever `REPORT.md` says, including the strata where Jev is weaker.

## 2. Two deliverables, one codebase

| Deliverable | Path | Use |
|---|---|---|
| Interactive page | `viz/latency-race.html` (single file, data inlined) | Publish as an Artifact for Justin and Jerome; play, pause, scrub, change speed, hover any bar for the exact numbers and n. |
| Video | `viz/out/latency-race-1080sq.mp4` (1080×1080, 30 fps) **and** `viz/out/latency-race-1080p.mp4` (1920×1080) | **LinkedIn is the primary destination (Justin, 2026-09-22): the square cut is designed first**, the 16:9 cut is for slides and the report. Same `render(t)` with a layout switch. |

The page is written as a pure function of time: `render(t_ms)` draws the frame for that instant, and playback just advances `t`. The video is produced by stepping `t` frame by frame in a headless browser (`playwright-cli`, one screenshot per frame) and encoding with `ffmpeg`. One codebase, so the video and the page can never disagree.

## 3. Data

Everything on screen comes from `viz/data.json`, produced by `harness/viz_data.py` from `results/` and the WP7 metrics output. Nothing is typed by hand.

Per system (all 17 primary systems in PLAN.md §2; which ones are drawn in which cut is decision D6; the effort sweep is excluded):

```json
{"system": "sonnet5-nothink", "label": "Sonnet 5", "family": "claude-nothink", "pair": "sonnet5", "thinking": false, "n": 700,
 "latency_ms": {"p50": 0, "p95": 0, "min": 0, "max": 0, "sample": [/* 300 latencies drawn with fixed seed */]},
 "cost_per_1000_usd": 0.0,
 "accuracy": {"point": 0.0, "ci_low": 0.0, "ci_high": 0.0},
 "equivalent_tier_note": null}
```

Plus a `meta` block: task shown, split (`test`), filter (`prefilter:passed` for task 2), run date, git sha, machine/region the harness ran from, and the footnotes below.

**Footnotes that always render** (small, bottom of frame, in every scene that shows latency):

- Jev latency is measured via OpenRouter (one extra network hop); a direct key would be faster.
- Claude latencies are `duration_api_ms` as reported by Claude Code (`claude -p`, the subscription route), at effort `low`; this is the API round trip as the CLI sees it, the routine-guardrail shape, not the fastest possible.
- Latency is wall time of the final successful request, measured from one machine on one day; n per lane is shown.

**Fixture mode.** Until WP6 finishes there are no real rows. `viz/data.fixture.json` holds obviously fake round numbers (Jev 100 ms; the Claude lanes 1,000 to 5,000 ms in even steps; accuracy all 0.80) so the animation can be built and reviewed in parallel with WP1–WP3. The page draws a diagonal **PLACEHOLDER DATA** watermark whenever `meta.fixture` is true. The watermark is not removable by a flag; it goes away only when real `data.json` is loaded.

## 4. The task shown

The headline run uses **task 2, prompt-injection validation**, because it is the guardrail that would sit on every chat turn and the 1,000 texts are self-explanatory on screen. Task 1 (skill routing) is a second, optional chapter using the same scenes with `data.task1.json` (open decision D3).

## 5a. Visual metaphor (decided 2026-09-22): glasses filling with time

Justin asked for something more physical than bars. The animation uses one metaphor carried through every scene:

**The race (Scene 2).** Ten glasses in a row, one per system, in PLAN.md tier order with Jev last in the accent colour. When the case is asked, every glass starts filling at the same steady rate: liquid is elapsed time, and the pour rate is identical for all, so nothing can be fudged. The moment a system answers, its pour stops, a lid caps the glass and the answer stamps on it (`injection`, p = 0.93). Jev's pour stops almost immediately: a thin film at the bottom. The others keep filling while the stopwatch runs. Final liquid level is the wait, to the pixel. Glass height equals the race cap (8 s) so no glass overflows; a system past the cap is shown still pouring and labelled "still waiting". A small magnifier inset on Jev's glass shows its sliver with the number, so it is never invisible in the square frame.

**Slow motion (Scene 3)** replays the first 500 ms: Jev's film rises and caps; the others barely wet the bottom.

**Distribution (Scene 4).** The glasses tip and pour onto one horizontal timeline (log axis, labelled 100 ms, 1 s, 10 s). Each system's 300 sampled latencies fall as drops and pool where they land. Jev's puddle sits tight at the left edge; the others spread. p50 and p95 markers are drawn over each puddle with their values. Puddles then re-sort by p50.

**Throughput (Scene 5).** One large glass for the slowest system fills once; beside it, Jev's small glass fills and empties N times, a counter ticking up. N is shown with the two p50s it comes from.

**Cost (Scene 6).** The liquid freezes into stacks of coins, one stack per system, stack height being notional cost per 1,000 decisions (log dollar axis, labelled). Jev's stack is a single thin coin with its price written beside it.

**Accuracy (Scene 7).** Each stack gets a target ring: how close each system got, with the 95% CI as a band around the point, and the verdict line typed in from `data.json`. This scene deliberately drops the metaphor for a plain, honest chart form.

**End frame (Scene 8).** The ten capped glasses again, now with three numbers under each (p50, cost per 1,000, accuracy with CI). This still is the LinkedIn thumbnail.

**Honesty rules for the metaphor.** Liquid level is linear in time, same pour rate for every glass, glass height equals the shared cap, no glass is drawn taller or narrower than another, and every level is annotated with its number. The metaphor decorates the encoding; it never replaces it.

**No clock faces.** Justin ruled them out (2026-09-22). Glasses are the metaphor; no dial or arc variant is built.

## 5. Scenes

Timings assume a slowest p95 of about 6 s. The build reads the real value and stretches or trims Scene 2 accordingly; total length stays between 60 and 75 s.

| # | Scene | Duration | What happens |
|---|---|---|---|
| 0 | Title | 3 s | "How long does one decision take?" Subtitle: task, n, date. |
| 1 | The case | 3 s | One real test case fades in as a chat bubble (a benign or injection text from the test split, chosen for length under 200 chars, no personal data by construction). The question under it: "Is this a prompt injection?" |
| 2 | The race, real time | ≈ p95 of the slowest system, capped at 8 s | The glasses of §5a fill at real speed; each caps with its answer when its **p50** elapses. Jev caps almost immediately. Then nothing happens for a while, deliberately, while the stopwatch keeps counting. Each cap stamps its time in tabular numerals. A system past the 8 s cap is "still waiting" and the scene cuts. |
| 3 | Replay, slow motion | 6 s | "That was real time. Here is the first half second at 1/20 speed." The stopwatch re-runs 0 to 500 ms over 6 s (~12× slower, tuned so Jev's bar visibly travels). Jev completes; the Claude bars barely move. Cuts back to real speed for one second to land the contrast. |
| 4 | It is a distribution | 10 s | The tracks re-scale to a **log** time axis (100 ms, 1 s, 10 s gridlines, labelled). For each lane, 300 sampled latencies stream in as small dots in 4 s, jittered vertically inside the lane, so the viewer sees the spread. p50 and p95 markers draw in over the dots with their values. Lanes then re-sort by p50 (animated) so the order is now by measured speed. |
| 5 | Throughput | 8 s | "In the time [slowest model] answers once, Jev answers N times." A counter in Jev's lane ticks up to N while a single bar fills in the slowest lane, both at real speed scaled to fit 6 s. N is computed from the p50 ratio and shown with its inputs. |
| 6 | Cost | 8 s | Same lanes, the metric switches to cost per 1,000 decisions, log axis in dollars. Bars grow from zero; dollar labels count up. Jev's bar is a sliver with its value written next to it. Footnote: Claude cost is notional list price computed from logged tokens (the run itself was on a subscription); Jev is the real OpenRouter charge recorded in PREFLIGHT.md. |
| 7 | What speed costs | 12 s | Metric switches to **accuracy** on the test split. One dot per system with a horizontal 95% CI whisker. Jev's dot draws last. Then the verdict text from REPORT.md types in: "Jev is as good as [tier] on this task" or "Jev is below Haiku 4.5 on this task", followed by the weakest stratum, e.g. "French recall: −X points vs EN". The build must handle both outcomes with the same code; the copy is templated from `data.json`, not hard-coded. |
| 8 | Summary card | 6 s | A compact table: system, p50, cost per 1,000, accuracy with CI. Jev's row highlighted. Footnotes and the date. Hold. |

**Interactive extras (page only):** play/pause, a scrubber across the whole timeline with scene markers, speed control (0.25×, 1×, 4×), hover on any lane shows the exact numbers and n, a toggle between task 2 and task 1 if D3 is yes, a "show placeholder watermark" indicator that cannot be turned off in fixture mode.

## 5b. LinkedIn constraints (primary destination)

LinkedIn autoplays muted in a feed the viewer is scrolling past. That sets four hard rules for the square cut:

- **Hook in the first 3 seconds, without sound.** Scene 0's title is cut to one line and Scene 1 starts by 1.5 s; the stopwatch is already visible and ticking before the viewer decides whether to stop scrolling. The one-line title is a question, e.g. "One decision. Ten AI models. Who answers first?"
- **Captions burned in.** Every scene title and the verdict line are rendered into the frame, not only in the `.srt`, because most viewers never unmute.
- **Length under 60 s** for the square cut (the 16:9 cut may run to 75 s). Scenes 4 and 6 are shortened first; Scene 7 (accuracy with CIs) is never cut.
- **Legible at phone width.** Square frame 1080×1080; nine lanes stacked means each lane gets about 90 px; lane labels at least 32 px, the stopwatch at least 120 px, one metric on screen at a time. If nine lanes do not read at that size, the square cut groups the Claude lanes into tiers (Fable, Opus ×4, Sonnet ×2, Haiku) with the fastest of each tier animated and the rest shown as tick marks, and the 16:9 cut keeps all nine.
- **Ends on a still that works as a thumbnail**: the summary card with Jev's row highlighted and the verdict line.

## 6. Design rules

Load the `dataviz` skill before writing any drawing code and take the palette from its `references/palette.md`. Beyond that:

- **Two hues, not nine.** The story is Jev versus the Claude family. Claude lanes use one neutral hue at graded lightness (darker for higher tier); Jev uses the single accent. Jev also carries a text label and a distinct marker shape so the encoding is never colour-only.
- **Lane order is fixed in Scenes 2–3** (tier order, so the eye learns the layout) and **re-sorts once** in Scene 4. No other reordering.
- **Linear time axis for the race, log axis after.** The race is linear because the point is real elapsed time; the distribution and cost scenes are log because the range spans two orders of magnitude and a linear axis would flatten every Claude lane into a line.
- **Tabular numerals** for the stopwatch and every value, so digits do not jitter. Stopwatch shows three decimals of seconds in Scenes 2–3, then values round to the precision the CI supports.
- **Every number has its provenance on screen**: n, split, date, and the footnotes above. Nothing rounds to a cleaner story than the data supports.
- **No easing that lies.** Bars in Scenes 2–3 move linearly with time; easing is allowed only for transitions between scenes, never for a bar whose length encodes a measurement.
- **Light and dark** both work (the Artifact will be viewed in either); the video renders in the light theme unless asked otherwise.
- **Reduced motion.** With `prefers-reduced-motion`, the page skips to the summary card with a "play anyway" button. Captions (the scene titles) are also emitted as a `.srt` next to the video.
- **Typography and size.** Frame designed at 1920×1080; lane labels at least 28 px so the video reads on a phone. The page is responsive down to 375 px wide by stacking the stopwatch above the lanes.
- **Honesty guardrails.** The Jev row always carries "via OpenRouter". Scene 7 is mandatory and cannot be cut from the export. The verdict copy is templated from data. Fixture mode watermarks.

## 7. Files

```
viz/
  latency-race.html        page: render(t), scenes, controls; loads data.json (inlined at build)
  build.py                 inlines data.json into the html; runs the frame export; encodes mp4 + srt
  data.json                real data (WP7 output through harness/viz_data.py)
  data.fixture.json        placeholder, watermark on
  frames/                  gitignored, transient
  out/                     latency-race-1080p.mp4, latency-race.srt (committed; a few MB)
harness/viz_data.py        results/ + metrics output -> viz/data.json
```

Dependencies: no framework; vanilla JS with D3's scale and format modules from cdnjs for axes. Export: `playwright-cli` (already the house tool for browser automation) and `ffmpeg` (`media-processing` skill). Python 3.11 in the existing `.venv` for `viz_data.py` and `build.py`.

## 8. Build order

1. `harness/viz_data.py` and `data.fixture.json`, plus a pytest that the fixture and a synthetic `results/` both produce schema-valid `data.json`.
2. `latency-race.html` against the fixture: all nine scenes, scrubber, hover, reduced motion. Review as an Artifact with the watermark on.
3. `build.py`: frame export and encode. Confirm the 60–75 s video plays, the `.srt` aligns, file size under 20 MB.
4. After WP7: run `viz_data.py` on real results, rebuild, review numbers against `results/analysis/`, commit `data.json`, the html and the mp4.

Steps 1–3 can run any time after WP1 defines the results schema; step 4 waits for WP7.

**Acceptance.** Video length 60–75 s; every number on screen traceable to `results/` rows or `results/analysis/`; Scene 7 present; watermark absent only with real data; page renders at 375 px and 1920 px; reduced-motion path works; `.srt` present.

## 9. Open decisions (defaults in bold; the build proceeds on the defaults)

- **D1 — formats.** Decided 2026-09-22: **square 1:1 for LinkedIn first**, plus the 16:9 cut for slides and the report.
- **D2 — lanes.** Superseded by D6.
- **D3 — second task.** **Task 2 only in the video; both tasks in the page** via a toggle, since the page costs nothing extra per task.
- **D4 — sound.** **None in the square cut** (LinkedIn autoplays muted; everything must work silent). The 16:9 cut may add a stopwatch tick and completion chime as an optional audio track.
- **D6 — which Claude family races (decided 2026-09-22, Justin can override).** The matrix now has 17 systems (Jev, 8 Claude with thinking, 8 with thinking off). Nine glasses is the most a 1080×1080 frame holds legibly. The square cut races **Jev against the eight no-thinking Claude systems**, because thinking off is the fastest and cheapest Claude shape, so this is the race most favourable to Claude and the honest one to publish. Every no-thinking glass carries a small "thinking off" tag. The 16:9 cut shows both families: each Claude glass has a lighter ghost glass behind it for the thinking variant, capped at its own time. The interactive page has a family toggle (thinking / no thinking / both). `data.json` carries all 17 systems with a `family` field (`jev`, `claude-think`, `claude-nothink`) and a `pair` field linking the two variants of one model.
- **D5 — Jev direct key.** If the direct TypeSafe key arrives and the 200-case parity run is done (PLAN.md §12), the Jev lane shows the direct latency with a second, lighter marker for the OpenRouter figure.
