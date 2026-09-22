import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, SANS, claudeColor, pct, shortLatency, tabular, upper} from '../theme';
import {Ambient, EASE_OUT, SNAP, StageWatermark, ramp, useCamera} from '../stage';
import {blocksSystems, jevOf, verdict, verdictSentence} from '../timeline.mjs';
import {stringsFor} from '../strings';
import type {FilmProps, System} from '../types';

/* ANIMATION-PLAN.md §5f — the third section, replacing the towers and the
 * scoreboard: one vertical ranked list, best at the top. Per row the system's
 * name, its accuracy beside it in large type with the 95% interval small under
 * that, and its median response time in small grey type under the name. Jev is
 * highlighted and sits at its true rank — never moved. Rows stagger in, the
 * verdict follows. */

export const Ranking: React.FC<FilmProps> = ({data, layout}) => {
  const frame = useCurrentFrame();
  const {fps, width, height, durationInFrames} = useVideoConfig();
  const u = height / 1080;
  const wide = layout === 'wide';
  const T = stringsFor(data.meta.task);
  const jev = jevOf(data) as System;

  // Six in the square cut, everything in the wide one.
  const pool: System[] = wide
    ? (data.systems as System[])
    : (blocksSystems(data) as System[]);
  const rows = [...pool].sort((a, b) => b.accuracy.point - a.accuracy.point);

  const pad = (wide ? 90 : 60) * u;
  const contentW = width - pad * 2;
  const top = (wide ? 150 : 196) * u;
  const bottom = height - (wide ? 210 : 230) * u;
  const rowH = Math.min((wide ? 52 : 92) * u, (bottom - top) / rows.length);

  const v = verdict(data);
  const enter = ramp(frame, 0, 8, EASE_OUT);
  const exit = ramp(frame, durationInFrames - 9, durationInFrames, EASE_OUT);
  const cam = useCamera([
    {at: 0, zoom: 1.03, x: width / 2, y: height / 2},
    {at: durationInFrames, zoom: 1, x: width / 2, y: height / 2},
  ]);
  const verdictAt = Math.round(2.4 * fps);
  const vIn = ramp(frame, verdictAt, verdictAt + 14, EASE_OUT);

  return (
    <AbsoluteFill style={{backgroundColor: C.bg, opacity: enter, transform: `scale(${1 + exit * 0.03})`}}>
      <Ambient glow="rgba(64,104,180,0.15)" cam={cam} />

      <div style={{position: 'absolute', top: 52 * u, left: pad}}>
        <div style={{fontFamily: SANS, fontWeight: 700, fontSize: 34 * u, color: C.ink, letterSpacing: '-0.02em'}}>
          {T.scoreboardTitle}
        </div>
        <div style={{...upper(0.16), fontSize: 16 * u, color: C.ink3, marginTop: 10 * u}}>
          {data.meta.task_label} · {data.meta.split} split · n={jev.n} per system · best first
        </div>
      </div>

      <div style={{position: 'absolute', top, left: pad, width: contentW}}>
        {rows.map((s, i) => {
          const isJev = s.family === 'jev';
          const color = isJev ? C.accent : claudeColor(s.tier_rank ?? 0);
          const e = spring({frame: frame - 6 - i * 2.5, fps, config: SNAP, durationInFrames: 22});
          return (
            <div
              key={s.system}
              style={{
                height: rowH,
                display: 'flex',
                alignItems: 'center',
                gap: 20 * u,
                padding: `0 ${18 * u}px`,
                borderRadius: 12 * u,
                background: isJev ? 'rgba(255,106,43,0.13)' : 'transparent',
                border: `1px solid ${isJev ? `${C.accent}66` : 'transparent'}`,
                borderBottom: isJev ? `1px solid ${C.accent}66` : '1px solid rgba(255,255,255,0.07)',
                opacity: e,
                transform: `translateX(${interpolate(e, [0, 1], [-30, 0])}px)`,
              }}
            >
              <span
                style={{
                  ...tabular,
                  fontSize: (wide ? 20 : 26) * u,
                  color: isJev ? C.accent : C.ink3,
                  width: (wide ? 40 : 52) * u,
                }}
              >
                {i + 1}
              </span>

              <div style={{minWidth: 0, flex: 1}}>
                <div
                  style={{
                    fontFamily: SANS,
                    fontWeight: 700,
                    fontSize: (wide ? 26 : 34) * u,
                    color: isJev ? C.accent : C.ink,
                    whiteSpace: 'nowrap',
                    letterSpacing: '-0.02em',
                  }}
                >
                  {s.label}
                  {wide && s.family === 'claude-think' ? (
                    <span style={{...upper(0.12), fontSize: 14 * u, color: C.ink3, marginLeft: 10 * u}}>
                      thinking on
                    </span>
                  ) : null}
                </div>
                <div style={{...tabular, fontSize: (wide ? 16 : 20) * u, color: C.ink3, marginTop: 2 * u}}>
                  {shortLatency(s.latency_ms.p50)}
                  {isJev ? ' · via OpenRouter' : ''}
                </div>
              </div>

              <div style={{textAlign: 'right'}}>
                <div
                  style={{
                    ...tabular,
                    fontWeight: 800,
                    fontSize: (wide ? 34 : 52) * u,
                    lineHeight: 1,
                    color: isJev ? C.accent : C.ink,
                  }}
                >
                  {pct(s.accuracy.point)}
                </div>
                <div style={{...tabular, fontSize: (wide ? 14 : 18) * u, color: C.ink3, marginTop: 3 * u}}>
                  {pct(s.accuracy.ci_low, 0)}–{pct(s.accuracy.ci_high, 0)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          position: 'absolute',
          left: pad,
          right: pad,
          bottom: 104 * u,
          textAlign: 'center',
          opacity: vIn,
          transform: `translateY(${interpolate(vIn, [0, 1], [18, 0])}px)`,
          fontFamily: SANS,
          fontWeight: 700,
          fontSize: (wide ? 42 : 40) * u,
          letterSpacing: '-0.03em',
          color: C.ink,
        }}
      >
        {verdictSentence(v.lines[0])}{' '}
        <span style={{...upper(0.14), fontSize: 20 * u, color: C.ink3}}>{v.lines[0].tail}</span>
        {v.nearestNote ? (
          <div style={{...tabular, fontWeight: 500, fontSize: 21 * u, color: C.ink3, marginTop: 10 * u}}>
            {v.nearestNote}
          </div>
        ) : null}
      </div>

      <div
        style={{
          position: 'absolute',
          left: pad,
          right: pad,
          bottom: 40 * u,
          textAlign: 'center',
          ...upper(0.14),
          fontSize: 16 * u,
          color: C.ink3,
          lineHeight: 1.6,
        }}
      >
        {data.meta.n_note ? data.meta.n_note + ' · ' : ''}
        non-inferiority margin {v.marginPts} points, fixed before any data
      </div>

      <StageWatermark data={data} />
    </AbsoluteFill>
  );
};
