import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, SANS, claudeColor, pct, shortLatency, tabular, upper} from '../theme';
import {Ambient, EASE_OUT, SNAP, StageWatermark, clamp01, ramp, useCamera} from '../stage';
import {jevOf, panels, verdict} from '../timeline.mjs';
import type {FilmProps, System} from '../types';
import {stringsFor} from '../strings';

/* ANIMATION-PLAN.md §4 — the scoreboard.
 *
 * Nine rows, one per system, sorted by accuracy. Per row: a bar for median
 * response time, linear in milliseconds and labelled, with the route it was
 * measured through in small type; and a bar for accuracy with the 95% interval
 * drawn as a whisker across it. The bars stagger in, the verdict sits under them.
 *
 * Both bars are linear in their measurement. Only the stagger is sprung. */

export const Scoreboard: React.FC<FilmProps & {standalone?: boolean}> = ({
  data,
  layout,
  standalone,
}) => {
  const frame = useCurrentFrame();
  const {fps, width, height, durationInFrames} = useVideoConfig();
  const u = height / 1080;
  const wide = layout === 'wide';
  const T = stringsFor(data.meta.task);
  const jev = jevOf(data) as System;
  const ps = panels(data, layout) as {sys: System; tier: number}[];

  const rows = [
    {sys: jev, color: C.accent, isJev: true},
    ...ps.map((p) => ({sys: p.sys, color: claudeColor(p.tier), isJev: false})),
  ].sort((a, b) => b.sys.accuracy.point - a.sys.accuracy.point);

  const maxMs = Math.max(...rows.map((r) => r.sys.latency_ms.p50 ?? 0), 1);
  let lo = 1;
  let hi = 0;
  rows.forEach((r) => {
    lo = Math.min(lo, r.sys.accuracy.ci_low);
    hi = Math.max(hi, r.sys.accuracy.ci_high);
  });
  lo = Math.max(0, lo - 0.03);
  hi = Math.min(1, hi + 0.02);

  const pad = (wide ? 84 : 56) * u;
  const contentW = width - pad * 2;
  const nameW = (wide ? 210 : 190) * u;
  const gutter = 26 * u;
  const barsW = contentW - nameW - gutter;
  const timeW = barsW * 0.44;
  const accW = barsW - timeW - gutter;
  const top = (standalone ? 214 : 196) * u;
  const rowH = (wide ? 62 : 64) * u;

  const v = verdict(data);
  const enter = ramp(frame, 0, 8, EASE_OUT);
  const exit = standalone ? 0 : ramp(frame, durationInFrames - 9, durationInFrames, EASE_OUT);
  const cam = useCamera([
    {at: 0, zoom: 1.03, x: width / 2, y: height / 2},
    {at: durationInFrames, zoom: 1, x: width / 2, y: height / 2},
  ]);
  const verdictAt = Math.round((standalone ? 3.4 : 2.6) * fps);

  return (
    <AbsoluteFill style={{backgroundColor: C.bg, opacity: enter, transform: `scale(${1 + exit * 0.03})`}}>
      <Ambient glow="rgba(64,104,180,0.15)" cam={cam} />

      <div style={{position: 'absolute', top: 52 * u, left: pad}}>
        <div
          style={{
            fontFamily: SANS,
            fontWeight: 700,
            fontSize: 34 * u,
            color: C.ink,
            letterSpacing: '-0.02em',
          }}
        >
          {T.scoreboardTitle}
        </div>
        <div style={{...upper(0.16), fontSize: 16 * u, color: C.ink3, marginTop: 10 * u}}>
          {data.meta.task_label} · {data.meta.split} split · n={jev.n} per system · sorted by accuracy
        </div>
      </div>

      <div style={{position: 'absolute', top: top - 30 * u, left: pad + nameW, width: barsW, display: 'flex', gap: gutter}}>
        <div style={{width: timeW, ...upper(0.18), fontSize: 15 * u, color: C.ink3}}>
          median response time
        </div>
        <div style={{width: accW, ...upper(0.18), fontSize: 15 * u, color: C.ink3}}>
          accuracy · 95% interval
        </div>
      </div>

      <div style={{position: 'absolute', top, left: pad, width: contentW}}>
        {rows.map((r, i) => {
          const s = spring({frame: frame - 6 - i * 2.5, fps, config: SNAP, durationInFrames: 22});
          const ms = r.sys.latency_ms.p50 ?? 0;
          const a = r.sys.accuracy;
          const xOf = (p: number) => clamp01((p - lo) / (hi - lo));
          return (
            <div
              key={r.sys.system}
              style={{
                height: rowH,
                display: 'flex',
                alignItems: 'center',
                gap: gutter,
                opacity: s,
                transform: `translateX(${interpolate(s, [0, 1], [-26, 0])}px)`,
              }}
            >
              <div style={{width: nameW, minWidth: 0}}>
                <div
                  style={{
                    fontFamily: SANS,
                    fontWeight: 700,
                    fontSize: 26 * u,
                    color: r.isJev ? C.accent : C.ink,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {r.sys.label}
                </div>
                <div style={{...upper(0.14), fontSize: 13 * u, color: C.ink3}}>
                  {r.isJev ? 'via OpenRouter' : 'via Claude Code · thinking off'}
                </div>
              </div>

              {/* median response time — linear in milliseconds */}
              <div style={{width: timeW, display: 'flex', alignItems: 'center', gap: 12 * u}}>
                <div style={{flex: 1, height: 22 * u, borderRadius: 5 * u, background: 'rgba(255,255,255,0.05)'}}>
                  <div
                    style={{
                      width: `${(ms / maxMs) * 100 * clamp01(s)}%`,
                      height: '100%',
                      borderRadius: 5 * u,
                      background: r.color,
                    }}
                  />
                </div>
                <span style={{...tabular, fontWeight: 700, fontSize: 22 * u, color: r.isJev ? C.accent : C.ink, width: 92 * u, textAlign: 'right'}}>
                  {shortLatency(ms)}
                </span>
              </div>

              {/* accuracy, with the interval as a whisker across the bar */}
              <div style={{width: accW, display: 'flex', alignItems: 'center', gap: 12 * u}}>
                <div style={{position: 'relative', flex: 1, height: 22 * u, borderRadius: 5 * u, background: 'rgba(255,255,255,0.05)'}}>
                  <div
                    style={{
                      width: `${xOf(a.point) * 100 * clamp01(s)}%`,
                      height: '100%',
                      borderRadius: 5 * u,
                      background: r.color,
                      opacity: 0.85,
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      left: `${xOf(a.ci_low) * 100}%`,
                      width: `${(xOf(a.ci_high) - xOf(a.ci_low)) * 100}%`,
                      top: '50%',
                      height: 3 * u,
                      marginTop: -1.5 * u,
                      background: C.ink,
                      opacity: 0.85 * clamp01(s),
                    }}
                  />
                  {[a.ci_low, a.ci_high].map((x) => (
                    <div
                      key={x}
                      style={{
                        position: 'absolute',
                        left: `${xOf(x) * 100}%`,
                        top: 2 * u,
                        bottom: 2 * u,
                        width: 3 * u,
                        background: C.ink,
                        opacity: 0.85 * clamp01(s),
                      }}
                    />
                  ))}
                </div>
                <span style={{...tabular, fontWeight: 700, fontSize: 22 * u, color: r.isJev ? C.accent : C.ink, width: 86 * u, textAlign: 'right'}}>
                  {pct(a.point)}
                </span>
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
          bottom: standalone ? 128 * u : 96 * u,
          textAlign: 'center',
          opacity: ramp(frame, verdictAt, verdictAt + 12, EASE_OUT),
          transform: `translateY(${interpolate(ramp(frame, verdictAt, verdictAt + 12, EASE_OUT), [0, 1], [18, 0])}px)`,
          fontFamily: SANS,
          fontWeight: 700,
          fontSize: (wide ? 44 : 40) * u,
          letterSpacing: '-0.03em',
          color: C.ink,
        }}
      >
        Jev is {v.lines[0].head}{' '}
        <span style={{...upper(0.14), fontSize: 20 * u, color: C.ink3}}>{v.lines[0].tail}</span>
      </div>

      <div
        style={{
          position: 'absolute',
          left: pad,
          right: pad,
          bottom: 38 * u,
          textAlign: 'center',
          fontFamily: SANS,
          fontWeight: 500,
          fontSize: 17 * u,
          color: C.ink3,
          lineHeight: 1.5,
        }}
      >
        {data.meta.task_label} · {data.meta.filter} · {data.meta.split} split · {data.meta.run_date} ·
        git {data.meta.git_sha}
        {data.meta.n_note ? <><br />{data.meta.n_note}</> : null}
        {standalone ? (
          <>
            <br />
            Claude latency via Claude Code (duration_api_ms, effort low, thinking off); Jev via
            OpenRouter. Non-inferiority margin {v.marginPts} points, fixed before any data.
          </>
        ) : null}
      </div>

      <StageWatermark data={data} />
    </AbsoluteFill>
  );
};
