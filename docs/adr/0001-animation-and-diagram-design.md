# ADR 0001 — How we design animations and diagrams that show data

**Status:** accepted, 2026-09-22. **Owner:** Justin. **Applies to:** every animation, video, chart or diagram produced in this repo and in the author's sibling projects. Derived from one evening of iterating the Jev-vs-Claude films with Justin; each rule below was a correction he made, so they are not defaults to argue with.

## Decision

### The visual is the content

1. **Frame one is the visualization.** No title card, no intro, no "starting up" beat, no highlight sweep that introduces the elements. The thing itself is on screen from the first frame and already moving.
2. **Motion means objects moving, filling, racing, arriving.** A number ticking up is not an animation. Bars, blocks, towers, cells lighting, things that grow at a measured rate.
3. **Nothing technical front and centre.** Speed factors ("×9"), confidence readouts, method notes, "wall clock", "p50": none of it near the visual. Anything that must be disclosed goes in **one asterisk line at the very bottom** of the frame, small.
4. **Plain words on screen.** Two classes are "Safe" and "Attack", not "benign" and "injection"; the technical term lives in the footnote ("attack = prompt injection"). If a label needs explaining, it is the wrong label.

4b. **Example content on screen is English and generic.** No client business context, no French, no domain-specific cases; frame it as an ordinary user and an ordinary chatbot ("someone messaging a chatbot"). The examples are still real scored cases, filtered, never invented.

### State changes, not transitions

5. **A change of state is a hard cut on a single frame** from one complete state to the next. No fade, no spring, no empty frame, no resize. Every element keeps identical geometry across states; only text, highlight and numbers change. Reserve fixed space (e.g. two lines) for variable-length content so nothing ever moves.
6. **Show the outcome from the first frame when it is already known.** If the recorded data says which option will be chosen, light it before the text finishes streaming, so the viewer never sees a jump.
7. **Everything on a row belongs to the same case.** Text, decision and the brick that lands are always the same item; never show a decision next to the next item's text.

### Comparisons

8. **One task per video.** Two tasks never share a frame or a film. Make two films and two posts.
9. **Six items per comparison frame, chosen one per tier**, ordered worst to best so the subject sits next to its nearest competitor (Jev beside Haiku, then Sonnet, then Opus, then Fable).
10. **The closing scene is a vertical ranked list, best at the top**, one clear percentage beside each name, the subject highlighted and placed at its true rank. Not towers, not targets, not a grid.
11. **Stats beside a live visual are two lines at most**: count, then correct %. Precision, recall, intervals go to the final list's small type or the report.
12. **Layout of a decision panel:** options (half width) · single tower (quarter) · stats (quarter), hard gutters, one column per tower, green = correct, red = wrong, with a non-colour cue.

### Honesty

13. Every quantity that encodes a measurement is **linear in time**; easing is for objects and impacts only. Every number on screen is traceable to a data row. Placeholder data carries an unremovable watermark. The n and the split are stated in the footnote.
14. **Half benign, half attack** for a guardrail dataset: an all-attack set cannot detect over-flagging. Report "attacks caught" and "harmless wrongly blocked" separately when the audience is deciding whether to deploy.

### How we work

15. **Prototype the metaphor first** (five 8-second clips), let Justin narrow it, then build. Do not build the full film on an unchosen metaphor.
16. **Render, then look.** Six-frame contact sheets per film (one frame per scene) before sending; open the cut in VLC for Justin, closing older windows first; keep the output path stable so "open it" always shows the newest.
17. **Remotion**, one composition parameterised by task, one data file per task produced by one script from the results, one render command. No dashboard pages, no chart libraries for film work.

## Consequences

- New visual work in this repo starts from `viz/` and this ADR, not from a chart.
- A request that violates a rule here gets a one-line pushback citing the rule, then Justin's call.
- The rules are saved as a cross-project memory so they apply in the author's other repos.
