import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, SANS, claudeColor, pct, shortLatency, tabular, upper} from '../theme';
import {Ambient, EASE_OUT, SNAP, StageWatermark, ramp, useCamera} from '../stage';
import {blocksSystems, jevOf, verdictBlock} from '../timeline.mjs';
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
  // fastest first: the list is ordered by what the film is about
  const rows = [...pool].sort((a, b) => (a.latency_ms.p50 ?? 0) - (b.latency_ms.p50 ?? 0));

  const pad = (wide ? 90 : 60) * u;
  const contentW = width - pad * 2;
  const top = (wide ? 150 : 196) * u;
  const bottom = height - (wide ? 210 : 230) * u;
  const rowH = Math.min((wide ? 52 : 74) * u, (bottom - top) / rows.length);

  const v = verdictBlock(data);
  // one line, never wrapped: bold sans at this tracking runs about 0.52em per
  // character, so shrink the type until the sentence fits between the margins
  const headlineSize = Math.min((wide ? 42 : 40) * u, contentW / Math.max(1, v.headline.length * 0.52));
  const smallPrintSize = Math.min(19 * u, contentW / Math.max(1, v.smallPrint.length * 0.48));
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
          {data.meta.task_label} · {data.meta.split} split · n={jev.n} per system · fastest first
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

              <div style={{minWidth: 0, width: (wide ? 210 : 250) * u}}>
                <div
                  style={{
                    fontFamily: SANS,
                    fontWeight: 700,
                    fontSize: (wide ? 24 : 30) * u,
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
                {isJev ? (
                  <div style={{...tabular, fontSize: (wide ? 14 : 17) * u, color: C.ink3, marginTop: 2 * u}}>
                    via OpenRouter
                  </div>
                ) : null}
              </div>

              {/* what this list is sorted by, in the biggest type on the row */}
              <div style={{flex: 1}}>
                <span
                  style={{
                    ...tabular,
                    fontWeight: 800,
                    fontSize: (wide ? 34 : 48) * u,
                    lineHeight: 1,
                    color: isJev ? C.accent : C.ink,
                  }}
                >
                  {shortLatency(s.latency_ms.p50)}
                </span>
              </div>

              <div style={{textAlign: 'right'}}>
                <div
                  style={{
                    ...tabular,
                    fontWeight: 700,
                    fontSize: (wide ? 24 : 32) * u,
                    lineHeight: 1,
                    color: isJev ? C.accent : C.ink2,
                  }}
                >
                  {pct(s.accuracy.point)}
                </div>
                <div style={{...tabular, fontSize: (wide ? 13 : 17) * u, color: C.ink3, marginTop: 3 * u}}>
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
          bottom: 86 * u,
          textAlign: 'center',
          opacity: vIn,
          transform: `translateY(${interpolate(vIn, [0, 1], [18, 0])}px)`,
          fontFamily: SANS,
          fontWeight: 700,
          fontSize: headlineSize,
          letterSpacing: '-0.03em',
          whiteSpace: 'nowrap',
          color: C.ink,
        }}
      >
        {v.headline}
      </div>

      <div
        style={{
          position: 'absolute',
          left: pad,
          right: pad,
          bottom: 44 * u,
          textAlign: 'center',
          opacity: vIn,
          fontFamily: SANS,
          fontWeight: 500,
          fontSize: smallPrintSize,
          color: C.ink3,
          whiteSpace: 'nowrap',
        }}
      >
        {v.smallPrint}
      </div>

      <StageWatermark data={data} />
    </AbsoluteFill>
  );
};
