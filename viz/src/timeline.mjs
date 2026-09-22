// The beat list, derived from the data — ANIMATION-PLAN.md §5.
//
// Plain JS on purpose: the composition imports it and so does scripts/write-srt.mjs, so
// the video and the captions can never drift apart.

export const FPS = 30;

/** The eight Claude systems that are actually on screen, plus Jev, in tier order. */
export const TIER = ['fable51', 'opus5', 'opus48', 'opus47', 'opus46', 'sonnet5', 'sonnet46', 'haiku45'];

export const byId = (data, id) => (data.systems || []).find((s) => s.system === id) || null;

/**
 * Square: Jev against the eight no-thinking systems (the fastest Claude shape, so the
 * race cannot be called rigged — D6). Wide: the same eight, each with its thinking twin
 * ghosted behind it.
 */
export function panels(data, layout) {
  const out = [];
  TIER.forEach((base, tier) => {
    const nothink = byId(data, base + '-nothink');
    const think = byId(data, base);
    const primary = nothink || think;
    if (!primary) return;
    out.push({
      sys: primary,
      ghost: layout === 'wide' && think && primary.system !== think.system ? think : null,
      tier,
    });
  });
  return out;
}

export const jevOf = (data) => byId(data, 'jev');

/**
 * ANIMATION-PLAN.md §5f: the blocks scene and the square cut's ranked list use six
 * systems only — Jev and five no-thinking Claude models, worst to best so Haiku
 * sits next to Jev. The older Opus versions are near-duplicates of Opus 5 and are
 * left out of this scene.
 */
/**
 * The blocks scene and the square cut's ranked list: Jev and the eight
 * no-thinking Claude models, ordered fastest to slowest by median response time,
 * so Jev comes first and the order is the story rather than a choice.
 */
export function blocksSystems(data) {
  const jev = jevOf(data);
  const claude = TIER.map((t) => byId(data, t + '-nothink')).filter(Boolean);
  return [jev, ...claude]
    .filter(Boolean)
    .sort((a, b) => (a.latency_ms.p50 ?? 0) - (b.latency_ms.p50 ?? 0));
}

export function beats(data, layout) {
  const wide = layout === 'wide';
  const verdictLead = wide ? 3.6 : 3.2;


  const list = [
    {
      id: 'quadrants',
      seconds: wide ? 31 : 30,
      caption: 'One decision. Is this a prompt injection?',
    },
    {
      id: 'decision',
      seconds: 10,
      caption: 'One decision, then a thousand.',
    },
    {
      id: 'ranking',
      seconds: wide ? 8 : 7.5,
      caption: 'Speed against accuracy.',
    },
    {
      id: 'end',
      seconds: wide ? 3.5 : 3,
      caption: '',
    },
  ];

  let from = 0;
  return list.map((b) => {
    const durationInFrames = Math.round(b.seconds * FPS);
    const beat = {...b, from, durationInFrames, fromSeconds: from / FPS};
    from += durationInFrames;
    return beat;
  });
}

export function totalFrames(data, layout) {
  return beats(data, layout).reduce((a, b) => a + b.durationInFrames, 0);
}

/* ------------------------------------------------------------------ *
 * The verdict, templated from data.json (§5 beat 5). It must read
 * correctly whether Jev clears a tier or not; both fixtures test it.
 * ------------------------------------------------------------------ */

const FAMILY_WORDS = {'claude-think': 'thinking on', 'claude-nothink': 'thinking off'};

function weakestOf(data, family) {
  const ids = family === 'claude-think' ? TIER : TIER.map((t) => t + '-nothink');
  for (let i = ids.length - 1; i >= 0; i--) {
    const s = byId(data, ids[i]);
    if (s) return s;
  }
  return null;
}

export function verdict(data) {
  const v = (data.meta && data.meta.verdict) || {};
  const preliminary = Boolean(data.meta && data.meta.preliminary);
  const n = (jevOf(data) && jevOf(data).n) || null;
  const margin = v.margin_pts || 2;
  const lines = [];
  let nearestNote = null;

  for (const fam of ['claude-nothink', 'claude-think']) {
    const tier = v.equivalent_tier && v.equivalent_tier[fam];
    const label = (v.equivalent_tier_label && v.equivalent_tier_label[fam]) || tier;
    const weak = weakestOf(data, fam);
    const pd = weak && v.paired ? v.paired[weak.system] : null;

    if (tier) {
      lines.push({head: 'as good as ' + label, full: null, tail: FAMILY_WORDS[fam], good: true});
    } else if (!preliminary && pd && pd.hi_pts < -margin) {
      // only claimable once the interval itself clears the margin
      lines.push({
        head: null,
        full: 'Below every Claude by more than ' + margin + ' points',
        tail: FAMILY_WORDS[fam],
        good: false,
      });
    } else {
      // the honest reading: the test did not pass, and at this n it could not
      const half = pd ? Math.round((pd.hi_pts - pd.lo_pts) / 2) : null;
      const qual = n && half ? ` (n=${n}, \u00b1${half} pts)` : '';
      lines.push({
        head: null,
        full: 'Not yet shown within ' + margin + ' points of any Claude' + qual,
        tail: FAMILY_WORDS[fam],
        good: false,
      });
    }
    if (!nearestNote && weak && pd) {
      nearestNote =
        'vs ' + weak.label + ': ' + pd.diff_pts.toFixed(1) + ' pts [' +
        pd.lo_pts.toFixed(1) + ', ' + pd.hi_pts.toFixed(1) + ']';
    }
  }

  const ws = v.weakest_stratum;
  const names = {fr: 'French', en: 'English'};
  const weakest = ws
    ? (names[ws.group] || ws.group) + ' ' + ws.delta_pts.toFixed(0) + ' points vs ' + (names[ws.vs] || ws.vs)
    : null;
  return {lines, weakest, nearestNote, marginPts: margin, preliminary};
}

/** The verdict as one sentence, for a caption or a subtitle. */
export const verdictSentence = (l) => (l.full ? l.full : 'Jev is ' + l.head);

/**
 * One line per beat. `caption` is what is burned into the frame; `srt` is what the
 * subtitle file says, which on the closing beats is the templated verdict itself.
 */
export function captionLines(data, layout) {
  const v = verdict(data);
  return beats(data, layout).map((b) => {
    if (b.id === 'ranking') {
      return {...b, srt: verdictSentence(v.lines[0]) + ' (' + v.lines[0].tail + ').'};
    }
    if (b.id === 'end') {
      return {
        ...b,
        srt:
          verdictSentence(v.lines[0]) + ' (' + v.lines[0].tail + '); ' +
          verdictSentence(v.lines[1]) + ' (' + v.lines[1].tail + ').',
      };
    }
    return {...b, srt: b.caption};
  });
}

/* ------------------------------------------------------------------ *
 * The verdict as two plain lines, for the block under the ranked list.
 * Everything here is templated from data.json; nothing is written by hand.
 * ------------------------------------------------------------------ */

/** The Claude Jev is closest to on the shared cases — the smallest gap, sign included. */
function nearestClaude(data) {
  const paired = ((data.meta && data.meta.verdict) || {}).paired || null;
  const jev = jevOf(data);
  let best = null;
  if (paired) {
    // only the systems the film actually shows, so the headline's "n times
    // faster" agrees with the ranked list the viewer just read
    for (const sys of blocksSystems(data)) {
      if (!sys || sys.family === 'jev') continue;
      const p = paired[sys.system];
      if (!p) continue;
      if (!best || p.diff_pts > best.p.diff_pts) best = {id: sys.system, p, sys};
    }
    return best;
  }
  // No paired bootstrap in this file (the fixtures): fall back to the plain
  // accuracy gap against the models the film actually shows, and take the
  // half-width from Jev's own interval.
  if (!jev) return null;
  const half = ((jev.accuracy.ci_high - jev.accuracy.ci_low) / 2) * 100;
  for (const sys of blocksSystems(data)) {
    if (!sys || sys.family === 'jev') continue;
    const diff = (jev.accuracy.point - sys.accuracy.point) * 100;
    if (!best || diff > best.p.diff_pts) {
      best = {id: sys.system, sys, p: {diff_pts: diff, lo_pts: diff - half, hi_pts: diff + half}};
    }
  }
  return best;
}

/** What the film says the systems are doing, per task. */
const TASK_PHRASE = {task1: 'picks the right tool', task2: 'detects attacks'};

export function verdictBlock(data) {
  const v = (data.meta && data.meta.verdict) || {};
  const preliminary = Boolean(data.meta && data.meta.preliminary);
  const margin = v.margin_pts || 2;
  const jev = jevOf(data);
  const n = jev ? jev.n : null;
  const phrase = TASK_PHRASE[data.meta && data.meta.task] || TASK_PHRASE.task2;
  const near = nearestClaude(data);
  const half = near ? Math.max(1, Math.round((near.p.hi_pts - near.p.lo_pts) / 2)) : null;

  const labels = v.equivalent_tier_label || {};
  const tiers = v.equivalent_tier || {};
  const tierId = tiers['claude-nothink'] || tiers['claude-think'] || null;
  const tierLabel = labels['claude-nothink'] || labels['claude-think'] || null;
  const tierSys = tierId ? byId(data, tierId) : null;

  // how many times faster Jev is than whichever model the sentence names
  const jevP50 = (jev && jev.latency_ms && jev.latency_ms.p50) || null;
  const speedVs = (sys) => {
    const p = sys && sys.latency_ms ? sys.latency_ms.p50 : null;
    return jevP50 && p ? Math.round(p / jevP50) : null;
  };
  const fastestClaude = (data.systems || [])
    .filter((s) => s && s.family !== 'jev' && s.latency_ms && s.latency_ms.p50)
    .sort((a, b) => a.latency_ms.p50 - b.latency_ms.p50)[0];

  let headline = '';
  let small = '';
  const cases = n + ' cases';

  if (tierLabel) {
    // (a) the non-inferiority test passed against a tier
    const k = speedVs(tierSys || near?.sys);
    headline = `Jev ${phrase} as well as ${tierLabel}${k ? ', ' + k + '\u00d7 faster' : ''}.`;
    small = `Within ${margin} points of ${tierLabel} on ${cases}.`;
  } else if (near && near.p.lo_pts <= 0 && near.p.hi_pts >= 0) {
    // (b) the nearest model's paired interval still includes zero
    const k = speedVs(near.sys);
    headline = `Jev ${phrase} on par with ${near.sys.label}${k ? ', ' + k + '\u00d7 faster' : ''}.`;
    small = `Difference within the margin of error on ${cases}${half ? ' (about \u00b1' + half + ' points)' : ''}.`;
  } else if (near && !preliminary && near.p.hi_pts < -margin) {
    // (c) even the closest Claude's interval clears the margin
    const k = speedVs(fastestClaude);
    headline =
      `Jev ${phrase} less accurately than every Claude` +
      (k ? `, but ${k}\u00d7 faster than the fastest.` : '.');
    small = `Behind ${near.sys.label} by ${Math.round(Math.abs(near.p.diff_pts))} points on ${cases}.`;
  } else if (near) {
    // behind the nearest model, but not by enough to claim (c) yet
    const k = speedVs(near.sys);
    const d = Math.round(Math.abs(near.p.diff_pts));
    headline =
      `Jev ${phrase} ${d} point${d === 1 ? '' : 's'} less accurately than ${near.sys.label}` +
      (k ? `, but ${k}\u00d7 faster.` : '.');
    small = `On ${cases}${half ? ', about \u00b1' + half + ' points' : ''}.`;
  }

  const smallPrint = (preliminary && small ? 'Preliminary \u00b7 ' : '') + small;
  return {headline, smallPrint, nearest: near, marginPts: margin, preliminary};
}
