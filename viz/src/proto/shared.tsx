import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {Backdrop, Tag, Watermark} from '../chrome';
import {C, SANS, claudeColor, tabular, upper} from '../theme';
import {jevOf, panels} from '../timeline.mjs';
import type {FilmProps, System} from '../types';

/* ANIMATION-PLAN.md §5c — the prototype round. Five motion metaphors for the race beat,
   each about 8 s, same nine systems, same corner stopwatch, same rule: whatever encodes
   the measurement moves strictly linearly in time, and springs are only ever allowed on
   objects and impacts. */

export const LEAD = 0.55; // seconds before the race starts: everything settles in
export const HOLD = 1.6; // seconds of silence after the last system lands

export type Racer = {
  sys: System;
  ms: number;
  color: string;
  isJev: boolean;
  index: number;
};

export const heroMs = (s: System) => s.hero?.duration_api_ms ?? s.latency_ms.p50 ?? 0;

/** Jev first (it lands first and the eye should start there), then Claude in tier order. */
export function racers(data: FilmProps['data']): Racer[] {
  const jev = jevOf(data) as System;
  const ps = panels(data, 'square') as {sys: System; tier: number}[];
  return [
    {sys: jev, ms: heroMs(jev), color: C.accent, isJev: true, index: 0},
    ...ps.map((p, i) => ({
      sys: p.sys,
      ms: heroMs(p.sys),
      color: claudeColor(p.tier),
      isJev: false,
      index: i + 1,
    })),
  ];
}

/**
 * The clock for a race prototype. One shared playback rate for every lane, stated on
 * screen: elapsed is linear in the frame number and nothing is eased.
 */
export function useRaceClock(rs: Racer[], windowSeconds: number) {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();
  const slowest = Math.max(...rs.map((r) => r.ms));
  const run = windowSeconds ?? durationInFrames / fps - LEAD - HOLD;
  const speed = Math.min(1, slowest / 1000 / run);
  const elapsed = Math.max(0, Math.min(slowest, (frame / fps - LEAD) * 1000 * speed));
  return {elapsed, slowest, speed, started: frame / fps >= LEAD};
}

export const ProtoFrame: React.FC<{
  data: FilmProps['data'];
  code: string;
  title: string;
  elapsed: number;
  speed: number;
  clockLabel?: string;
  clockText?: string;
  children: React.ReactNode;
}> = ({data, code, title, elapsed, speed, clockLabel, clockText, children}) => {
  const {width, height} = useVideoConfig();
  const u = height / 1080;
  return (
    <AbsoluteFill style={{backgroundColor: C.bg}}>
      <Backdrop glow="rgba(70,110,190,0.17)" />
      {children}

      {/* corner stopwatch — the protagonist, in every prototype */}
      <div
        style={{
          position: 'absolute',
          top: 44 * u,
          right: 52 * u,
          textAlign: 'right',
        }}
      >
        <div
          style={{
            ...tabular,
            fontWeight: 800,
            fontSize: 92 * u,
            lineHeight: 0.92,
            color: C.ink,
            letterSpacing: '-0.035em',
          }}
        >
          {clockText ?? (elapsed / 1000).toFixed(2)}
          {clockText ? null : <span style={{fontSize: 34 * u, color: C.ink2}}> s</span>}
        </div>
        <div style={{...upper(0.2), fontSize: 15 * u, color: C.ink3, marginTop: 4 * u}}>
          {clockLabel ?? (speed >= 0.995 ? 'elapsed · real time' : `elapsed · ×${speed.toFixed(2)} speed`)}
        </div>
      </div>

      <div style={{position: 'absolute', top: 52 * u, left: 52 * u}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 14 * u}}>
          {/* the prototype's number, so a contact sheet frame identifies itself */}
          <span
            style={{
              ...upper(0.1),
              fontSize: 26 * u,
              color: '#140600',
              background: C.accent,
              borderRadius: 8 * u,
              padding: `${5 * u}px ${12 * u}px`,
              lineHeight: 1,
            }}
          >
            {code}
          </span>
          <div
            style={{
              fontFamily: SANS,
              fontWeight: 700,
              fontSize: 40 * u,
              color: C.ink,
              letterSpacing: '-0.03em',
            }}
          >
            {title}
          </div>
        </div>
        <div style={{marginTop: 10 * u, display: 'flex', gap: 8 * u}}>
          <Tag size={13 * u}>Jev vs 8 Claude · thinking off</Tag>
        </div>
      </div>

      <Watermark fixture={data.meta.fixture === true} width={width} height={height} />
    </AbsoluteFill>
  );
};

/** The small identity plate every lane carries: name, and "via OpenRouter" for Jev. */
export const LaneLabel: React.FC<{r: Racer; u: number; size?: number; align?: 'left' | 'right'}> = ({
  r,
  u,
  size = 26,
  align = 'left',
}) => (
  <div style={{textAlign: align}}>
    <div
      style={{
        fontFamily: SANS,
        fontWeight: 700,
        fontSize: size * u,
        color: r.isJev ? C.accent : C.ink,
        whiteSpace: 'nowrap',
        letterSpacing: '-0.015em',
      }}
    >
      {r.sys.label}
    </div>
  </div>
);
