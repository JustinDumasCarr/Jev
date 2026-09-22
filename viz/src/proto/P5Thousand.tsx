import React from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {Backdrop, Tag, Watermark} from '../chrome';
import {C, SANS, clock, tabular, upper} from '../theme';
import {racers} from './shared';
import type {FilmProps} from '../types';

/* P5 — the thousand-square, for the "now do it 1,000 times" beat. One block of 1,000
   cells per system; a cell lights for every decision that system has made, at its own
   real rate, in time-lapse. Jev's block fills; the Claude blocks have a handful lit.

   Linear: the number of lit cells (= wall clock / that system's p50). The ripple is only
   in how brightly a freshly lit cell glows, never in how many are lit. */

const COLS = 40;
const ROWS = 25; // 1,000 cells

const Block: React.FC<{
  label: string;
  color: string;
  isJev: boolean;
  p50: number;
  wallMs: number;
  w: number;
  u: number;
}> = ({label, color, isJev, p50, wallMs, w, u}) => {
  const lit = Math.min(1000, Math.floor(wallMs / p50));
  const cell = w / COLS;
  const gap = Math.max(0.8, cell * 0.16);
  const size = cell - gap;
  const cells = [];
  // Only the lit cells are drawn as marks; the rest are the faint bed underneath.
  for (let i = 0; i < lit; i++) {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const age = lit - i;
    const glow = age < 26 ? interpolate(age, [0, 26], [1, 0]) : 0;
    cells.push(
      <rect
        key={i}
        x={col * cell}
        y={row * cell}
        width={size}
        height={size}
        rx={size * 0.28}
        fill={color}
        opacity={0.55 + glow * 0.45}
      />,
    );
  }
  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 8 * u}}>
      <div style={{display: 'flex', alignItems: 'baseline', gap: 10 * u}}>
        <span
          style={{
            fontFamily: SANS,
            fontWeight: 700,
            fontSize: 24 * u,
            color: isJev ? C.accent : C.ink,
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
        <span
          style={{
            ...tabular,
            fontWeight: 800,
            fontSize: 28 * u,
            color: lit >= 1000 ? color : C.ink2,
            marginLeft: 'auto',
          }}
        >
          {lit}
        </span>
      </div>
      <svg width={w} height={ROWS * cell}>
        <rect width={w} height={ROWS * cell} fill="rgba(255,255,255,0.028)" rx={6 * u} />
        {cells}
      </svg>
    </div>
  );
};

export const P5Thousand: React.FC<FilmProps> = ({data}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const u = height / 1080;
  const rs = racers(data);
  const jev = rs[0];

  // The window is the time Jev needs for 1,000 calls, so Jev's block finishes on screen
  // and the Claude blocks show how far they got in exactly the same wall clock.
  const spanMs = jev.sys.latency_ms.p50! * 1000;
  const runSeconds = 6.8;
  const wallMs = interpolate(frame, [Math.round(0.5 * fps), Math.round((0.5 + runSeconds) * fps)], [0, spanMs], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const speed = Math.round(spanMs / 1000 / runSeconds);

  const cols = 3;
  const blockW = (width - 130 * u) / cols - 22 * u;

  return (
    <AbsoluteWrap>
      <Backdrop glow="rgba(70,110,190,0.16)" />
      <div
        style={{
          position: 'absolute',
          top: 52 * u,
          left: 52 * u,
        }}
      >
        <div style={{display: 'flex', alignItems: 'center', gap: 14 * u}}>
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
            P5
          </span>
          <div style={{fontFamily: SANS, fontWeight: 700, fontSize: 40 * u, color: C.ink, letterSpacing: '-0.03em'}}>
            A thousand decisions
          </div>
        </div>
        <div style={{marginTop: 10 * u, display: 'flex', gap: 8 * u}}>
          <Tag size={13 * u} color={C.accent} solid>
            ×{speed.toLocaleString()} speed
          </Tag>
          <Tag size={13 * u}>one cell = one decision</Tag>
        </div>
      </div>

      <div style={{position: 'absolute', top: 44 * u, right: 52 * u, textAlign: 'right'}}>
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
          {clock(wallMs)}
        </div>
        <div style={{...upper(0.2), fontSize: 15 * u, color: C.ink3, marginTop: 4 * u}}>wall clock</div>
      </div>

      <div
        style={{
          position: 'absolute',
          top: 258 * u,
          left: 65 * u,
          right: 65 * u,
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          columnGap: 33 * u,
          rowGap: 34 * u,
        }}
      >
        {rs.map((r) => (
          <Block
            key={r.sys.system}
            label={r.sys.label}
            color={r.color}
            isJev={r.isJev}
            p50={r.sys.latency_ms.p50 ?? 1}
            wallMs={wallMs}
            w={blockW}
            u={u}
          />
        ))}
      </div>

      <div
        style={{
          position: 'absolute',
          left: 52 * u,
          bottom: 48 * u,
          ...upper(0.18),
          fontSize: 17 * u,
          color: C.ink3,
        }}
      >
        each block is 1,000 calls · cells light at that model's own measured rate
      </div>

      <Watermark fixture={data.meta.fixture === true} width={width} height={height} />
    </AbsoluteWrap>
  );
};

const AbsoluteWrap: React.FC<{children: React.ReactNode}> = ({children}) => (
  <div style={{position: 'absolute', inset: 0, backgroundColor: C.bg}}>{children}</div>
);
