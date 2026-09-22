import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, SANS, claudeColor, pct, tabular, upper} from '../theme';
import {Ambient, EASE_OUT, SNAP, StageWatermark, clamp01, ramp, useCamera} from '../stage';
import {jevOf, panels, verdict} from '../timeline.mjs';
import type {FilmProps, System} from '../types';

/* ANIMATION-PLAN.md §5e — the results beat, replacing the accuracy targets.
 *
 * One tower per system, built in fast time-lapse from every test case that system
 * answered: one brick per case, green when it matched gold and red when it did
 * not. Every tower is the same height, because every system answered the same n —
 * so the red band alone is the error rate, and nothing is a picture of a summary
 * statistic. Jev's builds last. The verdict types in at the end. */

type Res = {n: number; correct_sequence: string; precision: number | null; recall: number | null};

/** Runs of identical outcome, so 700 cases cost a handful of rects, not 700. */
function runs(seq: string, upTo: number) {
  const out: {ok: boolean; from: number; len: number}[] = [];
  for (let i = 0; i < upTo; ) {
    const ok = seq[i] === '1';
    let j = i;
    while (j < upTo && (seq[j] === '1') === ok) j++;
    out.push({ok, from: i, len: j - i});
    i = j;
  }
  return out;
}

const Tower: React.FC<{
  sys: System;
  color: string;
  isJev: boolean;
  build: number; // 0..1, linear in the number of cases shown
  w: number;
  h: number;
  u: number;
  wide: boolean;
}> = ({sys, color, isJev, build, w, h, u, wide}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const res = (sys as unknown as {results: Res}).results;
  const seq = res?.correct_sequence ?? '';
  const n = seq.length || 1;
  const shown = Math.floor(clamp01(build) * n); // linear: it is the case count
  const unit = (h - 4 * u) / n;
  const a = sys.accuracy;
  const labelIn = ramp(frame, 0, 10, EASE_OUT);

  return (
    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', width: w}}>
      <div
        style={{
          position: 'relative',
          width: w * (wide ? 0.62 : 0.56),
          height: h,
          borderRadius: 5 * u,
          background: 'rgba(255,255,255,0.035)',
          border: `1px solid ${isJev ? `${C.accent}66` : 'rgba(255,255,255,0.07)'}`,
        }}
      >
        {runs(seq, shown).map((r) => (
          <div
            key={r.from}
            style={{
              position: 'absolute',
              left: 2 * u,
              right: 2 * u,
              bottom: 2 * u + r.from * unit,
              height: Math.max(0.6, r.len * unit),
              background: r.ok ? C.good : C.wrong,
              boxShadow:
                r.ok || r.len * unit < 3 * u
                  ? 'none'
                  : `inset 0 0 0 ${Math.max(0.8, u)}px ${C.wrongEdge}`,
            }}
          />
        ))}
      </div>

      <div style={{textAlign: 'center', marginTop: 12 * u, opacity: labelIn}}>
        <div
          style={{
            fontFamily: SANS,
            fontWeight: 700,
            fontSize: (wide ? 19 : 20) * u,
            color: isJev ? C.accent : C.ink,
            lineHeight: 1.12,
          }}
        >
          {sys.label}
        </div>
        <div
          style={{
            ...tabular,
            fontWeight: 800,
            fontSize: (wide ? 27 : 29) * u,
            color: isJev ? C.accent : C.ink,
            marginTop: 5 * u,
          }}
        >
          {pct(a.point)}
        </div>
        <div style={{...tabular, fontSize: (wide ? 14 : 15) * u, color: C.ink3, marginTop: 2 * u}}>
          {pct(a.ci_low, 0)}–{pct(a.ci_high, 0)}
        </div>
        <div style={{...tabular, fontSize: (wide ? 14 : 15) * u, color: C.ink3, marginTop: 4 * u}}>
          P {res?.precision == null ? '—' : Math.round(res.precision * 100)} · R{' '}
          {res?.recall == null ? '—' : Math.round(res.recall * 100)}
        </div>
      </div>
    </div>
  );
};

export const Results: React.FC<FilmProps> = ({data, layout}) => {
  const frame = useCurrentFrame();
  const {fps, width, height, durationInFrames} = useVideoConfig();
  const u = height / 1080;
  const wide = layout === 'wide';
  const jev = jevOf(data) as System;
  const ps = panels(data, layout) as {sys: System; tier: number}[];

  // The wide cut shows both Claude families; the square the eight no-thinking ones.
  const claude = wide
    ? (data.systems.filter((s) => s.family !== 'jev') as System[]).sort(
        (a, b) => (a.tier_rank ?? 0) - (b.tier_rank ?? 0) || (a.thinking ? -1 : 1),
      )
    : ps.map((p) => p.sys);
  const towers = [
    ...claude.map((s) => ({
      sys: s,
      color: claudeColor(s.tier_rank ?? 0),
      isJev: false,
    })),
    {sys: jev, color: C.accent, isJev: true},
  ];

  const buildFrames = Math.round((wide ? 5.4 : 5.0) * fps);
  const stagger = Math.round(buildFrames * 0.45) / Math.max(1, towers.length - 1);
  const perTower = buildFrames - stagger * (towers.length - 1);

  const verdictStart = durationInFrames - Math.round((wide ? 3.6 : 3.2) * fps);
  const v = verdict(data);
  const enter = ramp(frame, 0, 8, EASE_OUT);
  const exit = ramp(frame, durationInFrames - 9, durationInFrames, EASE_OUT);
  const cam = useCamera([
    {at: 0, zoom: 1.04, x: width / 2, y: height / 2 - 30 * u},
    {at: durationInFrames, zoom: 1, x: width / 2, y: height / 2},
  ]);

  const pad = (wide ? 56 : 44) * u;
  const contentW = width - pad * 2;
  const slotW = contentW / towers.length;
  const towerH = (wide ? 430 : 400) * u;
  const top = (wide ? 176 : 196) * u;

  const words = ('Jev is ' + v.lines[0].head).split(' ');
  const shownWords = Math.floor(Math.max(0, frame - verdictStart) / 3.2);

  return (
    <AbsoluteFill style={{backgroundColor: C.bg, opacity: enter, transform: `scale(${1 + exit * 0.03})`}}>
      <Ambient glow="rgba(64,104,180,0.14)" cam={cam} />

      <div
        style={{
          position: 'absolute',
          top: 52 * u,
          left: pad,
          fontFamily: SANS,
          fontWeight: 700,
          fontSize: 34 * u,
          color: C.ink,
          letterSpacing: '-0.02em',
        }}
      >
        Every test case, one brick each.
      </div>
      <div
        style={{
          position: 'absolute',
          top: 100 * u,
          left: pad,
          ...upper(0.16),
          fontSize: 16 * u,
          color: C.ink3,
        }}
      >
        {data.meta.split} split · n={(jev as unknown as {results: Res}).results?.n ?? jev.n} per
        system · green = matched gold, red = missed · attack = prompt injection
      </div>

      <div
        style={{
          position: 'absolute',
          top,
          left: pad,
          width: contentW,
          display: 'flex',
          transform: cam.transform,
          transformOrigin: '0 0',
        }}
      >
        {towers.map((t, i) => (
          <div key={t.sys.system} style={{width: slotW}}>
            <Tower
              sys={t.sys}
              color={t.color}
              isJev={t.isJev}
              build={clamp01((frame - i * stagger) / perTower)}
              w={slotW}
              h={towerH}
              u={u}
              wide={wide}
            />
          </div>
        ))}
      </div>

      {/* the verdict, typed one word at a time, straight out of data.json */}
      <div
        style={{
          position: 'absolute',
          left: pad,
          right: pad,
          bottom: 78 * u,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontFamily: SANS,
            fontWeight: 700,
            fontSize: (wide ? 50 : 46) * u,
            letterSpacing: '-0.03em',
            color: C.ink,
          }}
        >
          {words.map((w, i) => {
            const on = shownWords >= i;
            const pop = spring({frame: frame - verdictStart - i * 3.2, fps, config: SNAP});
            return (
              <span
                key={i}
                style={{
                  display: 'inline-block',
                  marginRight: '0.28em',
                  opacity: on ? 1 : 0,
                  transform: `translateY(${interpolate(on ? Math.min(pop, 1) : 0, [0, 1], [16, 0])}px)`,
                }}
              >
                {w}
              </span>
            );
          })}
          <span style={{...upper(0.14), fontSize: 22 * u, color: C.ink3, marginLeft: 6 * u}}>
            {shownWords >= words.length ? v.lines[0].tail : ''}
          </span>
        </div>
        {v.weakest && frame > verdictStart + words.length * 3.2 + 6 ? (
          <div
            style={{
              fontFamily: SANS,
              fontWeight: 600,
              fontSize: 26 * u,
              color: C.ink2,
              marginTop: 12 * u,
              opacity: ramp(frame, verdictStart + words.length * 3.2 + 6, verdictStart + words.length * 3.2 + 18),
            }}
          >
            Weakest slice: {v.weakest}.
          </div>
        ) : null}
      </div>

      <div
        style={{
          position: 'absolute',
          left: pad,
          right: pad,
          bottom: 26 * u,
          ...upper(0.14),
          fontSize: 16 * u,
          color: C.ink3,
          textAlign: 'center',
        }}
      >
        * same height everywhere · the red band is the error rate
      </div>

      <StageWatermark data={data} />
    </AbsoluteFill>
  );
};
