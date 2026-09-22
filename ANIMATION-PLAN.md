# Latency animation — plan

**Purpose.** One 60–75 second animation that makes the speed gap between Jev and every Claude model *felt*, not read: the viewer waits in real time for the Claude answers after Jev has already returned. It ends on quality, so speed is never shown alone (PLAN.md §8: cost and latency alongside quality, never as a ratio alone). **Status:** planned 2026-09-22, not started. **Work package:** WP9 in `PLAN.md` §10, brief in `SUBAGENT-BRIEFS.md`.

## 0. Creative direction (2026-09-22, after Justin rejected the first build)

The first build was a dashboard with a scrubber: thin bars on an axis, small type, tick marks, footnote paragraphs, a table at the end, Jev an invisible sliver. **That is not the deliverable.** The deliverable is a short film for a LinkedIn feed. Every frame must pass one test: *would someone stop scrolling for this?* Rules that override anything below that reads as "chart":

- **Cinematic, not analytic.** Dark full-bleed background, one idea per frame, huge type (the stopwatch fills a third of the frame), no axes, no tick labels, no gridlines, no legends, no footnote paragraphs. Provenance is one small line at the very end, plus the `.srt`. The numbers are in the animation itself, stamped large at the moment they matter.
- **Real objects with physics.** Glasses that look like glass: outline with a highlight, a visible pouring stream from above, liquid with a meniscus and a slight slosh when the pour stops, a lid that drops with a small bounce, droplets. Coins that drop and settle with a bounce. Drops that fall and splash into puddles. Use springs and eased motion for objects and transitions; only the liquid level itself stays strictly linear in time (the measurement).
- **Camera.** Push in on Jev's glass at the instant it caps (the sliver becomes full-frame, the number slams in), hold, then a fast pull-back to reveal the other eight still pouring. Later, a slow lateral dolly along the row while the stopwatch keeps counting. Motion between scenes is a cut or a whip, never a fade to a new chart.
- **Kinetic typography.** The stopwatch is the protagonist: enormous, tabular numerals, ticking. Jev's time punches in. The verdict line at the end is typed, one word at a time, with weight.
- **Tension by waiting.** After Jev caps, nothing happens on purpose. Let the viewer sit with the stopwatch climbing and the other glasses still filling. That silence is the point of the whole piece.
- **Accuracy scene as an image, not a dot plot.** Nine targets; each system's arrow lands where its accuracy puts it, the CI is the spread of the arrow cluster. Jev's arrow lands last. The verdict types in.
- **End card, not a table.** Three enormous numbers for Jev (time, cost, accuracy) with the tier verdict, and the row of capped glasses behind it as the thumbnail.
- **Reference feel:** Apple keynote product reveal, or a Kurzgesagt sequence: bold shapes, confident motion, nothing that looks like a spreadsheet. Palette: near-black background, one warm accent for Jev, cool desaturated blues for the Claude family, white type.

**Tooling.** Video is rendered with **Remotion** (React, springs, sequences, deterministic frames, its own encoder) via the `remotion-best-practices` skill, not by screenshotting a page. The interactive page is the same composition inside Remotion's `<Player>` with a scrubber, so page and video still cannot disagree. The dashboard page from the first build is deleted, not kept as a fallback.

## 1. What the viewer takes away

1. A decision that takes Jev about a tenth of a second takes a Claude model one to several seconds. You sit through that gap once, in real time.
2. That gap is a distribution, not one number: p50 and p95 per system, from 1,000 real cases.
3. Over a batch, the gap compounds into throughput and dollars.
4. And here is what the speed costs in accuracy, per system, with confidence intervals. The verdict shown is whatever `REPORT.md` says, including the strata where Jev is weaker.

## 1. The sentence

**"Jev has categorized before Claude has finished thinking."** Justin, 2026-09-22: the point of the piece is to compare Jev's categorizing speed to the Claude models. Every scene serves that sentence; the closing accuracy scene is there so the speed claim is never made alone.

## 2. Deliverables

| Deliverable | Path | Use |
|---|---|---|
| Square video | `viz/out/jev-vs-claude-1080sq.mp4` (1080×1080, 30 fps, ≤ 35 s) | LinkedIn, primary. Silent, captions burned in. |
| Wide video | `viz/out/jev-vs-claude-1080p.mp4` (1920×1080, 30 fps, ≤ 50 s) | Slides and the report. May carry the extra beats cut from the square. |
| Captions and poster | `viz/out/*.srt`, `viz/out/poster.png` | Accessibility; the LinkedIn thumbnail (the end card). |

Rendered with **Remotion** in a Node subproject at `viz/` (`package.json`, `src/`), one composition with a `layout` prop (`square` | `wide`). No interactive HTML page: the video is the deliverable, and the report embeds it. The dashboard page from the first build is deleted.

## 3. Data

Everything on screen comes from `viz/data.json`, produced by `harness/viz_data.py` from `results/` and the WP7 metrics output. Nothing is typed by hand. Per system (all 17 primary systems in PLAN.md §2, `family` jev / claude-think / claude-nothink, `pair`, `thinking`): latency p50/p95, cost per 1,000 (notional list for Claude, real for Jev), accuracy point and 95% CI, n, output-token and thinking-token medians. Plus a **hero case** block: one chosen test case (short, self-explanatory, no personal data by construction) with, for every system, the verbatim structured output it returned on that case, its output tokens, thinking tokens and `duration_api_ms`, so the typing scene replays exactly what each model wrote at exactly the rate it wrote it. `meta` carries task, split, filter, run date, git sha and the `fixture` flag.

**Fixture mode.** `viz/data.fixture.json` holds obviously fake round numbers and a fabricated hero case, `meta.fixture = true`, and the render burns a diagonal PLACEHOLDER DATA watermark into every frame that no prop can remove. A second fixture, `data.fixture-jev-loses.json`, puts Jev's accuracy clearly below Haiku's so the templated verdict is tested both ways.

## 4. The task shown

Task 2, prompt-injection validation: the guardrail that would sit on every chat turn, and a text on screen explains itself. Task 1 is a second composition using the same scenes if wanted later.

## 5d. Final direction (2026-09-22, after Justin watched film v4)

**The glasses are out.** Justin: "the buckets at the beginning is terrible, just show the blocks". The thousand-square blocks (P5) are the film's centrepiece and also carry the single-decision race. Storyboard now: (1) prompt, (2) Jev stamps, (3) **blocks**: nine 1,000-cell blocks appear, Jev's on top; first, in real time, one cell lights in each block when that model's single decision returns (Jev's first, at its real time, then the others at theirs); then a "×N speed" tag appears and the time-lapse runs, Jev's block flooding while the others crawl, with the count row and clocks, ending on the freeze and flash; (4) accuracy targets; (5) end card. Square under 35 s. §5 below is superseded where it conflicts.

**Declutter (Justin, after the first blocks render):** the speed tag and the stamp result are not front and centre. They live in one small asterisk footnote at the bottom of the frame. The blocks fill the frame; the only text near them is model names and counts.

## 5e. Justin's quadrant design (2026-09-22, replaces the opening of §5d)

Four quadrants, no intro, no jargon on screen:

| | left | right |
|---|---|---|
| **top** | the input text Jev is judging | Jev's decision (typed label + probability bar) |
| **bottom** | the input text Claude is judging | the Claude model's decision streaming in, token by token, at its real rate |

Rules: when the top-right decision lands, the top-left text advances to the next case. When the bottom-right finishes typing, the bottom-left advances. Both rows start on the same first case. The bottom row cycles through the eight Claude models, one case each, the model's name shown beside its panel, so every Claude model appears and Jev has judged many texts by the time Claude has judged eight. Every text is a real test case; every decision is the verbatim structured output; every duration is the measured one (Jev's latency, Claude's `duration_api_ms` with output tokens setting the typing rate; thinking shown as a shimmer with a token count). A single small counter per row ("decisions: 37" / "decisions: 3") is the only number on screen besides the stopwatch. Then the blocks (§5d) for the thousand, then accuracy, then the end card.

**Refinement (Justin):** the decision panels are split vertically. Left half: the two possible outputs (benign / injection) shown as two options with the chosen one lit and its probability. Right half: a **tower** that grows by one brick per decision made, stacked by correct (accent) and incorrect (muted red) against gold, so the tower's height is throughput and its colour split is accuracy. Both rows get a tower; Jev's shoots up, Claude's grows brick by brick. Beside each tower, outside the panel, a small running readout: decisions, accuracy so far (and precision for injection). Matched pairs rule still holds: text, decision and the brick that lands all belong to the same case.

**No "wall clock".** Any time label reads "elapsed" or nothing. Any disclosure (time-lapse factor, thresholds) is one asterisk line at the bottom.

## 5. Storyboard (square cut, ≤ 40 s; wide cut ≤ 55 s)

Justin, 2026-09-22: **it has to be Jev against the different Claude models, not one hero model.** The wall is the main event. The stopwatch is the protagonist: enormous tabular numerals, present from the first frame to the last, always real elapsed time for the current call.

| # | Beat | Time | What happens |
|---|---|---|---|
| 1 | The prompt | 0–3 s | Dark frame. A chat message types itself in: the hero case text. One word under it: **Injection?** The stopwatch fades in at 0.000. |
| 2 | Jev stamps | 3–4.5 s | Across the top of the frame, a pulse leaves and returns, and a stamp slams down: **INJECTION · 98%** with a probability bar. The stopwatch value at that instant is punched in large beside it (its real time, e.g. **0.37 s**). |
| 3 | Every Claude model writes | 4.5 s until the slowest finishes (capped at 12 s, then "still writing") | Below Jev, a 2×4 grid, one panel per Claude model with its name and a "thinking off" tag. All start together at t = 0 of the call: a thinking shimmer with a live token counter climbing to each model's real count (content never shown), then the answer typed character by character at that model's own real rate (output tokens over measured time). The stopwatch runs. Panels cap one by one with their time, fastest first. Jev's stamp does not move. The viewer watches the whole spread finish. This is the sentence. |
| 4 | A thousand in a row | +10 s | "Now do it 1,000 times." Nine odometers stacked as a leaderboard, Jev on top, in time-lapse with a "×N speed" tag. Jev's hits 1,000 while its clock reads seconds; the eight Claude odometers climb at their own real rates, clocks reading minutes to hours (p50 × 1,000, single stream, stated). A small cost counter ticks under each clock: cents against dollars. |
| 5 | What speed costs | +6 s | Nine targets in the same grid. Each system's arrow flies in and lands where its accuracy puts it, CI as a small cluster spread. Jev's arrow lands last. The verdict types in one word at a time from `data.json`: "Jev is as good as [tier]" or "Jev is below Haiku 4.5", then the weakest stratum in one short line. |
| 6 | End card | +3 s | Jev's three enormous numbers (time, cost per 1,000, accuracy with CI), the verdict, one provenance line (n, split, date, "Claude via Claude Code, Jev via OpenRouter"). Hold. Poster frame. |

**Which Claude models.** The square cut shows the eight **no-thinking** Claude systems (the fastest Claude shape, so the race cannot be called rigged), each tagged "thinking off". The wide cut shows all sixteen as paired panels (thinking variant ghosted behind its no-thinking twin, capping at its own time). `data.json` has all 17; the `hero` field is dropped.

**Honesty rules.** Typing rate, thinking counter, stopwatch, odometers and clocks are all driven by measured values from `data.json`; springs and easing apply to objects (stamp, arrows, panels, camera), never to a quantity that encodes a measurement. Every number on screen is traceable to a results row. The verdict copy is templated; the render must be correct on both fixtures. The watermark is unremovable in fixture mode.

## 5c. Prototype round (2026-09-22): motion metaphors, not counters

Justin on the first Remotion render: numbers changing is not an animation. The middle scenes must be **objects that move, fill, race and arrive**. He wants choices and will narrow them down on prototypes. Build these as separate short Remotion compositions on fixture data, square, about 8 s each, same nine systems, same stopwatch in the corner, then a contact sheet:

| # | Prototype | Encoding (must stay linear in time) |
|---|---|---|
| P1 | **Rocket launch** | Nine rockets on vertical lanes lift off together; height = elapsed time; Jev's reaches the target line and bursts into its answer stamp; others keep climbing on exhaust trails. |
| P2 | **Rings filling** | Nine rings sweep closed at one shared rate; a ring closes at the system's time and snaps into its stamp; Jev's closes in a blink. |
| P3 | **Glasses filling** | Liquid pours into nine glasses at one shared rate (§5a); a glass caps at the system's time; Jev's caps almost empty. |
| P4 | **Sprint** | Nine runners on horizontal lanes at one shared speed; the finish line is the answer; Jev crosses while the rest are mid-stride. |
| P5 | **The thousand-square** (for the "1,000 times" scene) | One 1,000-cell square per system; cells light at the system's real decisions-per-second in time-lapse; Jev's fills in seconds, Claude's has a handful lit at scene end. |

Justin picks one of P1–P4 for the race and confirms P5 (or an alternative) for the thousand-call scene. The prompt beat, Jev's stamp, the accuracy targets and the end card from the first render are kept as the frame around whichever metaphor wins.

## 5b. LinkedIn constraints (primary destination)

LinkedIn autoplays muted in a feed the viewer is scrolling past. That sets four hard rules for the square cut:

- **Hook in the first 3 seconds, without sound.** Scene 0's title is cut to one line and Scene 1 starts by 1.5 s; the stopwatch is already visible and ticking before the viewer decides whether to stop scrolling. The one-line title is a question, e.g. "One decision. Ten AI models. Who answers first?"
- **Captions burned in.** Every scene title and the verdict line are rendered into the frame, not only in the `.srt`, because most viewers never unmute.
- **Length under 60 s** for the square cut (the 16:9 cut may run to 75 s). Scenes 4 and 6 are shortened first; Scene 7 (accuracy with CIs) is never cut.
- **Legible at phone width.** Square frame 1080×1080; nine lanes stacked means each lane gets about 90 px; lane labels at least 32 px, the stopwatch at least 120 px, one metric on screen at a time. If nine lanes do not read at that size, the square cut groups the Claude lanes into tiers (Fable, Opus ×4, Sonnet ×2, Haiku) with the fastest of each tier animated and the rest shown as tick marks, and the 16:9 cut keeps all nine.
- **Ends on a still that works as a thumbnail**: the summary card with Jev's row highlighted and the verdict line.

## 6. Design rules

Load the `remotion-best-practices` skill before writing any composition code, and the `dataviz` skill for the accuracy scene's palette (its `references/palette.md`). Beyond that:

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
