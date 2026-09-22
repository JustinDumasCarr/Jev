import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, SANS, tabular} from '../../theme';
import type {FilmProps} from '../../types';
import type {Racer} from '../shared';
import {TOTAL_FRAMES, raceAt, useV2Race} from './race';
import {
  Ambient,
  Camera,
  EASE_OUT,
  FootNote,
  POP,
  SNAP,
  StageWatermark,
  Timer,
  TitleBlock,
  clamp01,
  ramp,
  wobble,
  useCamera,
} from './stage';

/* P2 v2 — rings closing.
 *
 * Linear, always: the swept angle (elapsed over the shared cap) and the number
 * counting up inside. Craft: the track draws itself in, the sweeping head is a
 * glowing bead with a comet tail, the close is a snap with overshoot and a
 * white light flash, the interior blooms, and the camera punches into Jev's
 * ring when it shuts almost immediately. */

const TAU = Math.PI * 2;

const Ring: React.FC<{
  r: Racer;
  cx: number;
  cy: number;
  radius: number;
  elapsed: number;
  slowest: number;
  capFrame: number;
  enterAt: number;
  u: number;
}> = ({r, cx, cy, radius, elapsed, slowest, capFrame, enterAt, u}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const enter = spring({frame: frame - enterAt, fps, config: SNAP, durationInFrames: 26});
  const draw = ramp(frame, enterAt + 2, enterAt + 20, EASE_OUT); // the track draws itself
  const frac = clamp01(Math.min(elapsed, r.ms) / slowest); // strictly linear
  const done = elapsed >= r.ms;
  const since = frame - capFrame;

  // snap with overshoot, then a couple of settling wobbles
  const snap = done ? spring({frame: since, fps, config: POP}) : 0;
  const rr = radius * (1 + (done ? wobble(since, 7, 9) * 0.075 : 0)) * interpolate(enter, [0, 1], [0.86, 1]);
  const stroke = 17 * u;
  const circ = TAU * rr;
  const a = -Math.PI / 2 + frac * TAU;
  const headX = cx + Math.cos(a) * rr;
  const headY = cy + Math.sin(a) * rr;
  const flash = done ? Math.max(0, 1 - since / 10) : 0;
  const bloom = done ? clamp01(snap) : 0;
  const tail = Math.min(0.13, frac); // comet tail, ~47°

  return (
    <g opacity={enter}>
      <defs>
        <radialGradient id={`bl-${r.sys.system}`}>
          <stop offset="0%" stopColor={r.color} stopOpacity={0.42} />
          <stop offset="70%" stopColor={r.color} stopOpacity={0.1} />
          <stop offset="100%" stopColor={r.color} stopOpacity={0} />
        </radialGradient>
      </defs>

      {/* interior bloom on close */}
      {bloom > 0 ? (
        <circle cx={cx} cy={cy} r={rr * 0.98 * bloom} fill={`url(#bl-${r.sys.system})`} />
      ) : null}

      {/* the track, drawn in */}
      <circle
        cx={cx}
        cy={cy}
        r={rr}
        fill="none"
        stroke="rgba(255,255,255,0.075)"
        strokeWidth={stroke}
        strokeDasharray={`${circ * draw} ${circ}`}
        transform={`rotate(-90 ${cx} ${cy})`}
      />

      {/* the comet tail behind the head */}
      {!done && frac > 0.004 ? (
        <circle
          cx={cx}
          cy={cy}
          r={rr}
          fill="none"
          stroke={r.color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeOpacity={0.35}
          strokeDasharray={`${circ * tail} ${circ}`}
          transform={`rotate(${-90 + (frac - tail) * 360} ${cx} ${cy})`}
        />
      ) : null}

      {/* the swept arc: the measurement */}
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
      />

      {/* the glowing head */}
      {!done && frac > 0.001 ? (
        <>
          <circle cx={headX} cy={headY} r={stroke * 2.4} fill={r.color} opacity={0.16} />
          <circle cx={headX} cy={headY} r={stroke * 1.35} fill={r.color} opacity={0.3} />
          <circle cx={headX} cy={headY} r={stroke * 0.62} fill="#fff" opacity={0.95} />
        </>
      ) : null}

      {/* light flash on close */}
      {flash > 0 ? (
        <>
          <circle cx={cx} cy={cy} r={rr} fill="none" stroke="#fff" strokeWidth={stroke * (0.4 + flash)} opacity={flash} />
          <circle
            cx={cx}
            cy={cy}
            r={rr + interpolate(1 - flash, [0, 1], [0, 62 * u])}
            fill="none"
            stroke={r.color}
            strokeWidth={4 * u * flash}
            opacity={flash * 0.9}
          />
        </>
      ) : null}
    </g>
  );
};

export const P2RingsV2: React.FC<FilmProps> = ({data}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const u = height / 1080;
  const race = useV2Race(data);
  const {elapsed, progress} = raceAt(race, frame, fps);

  const cols = 3;
  const cellW = (width - 120 * u) / cols;
  const cellH = 218 * u;
  const top = 286 * u;
  const radius = 82 * u;
  const cxOf = (i: number) => 60 * u + cellW * ((i % cols) + 0.5);
  const cyOf = (i: number) => top + cellH * (Math.floor(i / cols) + 0.5);

  const jevCap = race.capFrame(race.jev);
  const cam = useCamera([
    {at: 0, zoom: 1, x: width / 2, y: height / 2},
    {at: jevCap - 2, zoom: 1, x: width / 2, y: height / 2},
    {at: jevCap + 13, zoom: 2.15, x: cxOf(0), y: cyOf(0)},
    {at: jevCap + 36, zoom: 2.15, x: cxOf(0), y: cyOf(0)},
    {at: jevCap + 56, zoom: 1, x: width / 2, y: height / 2},
    {at: TOTAL_FRAMES, zoom: 1.04, x: width / 2, y: height / 2},
  ]);

  return (
    <AbsoluteFill style={{backgroundColor: C.bg}}>
      <Ambient glow="rgba(64,104,180,0.2)" cam={cam} />

      <Camera cam={cam}>
        <svg width={width} height={height} style={{position: 'absolute', inset: 0}}>
          {race.rs.map((r, i) => (
            <Ring
              key={r.sys.system}
              r={r}
              cx={cxOf(i)}
              cy={cyOf(i)}
              radius={radius}
              elapsed={elapsed}
              slowest={race.slowest}
              capFrame={race.capFrame(r)}
              enterAt={race.enterAt(i)}
              u={u}
            />
          ))}
        </svg>

        {race.rs.map((r, i) => {
          const done = elapsed >= r.ms;
          const since = frame - race.capFrame(r);
          const stamp = done ? spring({frame: since, fps, config: POP}) : 0;
          const inn = spring({frame: frame - race.enterAt(i) - 8, fps, config: SNAP, durationInFrames: 22});
          return (
            <div
              key={r.sys.system}
              style={{
                position: 'absolute',
                left: cxOf(i),
                top: cyOf(i),
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
                width: radius * 1.7,
                opacity: inn,
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
                  fontSize: (r.isJev ? 46 : 37) * u,
                  color: done ? r.color : C.ink3,
                  marginTop: 2 * u,
                  transform: `scale(${done ? interpolate(Math.min(stamp, 1), [0, 1], [1.6, 1]) : 1})`,
                  textShadow: done && since < 12 ? `0 0 ${26 * u}px ${r.color}` : 'none',
                }}
              >
                {((done ? r.ms : Math.min(elapsed, r.ms)) / 1000).toFixed(2)}
              </div>
            </div>
          );
        })}
      </Camera>

      <TitleBlock code="P2" title="Rings closing" note="Jev vs 8 Claude · thinking off" u={u} />
      <Timer
        ms={elapsed}
        progress={progress}
        u={u}
        accent={elapsed < race.jev.ms + 1}
        label={race.speed >= 0.995 ? 'elapsed · real time' : `elapsed · ×${race.speed.toFixed(2)} speed`}
      />
      <FootNote text="one shared sweep rate · a ring closes when its model answered" u={u} />
      <StageWatermark data={data} />
    </AbsoluteFill>
  );
};
