# Task 1 — Tier-2 audit (WP4)

`data/task1_cases.jsonl` · 1,000 rows · 50 read in full · audited 2026-09-22

Checklist: the `claude-api` skill's eval health checklist, `shared/evals/eval-audit.md`
(found on disk at the bundled skill's `shared/evals/eval-audit.md`), §1 "Auditing case sets
at scale", Tier 2: *"Draw twenty to fifty cases, stratified across `tags[0]` ... and apply
the per-case checks."* The per-case checks applied are the ones that survive contact with a
routing task: unambiguous success criteria, ground-truth correctness, label leakage,
annotation artifacts, both-directions coverage, duplicates and near-duplicates, language
tag, slice tag, personal data.

**Verdict: no case in the sample is broken. Three observations below are worth a second
look before the numbers are read; none changes a label.**

## The sample

Drawn by `data/splits.py sample --task task1 --n 50 --salt tier2`: stratified by `tags[0]`,
per-stratum seeds `20260922 + zlib.crc32("tier2|task1|<stratum>")`. It re-derives byte for
byte, so the same 50 ids come back on any machine.

| Stratum | In set | In sample |
|---|---|---|
| `slice:clear` | 450 | 23 |
| `slice:implicit` | 200 | 10 |
| `slice:ambiguous` | 130 | 6 |
| `slice:none` | 120 | 6 |
| `slice:adversarial` | 100 | 5 |

## Per-case checks on the sample

| Check | Result |
|---|---|
| Gold correct under the task definition | 50 / 50 |
| Prompt unambiguous (or ambiguity declared in `acceptable`) | 50 / 50 |
| Language tag correct | 50 / 50 |
| Slice tag correct | 50 / 50 |
| Style tag correct | 50 / 50 |
| No personal data | 50 / 50 |
| Exact or near-duplicate of another case | 0 |

Six cases in the sample are worth naming individually, all as judgement calls rather than
errors:

- **`t1-0322`** (adversarial, `style:wrong-name-drop`, FR) asks *"Pourriez-vous lancer
  Explore sur mon projet de compilateur… afin d'établir, avant que je touche au code, la
  marche à suivre"*. Gold is `Plan`, `acceptable` is `["Plan"]` only. The user names
  `Explore` explicitly, so a careful reviewer could accept it — but the whole point of the
  33 `style:wrong-name-drop` cases is that the literal name is the wrong answer, so
  gold-only is the design, not an oversight. Same shape at `t1-0940` (names `claude-api`,
  gold `claude-code-guide` — and `claude-code-guide`'s description does cover Claude in
  Slack, so the gold is right on the merits too). **Worth stating in the report** that the
  adversarial slice scores literal readers as wrong by construction; that is the hypothesis
  H3 is testing, and it should not be read later as a labelling defect.
- **`t1-0058`** (ambiguous) lists `["run", "claude-code-guide"]`, which is right: the user
  asks both "can you do it" and "or can Claude Code not do this".
- **`t1-0046`** mentions *"the 8:30 showing at 412 Harlow Ave."* — an invented street
  address. There is no real address, name, phone or email anywhere in the 1,000 prompts
  (scan below), so this is fine; noting it because address-shaped text is the thing a later
  reader will grep for.
- **`t1-0606`** (not in the sample; found by the scan) contains
  `https://cdn.dumasbakery.com/assets/theme.css`. "Dumas" is Justin's own surname and
  `dumasbakery.com` is a live-looking host. Nothing private leaks and the prompt is
  synthetic, but a host that resolves is the kind of thing a case should not carry — an
  `example.com` host would do the same job. **One-line generator fix if you want it.**

## Annotation artifacts — what a trivial baseline scores

The checklist asks whether a trivial baseline can score well from surface patterns. Two
were run over the whole set (`data/audit_tier2_checks.py`):

| Baseline | Strict top-1 | Lenient |
|---|---|---|
| Answer the first catalogue name that appears verbatim in the prompt, else `none` | **26.7%** | 27.6% |
| Always `none` | 12.0% | 12.0% |
| Random over 36 options | ~2.8% | — |

So about a quarter of the headline is reachable without understanding the request. Where it
comes from:

- 100 cases are `style:name-drop` by design (PLAN.md §3 asks for 10% naming a skill).
- **74 further cases name their own gold option without being tagged `name-drop`**, because
  nine options are named after ordinary words or file extensions: `pptx` (16), `morning`
  (15), `pdf` (14), `docx` (13), `xlsx` (11), `research` (3), `docs`, `Plan`. A prompt that
  says "turn this into a .pptx" *has* to say pptx; there is no way to write it otherwise.
  49 of the 74 are in `slice:clear`, 15 in `slice:adversarial`, 9 in `slice:ambiguous`.

Nothing to fix — this is a property of the real catalogue, and the production router faces
the same surface. **The suggestion is for the report, not the data:** quote the 26.7%
name-match baseline next to the headline, and read per-slice accuracy (`slice:implicit`,
where the name is absent by construction, is the clean measure of inference) rather than the
set-wide number alone, when the question is whether Jev *infers* intent.

## Near-duplicates and paraphrase clusters

Tier 1 reports 0 exact duplicates and 0 pairs above token-set Jaccard 0.9. Looking lower,
inside the same gold option, the highest pair in the whole set is **0.690**
(`t1-0090` / `t1-0660`, both `keybindings-help`, both `slice:clear`), and 32 pairs sit at or
above 0.45 — the full list is in `data/audit_tier2_checks.py`'s output. Since
`data/gen_task1.py` rejects and regenerates at 0.78, every one of these is inside the
generator's own tolerance.

What they are is topical clustering, not duplication: 25 prompts about one skill converge on
the same vocabulary, and the `clear` and `implicit` versions of an option often describe the
same underlying need in different words (`t1-0358` / `t1-0802`, both "Enter submits my
half-written prompts"; `t1-0230` / `t1-0524`, both "allowlist the read-only commands I keep
approving"). **Worth knowing when the CIs are read:** errors inside an option will be
correlated, so the effective sample per option is somewhat below 25 and a per-option F1
difference of a point or two is noise. No change recommended — regenerating for lexical
spread would cost the realism that makes these prompts look like real requests.

## Personal data

Scanned all 1,000 prompts for email addresses, phone-shaped digit runs and URLs:

- emails: **0**
- phone-shaped runs: **0**
- hosts: **1**, `cdn.dumasbakery.com` (`t1-0606`, above)
- mentions of "Justin" or "Jev": **0** — WP2's neutral-cwd fix held.

## Where Tier 2 hands off

Tier 3 (`data/audit_tier3.py`, `claude-sonnet-5` at effort `low`, one call per case through
the harness's frozen flag set) runs the same per-case checks over all 1,000 and is reported
in `data/audit_tier3.md`. Justin's 100-case read is `data/SIGNOFF.md`.
