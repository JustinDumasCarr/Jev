import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, SANS, tabular, upper} from '../theme';
import {ProtoFrame, Racer, racers, useRaceClock} from './shared';
import type {FilmProps} from '../types';

/* P2 — rings filling. Nine rings sweep closed at one shared angular rate; the sweep stops
   at the system's own time and the ring snaps shut into its stamp. Jev's closes in a
   blink. Linear: the swept angle. Spring: the snap. */

const TAU = Math.PI * 2;

const Ring: React.FC<{r: Racer; cx: number; cy: number; radius: number; elapsed: number; slowest: number; u: number}> = ({
  r,
  cx,
  cy,
  radius,
  elapsed,
  slowest,
  u,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const frac = Math.min(elapsed, r.ms) / slowest; // linear in time
  const done = elapsed >= r.ms;
  const snap = done
    ? spring({frame: Math.round(((elapsed - r.ms) / 1000) * fps * 2), fps, config: {damping: 10, stiffness: 260}})
    : 0;
  const stroke = 15 * u;
  const rr = radius * (1 + 0.07 * Math.max(0, snap < 1 ? Math.sin(snap * Math.PI) : 0));
  const circ = TAU * rr;
  const a = -Math.PI / 2 + frac * TAU;
  const headX = cx + Math.cos(a) * rr;
  const headY = cy + Math.sin(a) * rr;

  return (
    <g>
      <circle cx={cx} cy={cy} r={rr} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={stroke} />
      {done ? (
        <circle cx={cx} cy={cy} r={rr} fill={`${r.color}1c`} />
      ) : null}
      <circle
        cx={cx}
        cy={cy}
        r={rr}
        fill="none"
        stroke={r.color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${circ * frac} ${circ}`}
        transform={`rotate(-90 ${cx} ${cy})`}
        opacity={done ? 1 : 0.95}
      />
      {!done && frac > 0.001 ? (
        <>
          <circle cx={headX} cy={headY} r={stroke * 0.95} fill={r.color} />
          <circle cx={headX} cy={headY} r={stroke * 1.9} fill={r.color} opacity={0.18} />
        </>
      ) : null}
      {done ? (
        <circle
          cx={cx}
          cy={cy}
          r={rr + interpolate(Math.min(snap, 1), [0, 1], [0, 34 * u])}
          fill="none"
          stroke={r.color}
          strokeWidth={3 * u}
          opacity={Math.max(0, 1 - snap)}
        />
      ) : null}
    </g>
  );
};

export const P2Rings: React.FC<FilmProps> = ({data}) => {
  const {width, height} = useVideoConfig();
  const u = height / 1080;
  const rs = racers(data);
  const {elapsed, slowest, speed} = useRaceClock(rs, 5.8);

  const cols = 3;
  const cellW = (width - 120 * u) / cols;
  const cellH = 560 * u / 3 + 46 * u;
  const top = 268 * u;
  const radius = 76 * u;

  return (
    <ProtoFrame data={data} code="P2" title="Rings closing" elapsed={elapsed} speed={speed}>
      <svg width={width} height={height} style={{position: 'absolute', inset: 0}}>
        {rs.map((r, i) => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          return (
            <Ring
              key={r.sys.system}
              r={r}
              cx={60 * u + cellW * (col + 0.5)}
              cy={top + cellH * (row + 0.5)}
              radius={radius}
              elapsed={elapsed}
              slowest={slowest}
              u={u}
            />
          );
        })}
      </svg>

      {rs.map((r, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const cx = 60 * u + cellW * (col + 0.5);
        const cy = top + cellH * (row + 0.5);
        const done = elapsed >= r.ms;
        return (
          <div
            key={r.sys.system}
            style={{
              position: 'absolute',
              left: cx,
              top: cy,
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
              width: radius * 1.8,
            }}
          >
            <div
              style={{
                fontFamily: SANS,
                fontWeight: 700,
                fontSize: 23 * u,
                color: r.isJev ? C.accent : C.ink,
                whiteSpace: 'nowrap',
              }}
            >
              {r.sys.label}
            </div>
            <div
              style={{
                ...tabular,
                fontWeight: 800,
                fontSize: (r.isJev ? 42 : 34) * u,
                color: done ? r.color : C.ink3,
                marginTop: 2 * u,
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
        one shared sweep rate · a ring closes when its model answered
      </div>
    </ProtoFrame>
  );
};
