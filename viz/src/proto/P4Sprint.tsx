import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, SANS, tabular, upper} from '../theme';
import {ProtoFrame, Racer, racers, useRaceClock} from './shared';
import type {FilmProps} from '../types';

/* P4 — the sprint. Nine runners on nine lanes at one shared speed; each lane's finish
   line stands at that system's own time, so the runner who crosses first is the one who
   answered first. Jev crosses while the rest are still mid-stride.

   Linear: the runner's x. Springs: the tape breaking and the finish stamp. */

const Runner: React.FC<{color: string; phase: number; u: number; scale: number}> = ({color, phase, u, scale}) => {
  // A simple silhouette with a two-beat stride: hips and shoulders counter-rotate.
  const s = scale * u;
  const swing = Math.sin(phase);
  const swing2 = Math.sin(phase + Math.PI);
  const arm = Math.sin(phase + Math.PI * 0.9);
  const bob = Math.abs(Math.cos(phase)) * 2.2 * s;
  const L = (a: number, len: number, x0 = 0, y0 = 0) => ({
    x: x0 + Math.sin(a) * len,
    y: y0 + Math.cos(a) * len,
  });
  const hip = {x: 0, y: -14 * s + bob};
  const knee1 = L(swing * 0.75 + 0.1, 13 * s, hip.x, hip.y);
  const foot1 = L(swing * 0.2 + 0.85, 13 * s, knee1.x, knee1.y);
  const knee2 = L(swing2 * 0.75 + 0.1, 13 * s, hip.x, hip.y);
  const foot2 = L(swing2 * 0.2 + 0.85, 13 * s, knee2.x, knee2.y);
  const sh = {x: 1.5 * s, y: -30 * s + bob};
  const elbow = L(arm * 0.9 - 0.5, 9 * s, sh.x, sh.y);
  const hand = L(arm * 0.4 + 0.9, 9 * s, elbow.x, elbow.y);
  const elbow2 = L(-arm * 0.9 - 0.5, 9 * s, sh.x, sh.y);
  const hand2 = L(-arm * 0.4 + 0.9, 9 * s, elbow2.x, elbow2.y);
  const lw = 4.4 * s;

  return (
    <g stroke={color} strokeWidth={lw} strokeLinecap="round" fill="none">
      <circle cx={sh.x + 2 * s} cy={sh.y - 9 * s} r={6 * s} fill={color} stroke="none" />
      <line x1={hip.x} y1={hip.y} x2={sh.x} y2={sh.y} />
      <polyline points={`${hip.x},${hip.y} ${knee1.x},${knee1.y} ${foot1.x},${foot1.y}`} />
      <polyline points={`${hip.x},${hip.y} ${knee2.x},${knee2.y} ${foot2.x},${foot2.y}`} opacity={0.75} />
      <polyline points={`${sh.x},${sh.y} ${elbow.x},${elbow.y} ${hand.x},${hand.y}`} />
      <polyline points={`${sh.x},${sh.y} ${elbow2.x},${elbow2.y} ${hand2.x},${hand2.y}`} opacity={0.75} />
    </g>
  );
};

export const P4Sprint: React.FC<FilmProps> = ({data}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const u = height / 1080;
  const rs = racers(data);
  const {elapsed, slowest, speed} = useRaceClock(rs, 5.8);

  const top = 250 * u;
  const laneH = 70 * u;
  const startX = 250 * u;
  const endX = width - 120 * u;
  const span = endX - startX;

  return (
    <ProtoFrame data={data} code="P4" title="The sprint" elapsed={elapsed} speed={speed}>
      <svg width={width} height={height} style={{position: 'absolute', inset: 0}}>
        <line x1={startX} y1={top - 14 * u} x2={startX} y2={top + laneH * rs.length} stroke={C.hair} strokeWidth={2} />
        {rs.map((r, i) => {
          const y = top + laneH * i + laneH * 0.62;
          const finishX = startX + (r.ms / slowest) * span;
          const x = startX + (Math.min(elapsed, r.ms) / slowest) * span; // linear in time
          const done = elapsed >= r.ms;
          const tape = done
            ? spring({
                frame: Math.round(((elapsed - r.ms) / 1000) * fps * 2),
                fps,
                config: {damping: 12, stiffness: 240},
              })
            : 0;
          // stride phase advances with distance covered, so the legs never slide
          const phase = ((x - startX) / (26 * u)) * Math.PI;
          return (
            <g key={r.sys.system}>
              <rect
                x={startX}
                y={top + laneH * i + 4 * u}
                width={span}
                height={laneH - 8 * u}
                fill={i % 2 ? 'rgba(255,255,255,0.012)' : 'transparent'}
                rx={6 * u}
              />
              {/* the finish line this lane is running at */}
              <line
                x1={finishX}
                y1={top + laneH * i + 6 * u}
                x2={finishX}
                y2={top + laneH * (i + 1) - 6 * u}
                stroke={r.color}
                strokeWidth={done ? 4 * u : 2 * u}
                strokeDasharray={done ? undefined : '7 7'}
                opacity={done ? 1 : 0.5}
              />
              {done ? (
                <circle
                  cx={finishX}
                  cy={y - 18 * u}
                  r={interpolate(Math.min(tape, 1), [0, 1], [3 * u, 34 * u])}
                  fill="none"
                  stroke={r.color}
                  strokeWidth={3 * u}
                  opacity={Math.max(0, 1 - tape)}
                />
              ) : null}
              {!done ? (
                <g opacity={0.35}>
                  {[0, 1, 2].map((k) => (
                    <line
                      key={k}
                      x1={x - (26 + k * 22) * u}
                      y1={y - (12 + k * 9) * u}
                      x2={x - (52 + k * 26) * u}
                      y2={y - (12 + k * 9) * u}
                      stroke={r.color}
                      strokeWidth={3 * u}
                      strokeLinecap="round"
                    />
                  ))}
                </g>
              ) : null}
              <g transform={`translate(${x} ${y}) rotate(${done ? 0 : -7})`}>
                <Runner color={r.color} phase={done ? 0.4 : phase} u={u} scale={r.isJev ? 1.75 : 1.5} />
              </g>
            </g>
          );
        })}
      </svg>

      {rs.map((r, i) => {
        const done = elapsed >= r.ms;
        const finishX = startX + (r.ms / slowest) * span;
        return (
          <div key={r.sys.system}>
            <div
              style={{
                position: 'absolute',
                left: 56 * u,
                top: top + laneH * i + laneH * 0.5,
                transform: 'translateY(-50%)',
                fontFamily: SANS,
                fontWeight: 700,
                fontSize: 25 * u,
                color: r.isJev ? C.accent : C.ink,
                whiteSpace: 'nowrap',
              }}
            >
              {r.sys.label}
            </div>
            <div
              style={{
                position: 'absolute',
                left: finishX + 26 * u,
                top: top + laneH * i + laneH * 0.5,
                transform: 'translateY(-50%)',
                ...tabular,
                fontWeight: 800,
                fontSize: (r.isJev ? 32 : 25) * u,
                color: done ? r.color : 'transparent',
                whiteSpace: 'nowrap',
              }}
            >
              {(r.ms / 1000).toFixed(2)}s
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
        one shared speed · each lane's finish line is that model's own time
      </div>
    </ProtoFrame>
  );
};
