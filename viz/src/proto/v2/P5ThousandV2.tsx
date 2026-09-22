import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, SANS, clock, tabular} from '../../theme';
import type {FilmProps} from '../../types';
import {racers, type Racer} from '../shared';
import {
  Ambient,
  Camera,
  EASE_OUT,
  FootNote,
  POP,
  SNAP,
  STAGGER,
  StageWatermark,
  Timer,
  TitleBlock,
  clamp01,
  ramp,
  useCamera,
} from '../../stage';

/* P5 v2 — the thousand-square.
 *
 * Linear, always: how many cells are lit (wall clock ÷ that system's p50).
 * Craft: the cells ignite in a diagonal ripple with a glow trail and a pop,
 * a sheen sweeps the blocks, the camera punches into Jev's block the moment
 * it completes its thousandth decision, pulls back onto eight blocks that
 * are barely started, and the final hold breathes rather than freezing dead. */

export const P5_FRAMES = 285; // 9.5 s

const COLS = 40;
const ROWS = 25;
const ENTER_AT = 0;
const RUN_AT = 28;
const RUN_FRAMES = 152; // Jev completes here; the Claude blocks keep going

/** Diagonal ripple order: band = col + row, so ignition sweeps corner to corner. */
const ORDER = (() => {
  const idx: number[] = [];
  for (let b = 0; b <= COLS + ROWS; b++) {
    for (let row = 0; row < ROWS; row++) {
      const col = b - row;
      if (col >= 0 && col < COLS) idx.push(row * COLS + col);
    }
  }
  return idx;
})();

const Block: React.FC<{
  r: Racer;
  i: number;
  wallMs: number;
  w: number;
  u: number;
}> = ({r, i, wallMs, w, u}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const p50 = r.sys.latency_ms.p50 ?? 1;
  const lit = Math.min(1000, Math.floor(wallMs / p50)); // strictly linear
  const full = lit >= 1000;

  const enter = spring({frame: frame - ENTER_AT - i * STAGGER, fps, config: SNAP, durationInFrames: 26});
  const cell = w / COLS;
  const size = cell - Math.max(0.9, cell * 0.17);
  const gridH = ROWS * cell;

  // the moment the block completes
  const fullFrame = full ? RUN_AT + (1000 * p50 * (RUN_FRAMES / (wallMs || 1))) : Infinity;
  const done = spring({frame: frame - (r.isJev ? RUN_AT + RUN_FRAMES : 1e6), fps, config: POP});
  // a slow breath so the hold is never dead
  const breathe = 1 + 0.012 * Math.sin((frame / fps) * 1.15 + i);
  // ambient sheen sweeping across every block
  const sheen = ((frame / fps) * 0.26 + i * 0.07) % 1.6;

  const cells = [];
  for (let k = 0; k < lit; k++) {
    const flat = ORDER[k];
    const col = flat % COLS;
    const row = (flat - col) / COLS;
    const age = lit - k;
    const glow = age < 30 ? interpolate(age, [0, 30], [1, 0], {easing: EASE_OUT}) : 0;
    const pop = age < 6 ? interpolate(age, [0, 6], [1.55, 1]) : 1; // squash on ignition
    const s = size * pop;
    cells.push(
      <rect
        key={k}
        x={col * cell + (size - s) / 2}
        y={row * cell + (size - s) / 2}
        width={s}
        height={s}
        rx={s * 0.3}
        fill={r.color}
        opacity={0.5 + glow * 0.5}
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
        transform: `translateY(${interpolate(enter, [0, 1], [34, 0])}px) scale(${
          interpolate(enter, [0, 1], [0.94, 1]) * breathe
        })`,
      }}
    >
      <div style={{display: 'flex', alignItems: 'baseline', gap: 10 * u}}>
        <span
          style={{
            fontFamily: SANS,
            fontWeight: 700,
            fontSize: 25 * u,
            color: r.isJev ? C.accent : C.ink,
            whiteSpace: 'nowrap',
          }}
        >
          {r.sys.label}
        </span>
        <span
          style={{
            ...tabular,
            fontWeight: 800,
            fontSize: 30 * u,
            color: full ? r.color : C.ink2,
            marginLeft: 'auto',
            transform: `scale(${full ? interpolate(Math.min(done, 1), [0, 1], [1.6, 1]) : 1})`,
            textShadow: full ? `0 0 ${22 * u}px ${r.color}` : 'none',
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
            stroke={full ? `${r.color}80` : 'rgba(255,255,255,0.07)'}
            strokeWidth={full ? 2 * u : 1}
          />
          {cells}
        </svg>
        {/* ambient sheen */}
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

export const P5ThousandV2: React.FC<FilmProps> = ({data}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const u = height / 1080;
  const rs = racers(data);
  const jev = rs[0];

  // The window is exactly what Jev needs for 1,000 calls, so the eight Claude
  // blocks show how far they got in the very same wall clock.
  const spanMs = (jev.sys.latency_ms.p50 ?? 1) * 1000;
  const wallMs = interpolate(frame, [RUN_AT, RUN_AT + RUN_FRAMES], [0, spanMs], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const speed = Math.round(spanMs / 1000 / (RUN_FRAMES / fps));

  const cols = 3;
  const gapX = 33 * u;
  const blockW = (width - 130 * u - gapX * 2) / cols;
  const gridTop = 262 * u;
  const rowH = ROWS * (blockW / COLS) + 52 * u;

  const jevDone = RUN_AT + RUN_FRAMES;
  const jevX = 65 * u + blockW / 2;
  const jevY = gridTop + rowH * 0.42;
  const cam = useCamera([
    {at: 0, zoom: 1, x: width / 2, y: height / 2},
    {at: jevDone - 6, zoom: 1, x: width / 2, y: height / 2},
    {at: jevDone + 12, zoom: 1.85, x: jevX, y: jevY},
    {at: jevDone + 40, zoom: 1.85, x: jevX, y: jevY},
    {at: jevDone + 62, zoom: 1, x: width / 2, y: height / 2},
    {at: P5_FRAMES, zoom: 1.04, x: width / 2, y: height / 2},
  ]);

  const burst = spring({frame: frame - jevDone, fps, config: POP});

  return (
    <AbsoluteFill style={{backgroundColor: C.bg}}>
      <Ambient glow="rgba(64,104,180,0.18)" cam={cam} />

      <Camera cam={cam}>
        {/* the light Jev's block throws when it completes */}
        {frame >= jevDone ? (
          <div
            style={{
              position: 'absolute',
              left: jevX,
              top: jevY,
              width: 2,
              height: 2,
              borderRadius: 999,
              transform: `translate(-50%, -50%) scale(${interpolate(Math.min(burst, 1), [0, 1], [40, 700])})`,
              background: `radial-gradient(circle, rgba(255,106,43,${0.55 * (1 - Math.min(burst, 1))}) 0%, rgba(255,106,43,0) 70%)`,
            }}
          />
        ) : null}

        <div
          style={{
            position: 'absolute',
            top: gridTop,
            left: 65 * u,
            right: 65 * u,
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            columnGap: gapX,
            rowGap: 30 * u,
          }}
        >
          {rs.map((r, i) => (
            <Block key={r.sys.system} r={r} i={i} wallMs={wallMs} w={blockW} u={u} />
          ))}
        </div>
      </Camera>

      <TitleBlock
        code="P5"
        title="A thousand decisions"
        note={`×${speed.toLocaleString()} speed · one cell = one decision`}
        u={u}
      />
      <Timer
        ms={wallMs}
        progress={clamp01(wallMs / spanMs)}
        text={clock(wallMs)}
        u={u}
        accent
        label="wall clock · one stream"
      />
      {frame < jevDone + 4 || frame > jevDone + 78 ? (
        <FootNote text="each block is 1,000 calls · cells light at that model's own measured rate" u={u} />
      ) : null}
      <StageWatermark data={data} />
      {/* a title card that lands with the burst, then clears */}
      {frame >= jevDone ? (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            paddingBottom: 46 * u,
            paddingTop: 44 * u,
            background: 'linear-gradient(180deg, rgba(7,7,10,0) 0%, rgba(7,7,10,0.92) 42%)',
            textAlign: 'center',
            opacity: ramp(frame, jevDone + 4, jevDone + 16, EASE_OUT) * (1 - ramp(frame, jevDone + 58, jevDone + 74)),
            transform: `translateY(${interpolate(Math.min(burst, 1), [0, 1], [26, 0])}px)`,
            fontFamily: SANS,
            fontWeight: 700,
            fontSize: 48 * u,
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
