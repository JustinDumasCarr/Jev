import React from 'react';
import {AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {Tag} from '../chrome';
import {Ambient, EASE_OUT, StageWatermark, Timer, ramp, useCamera, Camera} from '../stage';
import {C, MONO, SANS, tabular, upper} from '../theme';
import {jevOf} from '../timeline.mjs';
import type {FilmProps} from '../types';

/* Beat 2 — Jev answers. A pulse leaves and comes back, then the stamp slams down with
   the verbatim decision it returned on this case and the measured time beside it.

   The first 0.45 s of this beat replays Jev's real call in slow motion, because at real
   speed it is over before a frame lands. The frame says so, and the number shown is the
   true one. */

export const JevStamp: React.FC<FilmProps & {caption: string}> = ({data, caption}) => {
  const frame = useCurrentFrame();
  const {fps, width, height, durationInFrames} = useVideoConfig();
  const u = height / 1080;
  const jev = jevOf(data);
  const hero = jev?.hero;
  const callMs = hero?.duration_api_ms ?? jev?.latency_ms.p50 ?? 0;
  const p = hero?.p ?? jev?.accuracy.point ?? 0;
  const decision = (hero?.decision || 'injection').toUpperCase();

  const travelFrames = Math.round(0.45 * fps);
  const travel = interpolate(frame, [0, travelFrames], [0, 1], {extrapolateRight: 'clamp'});
  const elapsed = travel * callMs; // linear: this is the measurement

  const stamp = spring({frame: frame - travelFrames, fps, config: {damping: 11, stiffness: 190, mass: 0.8}});
  const shock = interpolate(frame, [travelFrames, travelFrames + Math.round(0.6 * fps)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.quad),
  });
  const barFill = interpolate(frame, [travelFrames + 3, travelFrames + 3 + Math.round(0.4 * fps)], [0, p], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const timeIn = spring({frame: frame - travelFrames - 4, fps, config: {damping: 13, stiffness: 220}});

  // the pulse: out and back across the frame, an object, so it may ease
  const pulseX = interpolate(travel, [0, 0.5, 1], [-0.1, 1.1, -0.1]);
  const stampW = 640 * u;
  const exit = ramp(frame, durationInFrames - 8, durationInFrames, EASE_OUT);
  const cam = useCamera([
    {at: 0, zoom: 1, x: width / 2, y: height / 2},
    {at: travelFrames, zoom: 1, x: width / 2, y: height / 2},
    {at: travelFrames + 14, zoom: 1.12, x: width / 2, y: height / 2 - 10 * u},
    {at: durationInFrames, zoom: 1.16, x: width / 2, y: height / 2 - 14 * u},
  ]);

  return (
    <AbsoluteFill style={{backgroundColor: C.bg, opacity: 1 - exit}}>
      <Ambient glow="rgba(255,106,43,0.22)" cam={cam} />
      <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', transform: cam.transform, transformOrigin: '0 0'}}>
      {/* the hop */}
      <div style={{position: 'absolute', top: 210 * u, left: 0, right: 0, height: 3 * u}}>
        <div style={{position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.06)'}} />
        <div
          style={{
            position: 'absolute',
            top: -4 * u,
            left: `${pulseX * 100}%`,
            width: 200 * u,
            height: 11 * u,
            marginLeft: -100 * u,
            borderRadius: 999,
            background: `linear-gradient(90deg, rgba(255,106,43,0) 0%, ${C.accent} 50%, rgba(255,106,43,0) 100%)`,
            opacity: travel < 1 ? 1 : 0,
            filter: `blur(${2 * u}px)`,
          }}
        />
      </div>

      <div style={{position: 'absolute', top: 132 * u, display: 'flex', gap: 14 * u, alignItems: 'center'}}>
        <div style={{...upper(0.2), fontSize: 26 * u, color: C.accent}}>{jev?.label ?? 'Jev'}</div>
        <Tag size={16 * u}>via OpenRouter</Tag>
      </div>

      {/* shockwave */}
      <div
        style={{
          position: 'absolute',
          width: stampW,
          height: 300 * u,
          borderRadius: 40 * u,
          border: `${4 * u}px solid ${C.accent}`,
          opacity: (1 - shock) * 0.7,
          transform: `scale(${interpolate(shock, [0, 1], [1, 1.55])})`,
        }}
      />

      <div
        style={{
          width: stampW,
          padding: `${40 * u}px ${44 * u}px ${34 * u}px`,
          borderRadius: 32 * u,
          border: `${5 * u}px solid ${C.accent}`,
          background: 'rgba(255,106,43,0.10)',
          transform: `scale(${interpolate(stamp, [0, 1], [1.45, 1])}) rotate(${interpolate(stamp, [0, 1], [-7, -2.2])}deg)`,
          opacity: stamp > 0.02 ? 1 : 0,
          boxShadow: `0 ${30 * u}px ${80 * u}px rgba(255,106,43,0.18)`,
        }}
      >
        <div
          style={{
            fontFamily: SANS,
            fontWeight: 700,
            fontSize: 96 * u,
            letterSpacing: '-0.03em',
            color: C.accent,
            lineHeight: 1,
          }}
        >
          {decision}
        </div>
        <div style={{display: 'flex', alignItems: 'center', gap: 20 * u, marginTop: 26 * u}}>
          <div
            style={{
              flex: 1,
              height: 18 * u,
              borderRadius: 999,
              background: 'rgba(255,255,255,0.10)',
              overflow: 'hidden',
            }}
          >
            {/* linear: the bar length is the probability it returned */}
            <div style={{width: `${barFill * 100}%`, height: '100%', background: C.accent}} />
          </div>
          <div style={{...tabular, fontWeight: 800, fontSize: 46 * u, color: C.ink}}>
            {Math.round(barFill * 100)}%
          </div>
        </div>
      </div>

      {/* the measured time, punched in */}
      <div
        style={{
          position: 'absolute',
          bottom: 224 * u,
          display: 'flex',
          alignItems: 'baseline',
          gap: 18 * u,
          opacity: timeIn,
          transform: `scale(${interpolate(timeIn, [0, 1], [1.6, 1])})`,
        }}
      >
        <span style={{...tabular, fontWeight: 800, fontSize: 168 * u, color: C.ink, letterSpacing: '-0.04em'}}>
          {(elapsed / 1000).toFixed(2)}
        </span>
        <span style={{fontFamily: MONO, fontWeight: 700, fontSize: 64 * u, color: C.accent}}>s</span>
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: 188 * u,
          ...upper(0.24),
          fontSize: 17 * u,
          color: C.ink3,
        }}
      >
        {travel < 1 ? 'slow motion · real value' : 'measured, one call'}
      </div>

      </AbsoluteFill>

      <Timer ms={elapsed} progress={1} u={u} accent label="jev · measured, one call" />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 56 * u,
          textAlign: 'center',
          fontFamily: SANS,
          fontWeight: 700,
          fontSize: 38 * u,
          letterSpacing: '-0.02em',
          color: C.accent,
          opacity: ramp(frame, travelFrames, travelFrames + 10, EASE_OUT),
        }}
      >
        {caption}
      </div>
      <StageWatermark data={data} />
    </AbsoluteFill>
  );
};
