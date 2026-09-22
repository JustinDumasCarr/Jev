import React from 'react';
import {AbsoluteFill, interpolate, random, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, SANS, claudeColor, classLabel, clock, money, tabular, upper} from '../theme';
import {
  Ambient,
  Camera,
  EASE_OUT,
  POP,
  SNAP,
  StageWatermark,
  Timer,
  clamp01,
  ramp,
  useCamera,
} from '../stage';
import {blocksSystems, jevOf} from '../timeline.mjs';
import type {FilmProps, System} from '../types';
import {stringsFor} from '../strings';

/* The film opens here. No title, no preamble: frame 0 is already the nine blocks,
 * the stopwatch already live at 0.00, and one line of context at the top.
 *
 * Phase A, real time: one cell lights in each block at the exact moment that
 * model's single decision came back — Jev's first, its stamp flashing beside it,
 * then the others at their own measured times. The stopwatch runs 1:1.
 *
 * Phase B, time-lapse: a ×N tag snaps in and the same blocks keep filling at each
 * model's own rate, so the cell lit in phase A is simply decision number one.
 * Jev's block floods and completes; the Claude blocks crawl. Freeze on the counts.
 *
 * Linear, always: the number of lit cells is the wall clock over that system's
 * p50, and the wall clock is linear inside each phase with the factor on screen. */

const COLS = 40;
const ROWS = 25; // 1,000 cells

/** Diagonal bands plus a per-call jitter: a block in progress looks like work. */
const ORDER = (() => {
  const all: {i: number; k: number}[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const i = row * COLS + col;
      all.push({i, k: col + row + (random(`c-${i}`) - 0.5) * 6});
    }
  }
  all.sort((a, b) => a.k - b.k);
  return all.map((c) => c.i);
})();

const Block: React.FC<{
  sys: System;
  color: string;
  isJev: boolean;
  i: number;
  count: number;
  wallMs: number;
  w: number;
  u: number;
}> = ({sys, color, isJev, i, count, wallMs, w, u}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const p50 = sys.latency_ms.p50 ?? 1;
  const full = count >= 1000;
  const cell = w / COLS;
  const size = cell - Math.max(0.7, cell * 0.16);
  const gridH = ROWS * cell;
  const ownMs = Math.min(wallMs, 1000 * p50);
  const cost = ((sys.cost_per_1000_usd ?? 0) / 1000) * count;
  const enter = spring({frame: frame - i * 1.2, fps, config: SNAP, durationInFrames: 16});
  const doneS = full ? spring({frame: frame - 2, fps, config: POP}) : 0;
  const sheen = ((frame / fps) * 0.22 + i * 0.09) % 1.8;


  const cells = [];
  for (let k = 0; k < count; k++) {
    const flat = ORDER[k];
    const col = flat % COLS;
    const row = (flat - col) / COLS;
    const age = count - k;
    const glow = age < 30 ? interpolate(age, [0, 30], [1, 0], {easing: EASE_OUT}) : 0;
    const pop = age < 6 ? interpolate(age, [0, 6], [1.8, 1]) : 1;
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
        opacity={0.5 + glow * 0.5}
      />,
    );
  }

  return (
    <div
      style={{
        opacity: enter,
        transform: `translateY(${interpolate(enter, [0, 1], [26, 0])}px)`,
      }}
    >
      <div style={{display: 'flex', alignItems: 'baseline', gap: 8 * u, marginBottom: 7 * u}}>
        <span
          style={{
            fontFamily: SANS,
            fontWeight: 700,
            fontSize: (isJev ? 30 : 25) * u,
            color: isJev ? C.accent : C.ink,
            whiteSpace: 'nowrap',
            letterSpacing: '-0.015em',
          }}
        >
          {sys.label}
        </span>
        <span
          style={{
            ...tabular,
            fontWeight: 800,
            fontSize: (isJev ? 34 : 29) * u,
            color: full ? color : count > 0 ? C.ink : C.ink3,
            marginLeft: 'auto',
            transform: `scale(${full ? interpolate(Math.min(doneS, 1), [0, 1], [1.4, 1]) : 1})`,
            textShadow: full ? `0 0 ${22 * u}px ${color}` : 'none',
          }}
        >
          {count.toLocaleString()}
        </span>
      </div>

      <div style={{position: 'relative'}}>
        <svg width={w} height={gridH} style={{display: 'block', overflow: 'visible'}}>
          <rect width={w} height={gridH} fill="rgba(255,255,255,0.032)" rx={6 * u} />
          <rect
            width={w}
            height={gridH}
            fill="none"
            rx={6 * u}
            stroke={full ? `${color}88` : 'rgba(255,255,255,0.08)'}
            strokeWidth={full ? 2 * u : 1}
          />
          {cells}
        </svg>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 6 * u,
            overflow: 'hidden',
            pointerEvents: 'none',
            opacity: 0.45,
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: -gridH,
              bottom: -gridH,
              width: w * 0.3,
              left: `${(sheen - 0.3) * 120}%`,
              transform: 'rotate(15deg)',
              background:
                'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0) 100%)',
            }}
          />
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 7 * u,
          ...tabular,
          fontSize: 20 * u,
          color: isJev ? C.accent : C.ink3,
        }}
      >
        <span>{clock(ownMs)}</span>
        <span>{money(cost)}</span>
      </div>
    </div>
  );
};

export const Decision: React.FC<FilmProps> = ({data, layout}) => {
  const frame = useCurrentFrame();
  const {fps, width, height, durationInFrames} = useVideoConfig();
  const u = height / 1080;
  const wide = layout === 'wide';
  const T = stringsFor(data.meta.task);
  const jev = jevOf(data) as System;
  // §5f: six systems only, in a fixed order, all with thinking off
  const rows = (blocksSystems(data) as System[]).map((sys) => ({
    sys,
    color: sys.family === 'jev' ? C.accent : claudeColor(sys.tier_rank ?? 0),
    isJev: sys.family === 'jev',
  }));

  /* The beat is one thing only: the blocks filling in time-lapse, each at its own
     measured rate, for exactly ten seconds. Jev's completes and freezes; the rest
     are still filling when the beat cuts. */
  const freeze = Math.round(1.6 * fps);
  const runFrames = durationInFrames - freeze;
  const targetMs = (jev.latency_ms.p50 ?? 1) * 1000; // Jev's thousand calls
  const wallMs = interpolate(frame, [0, runFrames], [0, targetMs], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const speed = Math.max(1, Math.round(targetMs / 1000 / (runFrames / fps)));
  const countOf = (p50: number) => Math.min(1000, Math.floor(wallMs / p50));

  /* ---- layout ---------------------------------------------------- */
  const pad = (wide ? 70 : 56) * u;
  const cols = 3; // §5f: two rows of three, worst to best in reading order
  const gap = (wide ? 24 : 34) * u;
  const contentW = width - pad * 2;
  const blockW = (contentW - gap * (cols - 1)) / cols;
  const gridTop = (wide ? 250 : 200) * u;
  const rowH = ROWS * (blockW / COLS) + (wide ? 96 : 64) * u;

  const jevFull = wallMs >= targetMs * 0.999;
  const jevDoneFrame = runFrames;
  const burst = spring({frame: frame - jevDoneFrame, fps, config: POP});
  const cam = useCamera([{at: 0, zoom: 1, x: width / 2, y: height / 2}]); // static


  const enter = ramp(frame, 0, 6, EASE_OUT);
  const hero = data.meta.hero_case;
  const heroLine = (hero.text || '').replace(/\s+/g, ' ').slice(0, wide ? 150 : 104);

  return (
    <AbsoluteFill style={{backgroundColor: C.bg, opacity: enter}}>
      <Ambient glow="rgba(64,104,180,0.17)" cam={cam} />

      {/* one short line, and nothing else competing with the blocks */}
      <div style={{position: 'absolute', top: 48 * u, left: pad, width: contentW * 0.6}}>
        <div
          style={{
            fontFamily: SANS,
            fontWeight: 700,
            fontSize: 31 * u,
            color: C.ink,
            letterSpacing: '-0.025em',
            lineHeight: 1.15,
          }}
        >
          {T.header}
        </div>
      </div>

      <Camera cam={cam}>
        {/* the light Jev's block throws when it completes */}
        {frame >= jevDoneFrame ? (
          <div
            style={{
              position: 'absolute',
              left: pad + blockW / 2,
              top: gridTop + rowH * 0.42,
              width: 2,
              height: 2,
              borderRadius: 999,
              transform: `translate(-50%, -50%) scale(${interpolate(Math.min(burst, 1), [0, 1], [40, 720])})`,
              background: `radial-gradient(circle, rgba(255,106,43,${
                0.55 * (1 - Math.min(burst, 1))
              }) 0%, rgba(255,106,43,0) 70%)`,
            }}
          />
        ) : null}

        <div
          style={{
            position: 'absolute',
            top: gridTop,
            left: pad,
            width: contentW,
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            columnGap: gap,
            rowGap: (wide ? 30 : 20) * u,
          }}
        >
          {rows.map((r, k) => (
            <Block
              key={r.sys.system}
              sys={r.sys}
              color={r.color}
              isJev={r.isJev}
              i={k}
              count={countOf(r.sys.latency_ms.p50 ?? 1)}
              wallMs={wallMs}
              w={blockW}
              u={u}
            />
          ))}
        </div>
      </Camera>

      <Timer
        ms={wallMs}
        progress={clamp01(wallMs / targetMs)}
        text={clock(wallMs)}
        u={u}
        accent
        label="elapsed"
      />

      <div
        style={{
          position: 'absolute',
          left: pad,
          right: pad,
          bottom: 18 * u,
          ...upper(0.14),
          fontSize: 17 * u,
          color: C.ink3,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {'* '}
        {T.blocksFootB(speed.toLocaleString())}
        {' · '}
        {T.jevAnswer(
          data.meta.task === 'task1' ? jev.hero?.decision ?? '' : classLabel(jev.hero?.decision),
          Math.round((jev.hero?.p ?? 0) * 100) + '%',
        )}
      </div>

      {jevFull ? (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            paddingBottom: 86 * u,
            paddingTop: 44 * u,
            background: 'linear-gradient(180deg, rgba(7,7,10,0) 0%, rgba(7,7,10,0.93) 44%)',
            textAlign: 'center',
            opacity: ramp(frame, jevDoneFrame + 3, jevDoneFrame + 15, EASE_OUT),
            fontFamily: SANS,
            fontWeight: 700,
            fontSize: (wide ? 50 : 44) * u,
            letterSpacing: '-0.03em',
            color: C.ink,
          }}
        >
          Jev: 1,000 done. <span style={{color: C.ink3}}>Claude: still counting.</span>
        </div>
      ) : null}

      <StageWatermark data={data} />
    </AbsoluteFill>
  );
};
