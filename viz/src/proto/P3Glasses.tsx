import React from 'react';
import {interpolate, random, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, SANS, tabular, upper} from '../theme';
import {ProtoFrame, Racer, racers, useRaceClock} from './shared';
import type {FilmProps} from '../types';

/* P3 — glasses filling (ANIMATION-PLAN.md §5a). One pour rate for every glass, one glass
   height for every system, liquid level strictly linear in elapsed time. A lid drops when
   a system answers; Jev's caps with a film at the bottom.

   Linear: the liquid level. Springs: the lid drop and the splash. */

const Glass: React.FC<{
  r: Racer;
  x: number;
  w: number;
  top: number;
  h: number;
  elapsed: number;
  slowest: number;
  u: number;
}> = ({r, x, w, top, h, elapsed, slowest, u}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const frac = Math.min(elapsed, r.ms) / slowest; // linear in time
  const level = frac * h;
  const surfaceY = top + h - level;
  const done = elapsed >= r.ms;
  const lid = done
    ? spring({frame: Math.round(((elapsed - r.ms) / 1000) * fps * 2), fps, config: {damping: 9, stiffness: 220}})
    : 0;
  const bw = w * 0.9;
  const bx = x + (w - bw) / 2;
  const bottom = top + h;
  const body = `M ${x} ${top} L ${bx} ${bottom - 12 * u} Q ${bx} ${bottom} ${bx + 12 * u} ${bottom} L ${
    bx + bw - 12 * u
  } ${bottom} Q ${bx + bw} ${bottom} ${bx + bw} ${bottom - 12 * u} L ${x + w} ${top} Z`;
  const clipId = `clip-${r.sys.system}`;
  const wob = Math.sin(frame * 0.55 + r.index) * (done ? 0 : 1);
  const settle = done ? Math.exp(-Math.max(0, (elapsed - r.ms) / 260)) * Math.sin((elapsed - r.ms) / 34) : 0;

  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          <path d={body} />
        </clipPath>
        <linearGradient id={`g-${r.sys.system}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={r.color} stopOpacity={0.95} />
          <stop offset="100%" stopColor={r.color} stopOpacity={0.65} />
        </linearGradient>
      </defs>

      <path d={body} fill="rgba(255,255,255,0.03)" />

      {/* the pour: a stream from above, cut the instant the system answers */}
      {!done ? (
        <>
          <path
            d={`M ${x + w / 2 - 4 * u + wob} ${top - 150 * u} Q ${x + w / 2 + wob * 2} ${top - 40 * u} ${
              x + w / 2 - 2 * u
            } ${surfaceY}`}
            stroke={r.color}
            strokeWidth={7 * u}
            fill="none"
            strokeLinecap="round"
            opacity={0.85}
          />
          {[0, 1].map((k) => {
            const s = random(`${r.sys.system}-d${k}-${Math.floor(frame / 2)}`);
            return (
              <circle
                key={k}
                cx={x + w / 2 + (s - 0.5) * w * 0.7}
                cy={surfaceY - s * 26 * u}
                r={2.6 * u}
                fill={r.color}
                opacity={0.6}
              />
            );
          })}
        </>
      ) : null}

      <g clipPath={`url(#${clipId})`}>
        <rect x={x - 6 * u} y={surfaceY} width={w + 12 * u} height={level + 6 * u} fill={`url(#g-${r.sys.system})`} />
        {/* meniscus */}
        {level > 2 * u ? (
          <ellipse
            cx={x + w / 2}
            cy={surfaceY + settle * 3 * u}
            rx={w * 0.55}
            ry={6 * u}
            fill="rgba(255,255,255,0.32)"
          />
        ) : null}
      </g>

      <path d={body} fill="none" stroke={r.isJev ? C.accent : 'rgba(255,255,255,0.28)'} strokeWidth={r.isJev ? 4 * u : 2.5 * u} />
      {/* a highlight so it reads as glass */}
      <path
        d={`M ${x + w * 0.16} ${top + 12 * u} L ${x + w * 0.24} ${bottom - 22 * u}`}
        stroke="rgba(255,255,255,0.22)"
        strokeWidth={5 * u}
        strokeLinecap="round"
      />

      {/* the lid drops in when the answer lands */}
      {done ? (
        <g
          transform={`translate(0 ${interpolate(Math.min(lid, 1), [0, 1], [-46 * u, 0])})`}
          opacity={Math.min(1, lid * 2)}
        >
          <rect
            x={x - 9 * u}
            y={surfaceY - 15 * u}
            width={w + 18 * u}
            height={14 * u}
            rx={5 * u}
            fill={r.color}
          />
          <rect x={x + w * 0.3} y={surfaceY - 24 * u} width={w * 0.4} height={10 * u} rx={4 * u} fill={r.color} />
        </g>
      ) : null}
    </g>
  );
};

export const P3Glasses: React.FC<FilmProps> = ({data}) => {
  const {width, height} = useVideoConfig();
  const u = height / 1080;
  const rs = racers(data);
  const {elapsed, slowest, speed} = useRaceClock(rs, 5.8);

  const top = 300 * u;
  const h = 500 * u;
  const slot = (width - 90 * u) / rs.length;
  const gw = slot * 0.66;
  const xOf = (i: number) => 45 * u + slot * i + (slot - gw) / 2;

  return (
    <ProtoFrame data={data} code="P3" title="Glasses filling" elapsed={elapsed} speed={speed}>
      <svg width={width} height={height} style={{position: 'absolute', inset: 0}}>
        <line x1={30 * u} y1={top + h} x2={width - 30 * u} y2={top + h} stroke={C.hair} strokeWidth={2} />
        {rs.map((r, i) => (
          <Glass
            key={r.sys.system}
            r={r}
            x={xOf(i)}
            w={gw}
            top={top}
            h={h}
            elapsed={elapsed}
            slowest={slowest}
            u={u}
          />
        ))}
      </svg>

      {rs.map((r, i) => {
        const done = elapsed >= r.ms;
        return (
          <div
            key={r.sys.system}
            style={{
              position: 'absolute',
              left: xOf(i) + gw / 2,
              top: top + h + 22 * u,
              transform: 'translateX(-50%)',
              textAlign: 'center',
              width: slot,
            }}
          >
            <div
              style={{
                fontFamily: SANS,
                fontWeight: 700,
                fontSize: 22 * u,
                color: r.isJev ? C.accent : C.ink,
                lineHeight: 1.1,
              }}
            >
              {r.sys.label}
            </div>
            <div
              style={{
                ...tabular,
                fontWeight: 800,
                fontSize: (r.isJev ? 34 : 28) * u,
                color: done ? r.color : C.ink3,
                marginTop: 6 * u,
              }}
            >
              {((done ? r.ms : Math.min(elapsed, r.ms)) / 1000).toFixed(2)}
            </div>
          </div>
        );
      })}

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
        same pour rate, same glass · the level is the wait
      </div>
    </ProtoFrame>
  );
};
