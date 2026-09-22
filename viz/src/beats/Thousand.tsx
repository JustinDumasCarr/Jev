import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {Caption, Tag} from '../chrome';
import {C, SANS, claudeColor, clock, money, tabular, upper} from '../theme';
import {jevOf, panels} from '../timeline.mjs';
import type {FilmProps, System} from '../types';

/* Beat 4 — a thousand in a row. A leaderboard of odometers in time-lapse.

   Each row counts at that system's own p50: count = floor(wall clock / p50), capped at
   1,000. The clocks read the real wall time a single stream would take, and the cost
   counters are the real cost of the calls made so far. The time-lapse factor is stated
   on screen, because it is the one thing on this frame that is not real time. */

const TARGET = 1000;

const Row: React.FC<{
  sys: System;
  color: string;
  wallMs: number;
  u: number;
  width: number;
  index: number;
  isJev: boolean;
}> = ({sys, color, wallMs, u, width, index, isJev}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const p50 = sys.latency_ms.p50 ?? 1;
  const done = Math.min(TARGET, Math.floor(wallMs / p50));
  const finished = done >= TARGET;
  const ownMs = Math.min(wallMs, TARGET * p50);
  const costSoFar = ((sys.cost_per_1000_usd ?? 0) / TARGET) * done;
  const enter = spring({frame: frame - index * 2, fps, config: {damping: 200}, durationInFrames: 14});

  const h = 66 * u;
  return (
    <div
      style={{
        position: 'relative',
        height: h,
        borderRadius: 14 * u,
        overflow: 'hidden',
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${finished ? color : C.hair}`,
        opacity: enter,
        transform: `translateX(${interpolate(enter, [0, 1], [-40, 0])}px)`,
      }}
    >
      {/* the progress fill is linear in the count: it IS the count */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: `${(done / TARGET) * 100}%`,
          background: isJev ? 'rgba(255,106,43,0.22)' : `${color}1f`,
          borderRight: `${2 * u}px solid ${color}`,
        }}
      />
      <div
        style={{
          position: 'relative',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          padding: `0 ${22 * u}px`,
          gap: 16 * u,
        }}
      >
        <span
          style={{
            fontFamily: SANS,
            fontWeight: 700,
            fontSize: 28 * u,
            color: isJev ? C.accent : C.ink,
            width: 196 * u,
            whiteSpace: 'nowrap',
          }}
        >
          {sys.label}
        </span>
        {isJev ? <Tag size={12 * u} color={C.accent}>via OpenRouter</Tag> : <Tag size={12 * u}>thinking off</Tag>}
        <span style={{flex: 1}} />
        <span
          style={{
            ...tabular,
            fontWeight: 800,
            fontSize: 40 * u,
            color: finished ? color : C.ink,
            width: 150 * u,
            textAlign: 'right',
          }}
        >
          {done}
        </span>
        <span style={{...tabular, fontSize: 30 * u, color: C.ink2, width: 150 * u, textAlign: 'right'}}>
          {clock(ownMs)}
        </span>
        <span
          style={{
            ...tabular,
            fontSize: 30 * u,
            color: isJev ? C.accent : C.ink2,
            width: 130 * u,
            textAlign: 'right',
          }}
        >
          {money(costSoFar)}
        </span>
      </div>
    </div>
  );
};

export const Thousand: React.FC<FilmProps & {caption: string}> = ({data, layout, caption}) => {
  const frame = useCurrentFrame();
  const {fps, width, height, durationInFrames} = useVideoConfig();
  const u = height / 1080;
  const jev = jevOf(data) as System;
  const ps = panels(data, layout) as {sys: System; tier: number}[];
  const rows: {sys: System; color: string; isJev: boolean}[] = [
    {sys: jev, color: C.accent, isJev: true},
    ...ps.map((p) => ({sys: p.sys, color: claudeColor(p.tier), isJev: false})),
  ];

  const slowest = Math.max(...rows.map((r) => r.sys.latency_ms.p50 ?? 0));
  const spanMs = slowest * TARGET;
  const runFrames = durationInFrames - Math.round(1.0 * fps);
  const wallMs = interpolate(frame, [Math.round(0.35 * fps), runFrames], [0, spanMs], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const speed = Math.round(spanMs / 1000 / (runFrames / fps));

  const titleIn = spring({frame, fps, config: {damping: 200}, durationInFrames: 12});

  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          top: 60 * u,
          left: 0,
          right: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 14 * u,
          opacity: titleIn,
        }}
      >
        <div
          style={{
            fontFamily: SANS,
            fontWeight: 700,
            fontSize: 74 * u,
            letterSpacing: '-0.035em',
            color: C.ink,
          }}
        >
          Now do it 1,000 times.
        </div>
        <div style={{display: 'flex', gap: 12 * u, alignItems: 'center'}}>
          <Tag size={15 * u} color={C.accent} solid>
            ×{speed.toLocaleString()} speed
          </Tag>
          <Tag size={15 * u}>one stream · p50 × 1,000</Tag>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          top: 246 * u,
          left: layout === 'wide' ? 300 * u : 54 * u,
          right: layout === 'wide' ? 300 * u : 54 * u,
          display: 'flex',
          flexDirection: 'column',
          gap: 8 * u,
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 16 * u,
            padding: `0 ${22 * u}px`,
            ...upper(0.2),
            fontSize: 15 * u,
            color: C.ink3,
          }}
        >
          <span style={{flex: 1}} />
          <span style={{width: 150 * u, textAlign: 'right'}}>decisions</span>
          <span style={{width: 150 * u, textAlign: 'right'}}>wall clock</span>
          <span style={{width: 130 * u, textAlign: 'right'}}>cost</span>
        </div>
        {rows.map((r, i) => (
          <Row
            key={r.sys.system}
            sys={r.sys}
            color={r.color}
            wallMs={wallMs}
            u={u}
            width={width}
            index={i}
            isJev={r.isJev}
          />
        ))}
      </div>

      <Caption text={caption} width={width} />
    </AbsoluteFill>
  );
};
