import React from 'react';
import {interpolate, random, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, tabular, upper} from '../theme';
import {LaneLabel, LEAD, ProtoFrame, Racer, racers, useRaceClock} from './shared';
import type {FilmProps} from '../types';

/* P1 — rocket launch. Nine rockets lift off together on one shared burn rate; altitude is
   elapsed time, so a rocket stops climbing at the moment its system answered. Jev's burns
   out just off the pad and bursts into its stamp; the rest are still under power.

   Linear: altitude. Springs: the burst, and nothing else. */

const Rocket: React.FC<{r: Racer; x: number; padY: number; topY: number; elapsed: number; slowest: number; u: number}> = ({
  r,
  x,
  padY,
  topY,
  elapsed,
  slowest,
  u,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const travel = padY - topY;
  const alt = (Math.min(elapsed, r.ms) / slowest) * travel; // linear in time
  const y = padY - alt;
  const done = elapsed >= r.ms;
  const burst = done
    ? spring({frame: Math.round(((elapsed - r.ms) / 1000) * fps * 2), fps, config: {damping: 11, stiffness: 240}})
    : 0;
  const w = 26 * u;
  const flicker = 0.75 + 0.25 * Math.sin(frame * 1.7 + r.index);

  return (
    <g>
      {/* exhaust trail: the distance burned so far */}
      <rect
        x={x - w * 0.16}
        y={y}
        width={w * 0.32}
        height={Math.max(0, alt)}
        fill={`${r.color}22`}
        rx={w * 0.16}
      />
      {!done ? (
        <>
          {/* flame */}
          <path
            d={`M ${x - w * 0.3} ${y + w * 1.15} Q ${x} ${y + w * (1.15 + 1.5 * flicker)} ${x + w * 0.3} ${
              y + w * 1.15
            } Z`}
            fill={r.isJev ? C.accent : '#ffd7a8'}
            opacity={0.95}
          />
          {[0, 1, 2].map((k) => {
            const s = random(`${r.sys.system}-${k}-${Math.floor(frame / 3)}`);
            return (
              <circle
                key={k}
                cx={x + (s - 0.5) * w * 0.9}
                cy={y + w * (1.5 + s * 1.6)}
                r={w * 0.11 * (1 - s * 0.4)}
                fill={`${r.color}`}
                opacity={0.35}
              />
            );
          })}
        </>
      ) : null}

      {/* the rocket: nose cone, body, fins */}
      <g transform={`translate(${x} ${y}) rotate(${done ? 6 : 0})`}>
        <path d={`M 0 ${-w * 1.5} L ${w * 0.42} ${-w * 0.35} L ${-w * 0.42} ${-w * 0.35} Z`} fill={r.color} />
        <rect x={-w * 0.42} y={-w * 0.35} width={w * 0.84} height={w * 1.35} rx={w * 0.1} fill={r.color} />
        <rect x={-w * 0.42} y={-w * 0.05} width={w * 0.84} height={w * 0.3} fill="rgba(0,0,0,0.28)" />
        <path d={`M ${-w * 0.42} ${w * 0.55} L ${-w * 0.85} ${w * 1.0} L ${-w * 0.42} ${w * 1.0} Z`} fill={r.color} />
        <path d={`M ${w * 0.42} ${w * 0.55} L ${w * 0.85} ${w * 1.0} L ${w * 0.42} ${w * 1.0} Z`} fill={r.color} />
      </g>

      {/* arrival: a burst and the measured time */}
      {done ? (
        <>
          <circle
            cx={x}
            cy={y}
            r={interpolate(Math.min(burst, 1), [0, 1], [w * 0.4, w * (r.isJev ? 3.4 : 2.2)])}
            fill="none"
            stroke={r.color}
            strokeWidth={3 * u * (1 - Math.min(burst, 1)) + 1}
            opacity={Math.max(0, 1 - burst)}
          />
          <line
            x1={x - w * 1.5}
            y1={y}
            x2={x + w * 1.5}
            y2={y}
            stroke={r.color}
            strokeWidth={2 * u}
            strokeDasharray="6 6"
            opacity={0.55}
          />
        </>
      ) : null}
    </g>
  );
};

export const P1Rockets: React.FC<FilmProps> = ({data}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const u = height / 1080;
  const rs = racers(data);
  const {elapsed, slowest, speed} = useRaceClock(rs, 5.8);

  const padY = 892 * u;
  const topY = 262 * u;
  const slot = (width - 110 * u) / rs.length;
  const xOf = (i: number) => 55 * u + slot * (i + 0.5);

  return (
    <ProtoFrame data={data} code="P1" title="Rocket launch" elapsed={elapsed} speed={speed}>
      <svg width={width} height={height} style={{position: 'absolute', inset: 0}}>
        {/* the pad */}
        <line x1={40 * u} y1={padY} x2={width - 40 * u} y2={padY} stroke={C.hair} strokeWidth={2} />
        {rs.map((r, i) => (
          <Rocket
            key={r.sys.system}
            r={r}
            x={xOf(i)}
            padY={padY}
            topY={topY}
            elapsed={elapsed}
            slowest={slowest}
            u={u}
          />
        ))}
      </svg>

      {/* names on the pad, times above each burnout */}
      {rs.map((r, i) => {
        const alt = (Math.min(elapsed, r.ms) / slowest) * (padY - topY);
        const done = elapsed >= r.ms;
        return (
          <div key={r.sys.system}>
            <div
              style={{
                position: 'absolute',
                left: xOf(i),
                top: padY + 22 * u,
                transform: 'translateX(-50%) rotate(-42deg)',
                transformOrigin: 'left top',
              }}
            >
              <LaneLabel r={r} u={u} size={24} />
            </div>
            {done ? (
              <div
                style={{
                  position: 'absolute',
                  left: xOf(i),
                  top: padY - alt - 62 * u,
                  transform: 'translateX(-50%)',
                  ...tabular,
                  fontWeight: 800,
                  fontSize: (r.isJev ? 38 : 27) * u,
                  color: r.color,
                  whiteSpace: 'nowrap',
                  opacity: spring({
                    frame: Math.round(((elapsed - r.ms) / 1000) * fps * 2),
                    fps,
                    config: {damping: 200},
                    durationInFrames: 8,
                  }),
                }}
              >
                {(r.ms / 1000).toFixed(2)}s
              </div>
            ) : null}
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
        altitude = time burned · every rocket climbs at the same rate
      </div>
    </ProtoFrame>
  );
};
