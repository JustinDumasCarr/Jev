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

const heroMs = (s) => (s && s.hero && s.hero.duration_api_ms) || (s && s.latency_ms.p50) || 0;

/** How long the wall of panels has to run: the slowest measured call, capped at 12 s. */
export function wallSeconds(data, layout) {
  const ps = panels(data, layout);
  let slowest = 0;
  for (const p of ps) {
    slowest = Math.max(slowest, heroMs(p.sys));
    if (p.ghost) slowest = Math.max(slowest, heroMs(p.ghost));
  }
  const jev = heroMs(jevOf(data));
  return Math.min(12, Math.max(0.8, (slowest - jev) / 1000));
}

/**
 * Beat durations in seconds. Beat 3 is the only one the data stretches; everything else
 * is fixed, so the square cut stays inside its LinkedIn budget (§5b).
 */
/** The race beat is stretched to a fixed screen window and the playback rate is
 * stated on screen; the beat never shrinks below what the row needs to read. */
export function raceWindowSeconds(layout) {
  return layout === 'wide' ? 9.2 : 8.0;
}

export function beats(data, layout) {
  const wide = layout === 'wide';
  const raceWindow = raceWindowSeconds(layout);
  const verdictLead = wide ? 3.6 : 3.2;

  const list = [
    {
      id: 'prompt',
      seconds: wide ? 3.2 : 2.8,
      caption: 'One real case. One question: is this a prompt injection?',
    },
    {
      id: 'jev',
      seconds: wide ? 1.8 : 1.6,
      caption: 'Jev answers.',
    },
    {
      id: 'race',
      seconds: 0.6 + raceWindow + (wide ? 2.4 : 1.9),
      caption: 'Jev has categorized before Claude has finished thinking.',
    },
    {
      id: 'thousand',
      seconds: wide ? 8.5 : 7.6,
      caption: 'Now do it a thousand times.',
    },
    {
      id: 'accuracy',
      seconds: (wide ? 6.4 : 5.9) + verdictLead,
      caption: 'And this is what the speed costs.',
    },
    {
      id: 'end',
      seconds: wide ? 4.5 : 4,
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
  const jev = jevOf(data);
  const lines = [];
  for (const fam of ['claude-nothink', 'claude-think']) {
    const tier = v.equivalent_tier && v.equivalent_tier[fam];
    const label = (v.equivalent_tier_label && v.equivalent_tier_label[fam]) || tier;
    const weak = weakestOf(data, fam);
    if (tier) {
      lines.push({
        head: 'as good as ' + label,
        tail: FAMILY_WORDS[fam],
        good: true,
      });
    } else if (weak && jev && jev.accuracy.point < weak.accuracy.point) {
      lines.push({head: 'below ' + weak.label, tail: FAMILY_WORDS[fam], good: false});
    } else {
      lines.push({
        head: 'clears no tier at ' + (v.margin_pts || 2) + ' points',
        tail: FAMILY_WORDS[fam],
        good: false,
      });
    }
  }
  const ws = v.weakest_stratum;
  const names = {fr: 'French', en: 'English'};
  const weakest = ws
    ? (names[ws.group] || ws.group) + ' ' + ws.delta_pts.toFixed(0) + ' points vs ' + (names[ws.vs] || ws.vs)
    : null;
  return {lines, weakest, marginPts: v.margin_pts || 2};
}

/**
 * One line per beat. `caption` is what is burned into the frame; `srt` is what the
 * subtitle file says, which on the closing beats is the templated verdict itself.
 */
export function captionLines(data, layout) {
  const v = verdict(data);
  return beats(data, layout).map((b) => {
    if (b.id === 'accuracy') {
      return {...b, srt: 'Jev is ' + v.lines[0].head + ' (' + v.lines[0].tail + ').'};
    }
    if (b.id === 'end') {
      return {
        ...b,
        srt:
          'Jev is ' + v.lines[0].head + ' (' + v.lines[0].tail + '); ' +
          v.lines[1].head + ' (' + v.lines[1].tail + ').',
      };
    }
    return {...b, srt: b.caption};
  });
}
