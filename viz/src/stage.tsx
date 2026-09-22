import React from 'react';
import {AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {Watermark} from './chrome';
import {C, MONO, SANS, tabular, upper} from './theme';
import type {FilmProps} from './types';

/* ------------------------------------------------------------------ *
 * v2 stage kit — the motion vocabulary the three prototypes share.
 *
 * The rule that does not move: anything whose size, length, level or
 * count encodes a measurement is strictly LINEAR in elapsed time. The
 * craft goes into everything else — entrances, impacts, secondary
 * motion, ambient life and the camera — where strong curves, springs,
 * anticipation and overshoot are not only allowed but required.
 *
 * Curves are the strong ones from the animation audit playbook rather
 * than CSS's weak built-ins:
 *   ease-out     cubic-bezier(0.23, 1,    0.32, 1   )
 *   ease-in-out  cubic-bezier(0.77, 0,    0.175, 1  )
 *   drawer       cubic-bezier(0.32, 0.72, 0,    1   )
 * ------------------------------------------------------------------ */

export const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
export const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);
export const EASE_DRAWER = Easing.bezier(0.32, 0.72, 0, 1);

/** Spring presets. Bounce stays subtle except on an impact. */
export const SMOOTH = {damping: 200};
export const SNAP = {damping: 18, stiffness: 220, mass: 0.8};
export const POP = {damping: 11, stiffness: 260, mass: 0.7};
export const IMPACT = {damping: 8, stiffness: 300, mass: 0.6};

/** Stagger: 2.5 frames ≈ 83 ms between nine elements, ~0.7 s total. */
export const STAGGER = 2.5;

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** ease a 0..1 ramp with one of the strong curves */
export const ramp = (
  frame: number,
  from: number,
  to: number,
  easing: (t: number) => number = EASE_OUT,
) =>
  interpolate(frame, [from, to], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing,
  });

/** A damped oscillation — follow-through and slosh. Dies out on its own. */
export const wobble = (t: number, period = 9, decay = 14) =>
  t < 0 ? 0 : Math.exp(-t / decay) * Math.sin((t / period) * Math.PI * 2);

/* ------------------------------------------------------------------ *
 * Camera
 * ------------------------------------------------------------------ */

export type CamKey = {at: number; zoom: number; x: number; y: number};

/**
 * A push-in / pull-back rig. Keyframes are interpolated with the strong
 * ease-in-out, because a camera move is on-screen movement, never a
 * measurement.
 */
export const useCamera = (keys: CamKey[]) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  // interpolate() demands a strictly increasing input range, and keyframes derived
  // from data can land on the same frame; keep the first of any such pair.
  keys = keys.filter((k, i, a) => i === 0 || k.at > a[i - 1].at);
  if (keys.length === 0) return {transform: 'none', zoom: 1, dx: 0, dy: 0};
  const ats = keys.map((k) => k.at);
  const pick = (get: (k: CamKey) => number) =>
    keys.length === 1
      ? get(keys[0])
      : interpolate(frame, ats, keys.map(get), {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
          easing: EASE_IN_OUT,
        });
  const zoom = pick((k) => k.zoom);
  const fx = pick((k) => k.x);
  const fy = pick((k) => k.y);
  const dx = (width / 2 - fx) * zoom;
  const dy = (height / 2 - fy) * zoom;
  return {
    transform: `translate(${dx - (width * (zoom - 1)) / 2}px, ${dy - (height * (zoom - 1)) / 2}px) scale(${zoom})`,
    zoom,
    dx,
    dy,
  };
};

export const Camera: React.FC<{cam: ReturnType<typeof useCamera>; children: React.ReactNode}> = ({
  cam,
  children,
}) => (
  <AbsoluteFill style={{transform: cam.transform, transformOrigin: '0 0', willChange: 'transform'}}>
    {children}
  </AbsoluteFill>
);

/* ------------------------------------------------------------------ *
 * Ambient: the layer that keeps the frame alive when nothing is
 * happening. Parallax follows the camera at a fraction of its move.
 * ------------------------------------------------------------------ */

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E\")";

export const Ambient: React.FC<{glow?: string; cam?: {zoom: number; dx: number; dy: number}}> = ({
  glow = 'rgba(64,104,180,0.22)',
  cam,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  // a slow breath, so the pool of light is never perfectly still
  const breathe = 1 + 0.04 * Math.sin((frame / fps) * 0.9);
  const px = cam ? cam.dx * 0.18 : 0;
  const py = cam ? cam.dy * 0.18 : 0;
  return (
    <>
      <AbsoluteFill style={{backgroundColor: C.bg}} />
      <AbsoluteFill
        style={{
          transform: `translate(${px}px, ${py}px) scale(${breathe})`,
          background: `radial-gradient(64% 52% at 50% 44%, ${glow} 0%, rgba(7,7,10,0) 72%)`,
        }}
      />
      {/* far plane: a few hairlines that drift, for depth */}
      <AbsoluteFill style={{transform: `translate(${px * 0.5}px, ${py * 0.5}px)`, opacity: 0.5}}>
        {[0.22, 0.46, 0.7].map((f, i) => (
          <div
            key={f}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: `${f * 100}%`,
              height: 1,
              background: 'rgba(255,255,255,0.035)',
              transform: `translateY(${Math.sin((frame / fps) * 0.4 + i) * 6}px)`,
            }}
          />
        ))}
      </AbsoluteFill>
      <AbsoluteFill style={{backgroundImage: GRAIN, opacity: 0.055, mixBlendMode: 'overlay'}} />
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(118% 96% at 50% 50%, rgba(0,0,0,0) 52%, rgba(0,0,0,0.82) 100%)',
        }}
      />
    </>
  );
};

/* ------------------------------------------------------------------ *
 * The stopwatch, built as an instrument rather than a text label:
 * a slab with a lit top edge, an accent rail that fills with the race,
 * digits that flash on each whole second, and a live dot that pulses.
 * No dial — clock faces were ruled out (ANIMATION-PLAN.md §5a).
 * ------------------------------------------------------------------ */

export const Timer: React.FC<{
  ms: number;
  progress: number; // 0..1 through the race — linear, it is a measurement
  u: number;
  label: string;
  text?: string;
  accent?: boolean;
  /** 0..1 — the instrument powering up: lit edge, digits, live dot */
  wake?: number;
}> = ({ms, progress, u, label, text, accent, wake = 1}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const intro = spring({frame: frame - 2, fps, config: SNAP, durationInFrames: 22});
  // a light flash on every whole second: 180 ms decay
  const secs = ms / 1000;
  const sinceTick = (secs % 1) * 1000;
  const tick = Math.max(0, 1 - sinceTick / 180);
  const live = (0.55 + 0.45 * Math.sin((frame / fps) * Math.PI * 2)) * wake;

  return (
    <div
      style={{
        position: 'absolute',
        top: 44 * u,
        right: 48 * u,
        padding: `${16 * u}px ${22 * u}px ${14 * u}px ${26 * u}px`,
        borderRadius: 18 * u,
        background: 'linear-gradient(180deg, rgba(255,255,255,0.075), rgba(255,255,255,0.02))',
        boxShadow: `inset 0 ${1 * u}px 0 rgba(255,255,255,${0.22 * wake}), 0 ${18 * u}px ${44 * u}px rgba(0,0,0,0.55)`,
        opacity: intro,
        transform: `translateY(${interpolate(intro, [0, 1], [-26, 0])}px) scale(${interpolate(
          intro,
          [0, 1],
          [0.96, 1],
        )})`,
        overflow: 'hidden',
      }}
    >
      {/* the rail: fills with the race, strictly linear */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 5 * u,
          background: 'rgba(255,255,255,0.10)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: '100%',
            height: `${clamp01(progress) * 100}%`,
            background: accent ? C.accent : '#8fb6f0',
          }}
        />
      </div>
      <div
        style={{
          ...tabular,
          fontWeight: 800,
          fontSize: 96 * u,
          lineHeight: 0.92,
          color: C.ink,
          opacity: 0.25 + 0.75 * wake,
          letterSpacing: '-0.035em',
          textShadow: `0 0 ${(10 + tick * 34) * u}px rgba(255,255,255,${(0.08 + tick * 0.3) * wake})`,
        }}
      >
        {text ?? (ms / 1000).toFixed(2)}
        {text ? null : <span style={{fontSize: 34 * u, color: C.ink2}}> s</span>}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9 * u,
          justifyContent: 'flex-end',
          marginTop: 6 * u,
        }}
      >
        <span
          style={{
            width: 7 * u,
            height: 7 * u,
            borderRadius: 999,
            background: accent ? C.accent : '#8fb6f0',
            opacity: live,
            boxShadow: `0 0 ${10 * u}px ${accent ? C.accent : '#8fb6f0'}`,
          }}
        />
        <span style={{...upper(0.2), fontSize: 15 * u, color: C.ink3}}>{label}</span>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * Title block — enters once, then gets out of the way.
 * ------------------------------------------------------------------ */

export const TitleBlock: React.FC<{code: string; title: string; note: string; u: number}> = ({
  code,
  title,
  note,
  u,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const inn = spring({frame, fps, config: SNAP, durationInFrames: 24});
  const noteIn = spring({frame: frame - 6, fps, config: SMOOTH, durationInFrames: 20});
  return (
    <div
      style={{
        position: 'absolute',
        top: 52 * u,
        left: 52 * u,
        opacity: inn,
        transform: `translateX(${interpolate(inn, [0, 1], [-30, 0])}px)`,
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
            boxShadow: `0 0 ${24 * u}px rgba(255,106,43,0.5)`,
          }}
        >
          {code}
        </span>
        <div
          style={{
            fontFamily: SANS,
            fontWeight: 700,
            fontSize: 42 * u,
            color: C.ink,
            letterSpacing: '-0.03em',
          }}
        >
          {title}
        </div>
      </div>
      <div
        style={{
          ...upper(0.18),
          fontSize: 15 * u,
          color: C.ink3,
          marginTop: 10 * u,
          opacity: noteIn,
          transform: `translateY(${interpolate(noteIn, [0, 1], [8, 0])}px)`,
        }}
      >
        {note}
      </div>
    </div>
  );
};

/** A footer note that fades in last and stays put. */
export const FootNote: React.FC<{text: string; u: number; delay?: number}> = ({text, u, delay = 14}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const o = spring({frame: frame - delay, fps, config: SMOOTH, durationInFrames: 24});
  return (
    <div
      style={{
        position: 'absolute',
        left: 52 * u,
        bottom: 46 * u,
        ...upper(0.18),
        fontSize: 16 * u,
        color: C.ink3,
        opacity: o * 0.9,
      }}
    >
      {text}
    </div>
  );
};

export const StageWatermark: React.FC<{data: FilmProps['data']}> = ({data}) => {
  const {width, height} = useVideoConfig();
  return <Watermark fixture={data.meta.fixture === true} width={width} height={height} />;
};

export const MONO_FAMILY = MONO;
