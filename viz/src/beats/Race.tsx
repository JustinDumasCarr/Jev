import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, SANS, claudeColor, tabular, upper} from '../theme';
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
  clamp01,
  ramp,
  useCamera,
} from '../stage';
import {jevOf, panels} from '../timeline.mjs';
import type {FilmProps, System} from '../types';
import {Pour, Tumbler} from './Tumbler';

/* Beat 3 — the race, as eight real tumblers.
 *
 * Jev's glass is pinned to the left edge of the frame for the whole beat: it
 * answered first and it never moves again. The eight Claude tumblers stand in a
 * row laid out slowest to fastest, and the camera dollies along that row, so the
 * move ends on the fastest Claude standing next to Jev — the fairest possible
 * comparison, side by side, and still five times the wait.
 *
 * Every glass fills at the same rate against the same cap, and the level is
 * linear in elapsed time. The camera, the drops, the lids and the splashes are
 * where the craft goes. */

export const RACE_LEAD = 18; // frames before the pour starts
const JEV_W = 300;
const PITCH = 420;

const heroMs = (s: System | null) => (s?.hero?.duration_api_ms ?? s?.latency_ms.p50 ?? 0) as number;

export function raceRows(data: FilmProps['data']) {
  const ps = panels(data, 'square') as {sys: System; tier: number}[];
  // slowest first, so the dolly travels towards the fastest
  return ps
    .map((p) => ({sys: p.sys, tier: p.tier, ms: heroMs(p.sys)}))
    .sort((a, b) => b.ms - a.ms);
}

/** Screen seconds the race itself occupies, and the playback rate it implies. */
export function raceTiming(data: FilmProps['data'], windowSeconds: number) {
  const rows = raceRows(data);
  const jev = jevOf(data) as System;
  const slowest = Math.max(...rows.map((r) => r.ms), heroMs(jev));
  const speed = Math.min(1, slowest / 1000 / windowSeconds);
  return {rows, jev, slowest, speed, jevMs: heroMs(jev)};
}

export const Race: React.FC<FilmProps & {caption: string; windowSeconds: number}> = ({
  data,
  caption,
  windowSeconds,
}) => {
  const frame = useCurrentFrame();
  const {fps, width, height, durationInFrames} = useVideoConfig();
  const u = height / 1080;
  const {rows, jev, slowest, speed, jevMs} = raceTiming(data, windowSeconds);

  const elapsed = Math.max(
    0,
    Math.min(slowest, ((frame - RACE_LEAD) / fps) * 1000 * speed),
  ); // strictly linear
  const capFrameOf = (ms: number) => RACE_LEAD + (ms / speed / 1000) * fps;

  /* ---- geometry ------------------------------------------------- */
  const benchY = 808 * u;
  const glassH = 430 * u;
  const tumblerW = 300 * u;
  const pitch = PITCH * u;
  const rowX = (i: number) => 520 * u + pitch * i; // world coordinates
  const lastX = rowX(rows.length - 1);
  const jevX = 26 * u;
  const jevW = JEV_W * u;

  /* ---- camera: push in, dolly the row, pull back ----------------- */
  const raceFrames = windowSeconds * fps;
  const k = (t: number) => RACE_LEAD + t * raceFrames; // t as a fraction of the race
  const cam = useCamera([
    {at: 0, zoom: 0.72, x: rowX(0) + pitch * 0.6, y: benchY - glassH * 0.45},
    {at: k(0.1), zoom: 0.72, x: rowX(0) + pitch * 0.6, y: benchY - glassH * 0.45},
    {at: k(0.2), zoom: 1.0, x: rowX(0) + tumblerW * 0.1, y: benchY - glassH * 0.42},
    {at: k(0.42), zoom: 1.0, x: rowX(0) + tumblerW * 0.1, y: benchY - glassH * 0.42},
    // the lateral dolly: constant zoom, travelling to the fastest
    {at: k(0.88), zoom: 1.0, x: lastX + tumblerW * 0.1, y: benchY - glassH * 0.42},
    {at: k(0.99), zoom: 0.78, x: lastX - pitch * 0.35, y: benchY - glassH * 0.45},
    {at: durationInFrames - 26, zoom: 0.78, x: lastX - pitch * 0.35, y: benchY - glassH * 0.45},
    {at: durationInFrames, zoom: 0.84, x: lastX - pitch * 0.35, y: benchY - glassH * 0.5},
  ]);

  const exit = ramp(frame, durationInFrames - 10, durationInFrames, EASE_OUT);

  return (
    <AbsoluteFill style={{backgroundColor: C.bg, opacity: 1 - exit}}>
      <Ambient glow="rgba(64,104,180,0.2)" cam={cam} />

      <Camera cam={cam}>
        <svg
          width={width * 6}
          height={height}
          style={{position: 'absolute', left: 0, top: 0, overflow: 'visible'}}
        >
          {/* the bench runs the length of the row */}
          <rect x={0} y={benchY} width={width * 6} height={3 * u} fill="rgba(255,255,255,0.14)" />
          <rect x={0} y={benchY + 3 * u} width={width * 6} height={40 * u} fill="url(#benchgrad)" />
          <defs>
            <linearGradient id="benchgrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(255,255,255,0.06)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </linearGradient>
          </defs>

          {rows.map((r, i) => {
            const capF = capFrameOf(r.ms);
            const frac = Math.min(elapsed, r.ms) / slowest;
            const pouring = frame >= RACE_LEAD && elapsed < r.ms;
            const cx = rowX(i) + tumblerW / 2;
            const surfaceY = benchY - 26 * u * 0.35 - clamp01(frac) * (glassH - 26 * u * 0.55);
            return (
              <g key={r.sys.system}>
                {pouring ? (
                  <Pour
                    cx={cx}
                    fromY={-40 * u}
                    toY={surfaceY}
                    w={tumblerW}
                    color={claudeColor(r.tier)}
                    frac={frac}
                    seed={i}
                    u={u}
                    opacity={ramp(frame, RACE_LEAD - 4, RACE_LEAD + 3, EASE_OUT)}
                  />
                ) : null}
                <Tumbler
                  id={r.sys.system}
                  frac={frac}
                  color={claudeColor(r.tier)}
                  since={frame - capF}
                  sinceEnter={frame - i * STAGGER}
                  sincePour={frame - RACE_LEAD}
                  x={rowX(i)}
                  baseY={benchY}
                  w={tumblerW}
                  h={glassH}
                  u={u}
                />
              </g>
            );
          })}
        </svg>

        {/* names and times ride with the world */}
        {rows.map((r, i) => {
          const done = elapsed >= r.ms;
          const since = frame - capFrameOf(r.ms);
          const stamp = done ? spring({frame: since, fps, config: POP}) : 0;
          const inn = spring({frame: frame - i * STAGGER - 10, fps, config: SNAP, durationInFrames: 22});
          return (
            <div
              key={r.sys.system}
              style={{
                position: 'absolute',
                left: rowX(i),
                top: benchY + 52 * u,
                width: tumblerW,
                textAlign: 'center',
                opacity: inn,
                transform: `translateY(${interpolate(inn, [0, 1], [22, 0])}px)`,
              }}
            >
              <div
                style={{
                  fontFamily: SANS,
                  fontWeight: 700,
                  fontSize: 40 * u,
                  color: done ? claudeColor(r.tier) : C.ink,
                  letterSpacing: '-0.02em',
                  whiteSpace: 'nowrap',
                }}
              >
                {r.sys.label}
              </div>
              <div style={{...upper(0.16), fontSize: 19 * u, color: C.ink3, marginTop: 4 * u}}>
                thinking off
              </div>
              <div
                style={{
                  ...tabular,
                  fontWeight: 800,
                  fontSize: 58 * u,
                  color: done ? claudeColor(r.tier) : C.ink3,
                  marginTop: 8 * u,
                  transform: `scale(${done ? interpolate(Math.min(stamp, 1), [0, 1], [1.7, 1]) : 1})`,
                  textShadow: done && since < 14 ? `0 0 ${34 * u}px ${claudeColor(r.tier)}` : 'none',
                }}
              >
                {((done ? r.ms : Math.min(elapsed, r.ms)) / 1000).toFixed(2)}s
              </div>
            </div>
          );
        })}
      </Camera>

      {/* ---- Jev, pinned to the left edge, outside the camera ------- */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: jevX + jevW + 58 * u,
          background: 'linear-gradient(90deg, rgba(7,7,10,1) 0%, rgba(7,7,10,1) 74%, rgba(7,7,10,0) 100%)',
        }}
      />
      <svg width={width} height={height} style={{position: 'absolute', inset: 0}}>
        <Tumbler
          id="jev-pinned"
          frac={Math.min(elapsed, jevMs) / slowest}
          color={C.accent}
          accent
          since={frame - capFrameOf(jevMs)}
          sinceEnter={frame + 6}
          sincePour={frame - RACE_LEAD}
          x={jevX}
          baseY={benchY}
          w={jevW}
          h={glassH}
          u={u}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          left: jevX,
          top: benchY + 46 * u,
          width: jevW,
          textAlign: 'center',
        }}
      >
        <div style={{fontFamily: SANS, fontWeight: 700, fontSize: 38 * u, color: C.accent}}>
          {jev.label}
        </div>
        <div style={{...upper(0.14), fontSize: 18 * u, color: C.ink3, marginTop: 4 * u}}>
          via OpenRouter
        </div>
        <div
          style={{
            ...tabular,
            fontWeight: 800,
            fontSize: 56 * u,
            color: C.accent,
            marginTop: 8 * u,
            textShadow: `0 0 ${26 * u}px rgba(255,106,43,0.6)`,
          }}
        >
          {(jevMs / 1000).toFixed(2)}s
        </div>
      </div>

      <Timer
        ms={elapsed}
        progress={slowest ? elapsed / slowest : 0}
        u={u}
        label={speed >= 0.995 ? 'elapsed · real time' : `elapsed · ×${speed.toFixed(2)} speed`}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 'auto',
          top: 46 * u,
          width: 540 * u,
          textAlign: 'left',
          padding: `0 0 0 ${44 * u}px`,
          fontFamily: SANS,
          fontWeight: 700,
          fontSize: 41 * u,
          color: C.ink,
          letterSpacing: '-0.03em',
          lineHeight: 1.1,
          opacity: ramp(frame, 8, 26, EASE_OUT) * (1 - ramp(frame, durationInFrames - 24, durationInFrames - 8)),
          textShadow: '0 2px 22px rgba(0,0,0,0.9)',
        }}
      >
        {caption}
      </div>
      
      <StageWatermark data={data} />
    </AbsoluteFill>
  );
};
