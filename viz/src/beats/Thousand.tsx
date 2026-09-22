import React from 'react';
import {AbsoluteFill, interpolate, random, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, SANS, claudeColor, clock, tabular, upper} from '../theme';
import {
  Ambient,
  Camera,
  EASE_OUT,
  POP,
  SNAP,
  STAGGER,
  StageWatermark,
  Timer,
  clamp01,
  ramp,
  useCamera,
} from '../stage';
import {jevOf, panels} from '../timeline.mjs';
import type {FilmProps, System} from '../types';

/* Beat 4 — a thousand decisions.
 *
 * Linear, always: how many cells are lit (wall clock ÷ that system's p50).
 * Craft: cells ignite in a diagonal ripple with per-call jitter, a glow trail
 * and a pop; the camera punches into Jev's block the moment it completes its
 * thousandth; the count row freezes; and the beat exits on a whip rather than
 * a hold. */

/** 1,000 cells either way; the wide cut uses flatter blocks so nine of them fill
 *  a 16:9 frame in a 3x3 instead of stranding a quarter of it. */
const GRID = {square: {cols: 40, rows: 25}, wide: {cols: 50, rows: 20}} as const;
const RUN_AT = 26;

/** Diagonal bands, with each call's position jittered inside its band, so a
 *  block in progress looks like work rather than a drawn triangle. */
const makeOrder = (COLS: number, ROWS: number) => {
  // Sort every cell by its diagonal band plus a deterministic per-call jitter of a
  // few bands, so the advancing front is ragged — a block in progress looks like
  // work being done, not a triangle being drawn.
  const all: {i: number; k: number}[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const i = row * COLS + col;
      all.push({i, k: col + row + (random(`cell-${i}`) - 0.5) * 7});
    }
  }
  all.sort((a, b) => a.k - b.k);
  return all.map((c) => c.i);
};
const ORDERS = {square: makeOrder(40, 25), wide: makeOrder(50, 20)};

const Block: React.FC<{
  sys: System;
  color: string;
  isJev: boolean;
  i: number;
  wallMs: number;
  frozenAt: number | null;
  w: number;
  u: number;
  wide: boolean;
}> = ({sys, color, isJev, i, wallMs, frozenAt, w, u, wide}) => {
  const {cols: COLS, rows: ROWS} = wide ? GRID.wide : GRID.square;
  const ORDER = wide ? ORDERS.wide : ORDERS.square;
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const p50 = sys.latency_ms.p50 ?? 1;
  const effective = frozenAt != null ? Math.min(wallMs, frozenAt) : wallMs;
  const lit = Math.min(1000, Math.floor(effective / p50)); // strictly linear
  const full = lit >= 1000;

  // the blocks arrive quickly: this is the darkest cut in the film otherwise
  const enter = spring({frame: frame - i * 1.4, fps, config: SNAP, durationInFrames: 16});
  const cell = w / COLS;
  const size = cell - Math.max(0.9, cell * 0.17);
  const gridH = ROWS * cell;
  const doneS = full ? spring({frame: frame - (frozenAt != null ? 0 : 0), fps, config: POP}) : 0;
  const breathe = 1 + 0.01 * Math.sin((frame / fps) * 1.1 + i);
  const sheen = ((frame / fps) * 0.24 + i * 0.09) % 1.7;

  const cells = [];
  for (let k = 0; k < lit; k++) {
    const flat = ORDER[k];
    const col = flat % COLS;
    const row = (flat - col) / COLS;
    const age = lit - k;
    const glow = age < 34 ? interpolate(age, [0, 34], [1, 0], {easing: EASE_OUT}) : 0;
    const pop = age < 7 ? interpolate(age, [0, 7], [1.6, 1]) : 1;
    const s = size * pop;
    cells.push(
      <rect
        key={k}
        x={col * cell + (size - s) / 2}
        y={row * cell + (size - s) / 2}
        width={s}
        height={s}
        rx={s * 0.3}
        fill={color}
        opacity={0.48 + glow * 0.52}
      />,
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 9 * u,
        opacity: enter,
        transform: `translateY(${interpolate(enter, [0, 1], [36, 0])}px) scale(${
          interpolate(enter, [0, 1], [0.94, 1]) * breathe
        })`,
      }}
    >
      <div style={{display: 'flex', alignItems: 'baseline', gap: 10 * u}}>
        <span
          style={{
            fontFamily: SANS,
            fontWeight: 700,
            fontSize: (wide ? 31 : 26) * u,
            color: isJev ? C.accent : C.ink,
            whiteSpace: 'nowrap',
          }}
        >
          {sys.label}
        </span>
        <span
          style={{
            ...tabular,
            fontWeight: 800,
            fontSize: (wide ? 40 : 31) * u,
            color: full ? color : C.ink2,
            marginLeft: 'auto',
            transform: `scale(${full ? interpolate(Math.min(doneS, 1), [0, 1], [1.5, 1]) : 1})`,
            textShadow: full ? `0 0 ${22 * u}px ${color}` : 'none',
          }}
        >
          {lit.toLocaleString()}
        </span>
      </div>
      <div style={{position: 'relative'}}>
        <svg width={w} height={gridH} style={{display: 'block', overflow: 'visible'}}>
          <rect width={w} height={gridH} fill="rgba(255,255,255,0.03)" rx={7 * u} />
          <rect
            width={w}
            height={gridH}
            fill="none"
            rx={7 * u}
            stroke={full ? `${color}80` : 'rgba(255,255,255,0.07)'}
            strokeWidth={full ? 2 * u : 1}
          />
          {cells}
        </svg>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 7 * u,
            overflow: 'hidden',
            pointerEvents: 'none',
            opacity: 0.5,
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: -gridH,
              bottom: -gridH,
              width: w * 0.35,
              left: `${(sheen - 0.3) * 120}%`,
              transform: 'rotate(16deg)',
              background:
                'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.07) 50%, rgba(255,255,255,0) 100%)',
            }}
          />
        </div>
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
  const rows = [
    {sys: jev, color: C.accent, isJev: true},
    ...ps.map((p) => ({sys: p.sys, color: claudeColor(p.tier), isJev: false})),
  ];

  const spanMs = (jev.latency_ms.p50 ?? 1) * 1000;
  const runFrames = durationInFrames - RUN_AT - Math.round(3.1 * fps);
  const wallMs = interpolate(frame, [RUN_AT, RUN_AT + runFrames], [0, spanMs], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const speed = Math.round(spanMs / 1000 / (runFrames / fps));
  const jevDone = RUN_AT + runFrames;
  // the resolution: the counts freeze the moment Jev finishes
  const frozen = frame > jevDone + 26 ? spanMs : null;

  const wide = layout === 'wide';
  const cols = 3;
  const gapX = (wide ? 40 : 33) * u;
  const blockW = (width - (wide ? 150 : 130) * u - gapX * (cols - 1)) / cols;
  const gridTop = (wide ? 206 : 262) * u;
  const rowH = (wide ? GRID.wide.rows / GRID.wide.cols : GRID.square.rows / GRID.square.cols) * blockW + 58 * u;
  const jevX = (wide ? 75 : 65) * u + blockW / 2;
  const jevY = gridTop + rowH * 0.42;

  const cam = useCamera([
    {at: 0, zoom: 1, x: width / 2, y: height / 2},
    {at: jevDone - 6, zoom: 1, x: width / 2, y: height / 2},
    {at: jevDone + 12, zoom: 1.8, x: jevX, y: jevY},
    {at: jevDone + 36, zoom: 1.8, x: jevX, y: jevY},
    {at: jevDone + 56, zoom: 1, x: width / 2, y: height / 2},
    {at: durationInFrames - 8, zoom: 1, x: width / 2, y: height / 2},
    {at: durationInFrames, zoom: 1.1, x: width / 2, y: height / 2},
  ]);

  const burst = spring({frame: frame - jevDone, fps, config: POP});
  // the exit: a whip to the left, never a hold
  const whip = ramp(frame, durationInFrames - 8, durationInFrames, EASE_OUT);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: C.bg,
        opacity: ramp(frame, 0, 9, EASE_OUT) * (1 - whip * 0.85),
        transform: `translateX(${-whip * width * 0.55}px)`,
        filter: whip > 0 ? `blur(${whip * 14}px)` : 'none',
      }}
    >
      <Ambient glow="rgba(64,104,180,0.18)" cam={cam} />

      <Camera cam={cam}>
        {frame >= jevDone ? (
          <div
            style={{
              position: 'absolute',
              left: jevX,
              top: jevY,
              width: 2,
              height: 2,
              borderRadius: 999,
              transform: `translate(-50%, -50%) scale(${interpolate(Math.min(burst, 1), [0, 1], [40, 760])})`,
              background: `radial-gradient(circle, rgba(255,106,43,${
                0.6 * (1 - Math.min(burst, 1))
              }) 0%, rgba(255,106,43,0) 70%)`,
            }}
          />
        ) : null}

        <div
          style={{
            position: 'absolute',
            top: gridTop,
            left: (wide ? 75 : 65) * u,
            right: (wide ? 75 : 65) * u,
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            columnGap: gapX,
            rowGap: (wide ? 22 : 30) * u,
          }}
        >
          {rows.map((r, i) => (
            <Block
              key={r.sys.system}
              sys={r.sys}
              color={r.color}
              isJev={r.isJev}
              i={i}
              wallMs={wallMs}
              frozenAt={frozen}
              w={blockW}
              u={u}
              wide={wide}
            />
          ))}
        </div>
      </Camera>

      <div
        style={{
          position: 'absolute',
          top: 52 * u,
          left: 52 * u,
          opacity: ramp(frame, 0, 10, EASE_OUT),
          transform: `translateY(${interpolate(ramp(frame, 2, 18, EASE_OUT), [0, 1], [-22, 0])}px)`,
        }}
      >
        <div
          style={{
            fontFamily: SANS,
            fontWeight: 700,
            fontSize: 52 * u,
            color: C.ink,
            letterSpacing: '-0.035em',
          }}
        >
          {caption}
        </div>
        <div style={{...upper(0.18), fontSize: 16 * u, color: C.ink3, marginTop: 10 * u}}>
          ×{speed.toLocaleString()} speed · one cell = one decision · one stream
        </div>
      </div>

      <Timer
        ms={wallMs}
        progress={clamp01(wallMs / spanMs)}
        text={clock(wallMs)}
        u={u}
        accent
        label="wall clock"
      />
      <StageWatermark data={data} />

      {frame >= jevDone ? (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            ...(wide
              ? {top: 0, paddingTop: 150 * u, paddingBottom: 26 * u,
                 background: 'linear-gradient(0deg, rgba(7,7,10,0) 0%, rgba(7,7,10,0.94) 42%)'}
              : {bottom: 0, paddingBottom: 46 * u, paddingTop: 46 * u,
                 background: 'linear-gradient(180deg, rgba(7,7,10,0) 0%, rgba(7,7,10,0.93) 44%)'}),
            textAlign: 'center',
            opacity: ramp(frame, jevDone + 4, jevDone + 16, EASE_OUT),
            transform: `translateY(${interpolate(Math.min(burst, 1), [0, 1], [26, 0])}px)`,
            fontFamily: SANS,
            fontWeight: 700,
            fontSize: 46 * u,
            letterSpacing: '-0.03em',
            color: C.ink,
          }}
        >
          Jev: 1,000 done. <span style={{color: C.ink3}}>Claude: still counting.</span>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
