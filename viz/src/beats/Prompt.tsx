import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {Typed} from '../chrome';
import {Ambient, EASE_OUT, SNAP, StageWatermark, Timer, ramp, useCamera, Camera} from '../stage';
import {C, SANS, upper} from '../theme';
import type {FilmProps} from '../types';

/* Beat 1 — the prompt. Dark frame, the hero case types itself in, one word underneath,
   the stopwatch already visible at zero so the viewer knows something is about to be
   timed (§5b: the hook has to land without sound, inside three seconds). */

export const Prompt: React.FC<FilmProps & {caption: string}> = ({data, layout, caption}) => {
  const frame = useCurrentFrame();
  const {fps, width, height, durationInFrames} = useVideoConfig();
  const u = height / 1080;
  const hero = data.meta.hero_case;
  const text = hero.text || '(no case text available)';

  const typeFrames = Math.round(1.5 * fps);
  const typed = interpolate(frame, [Math.round(0.35 * fps), Math.round(0.35 * fps) + typeFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const bubbleIn = spring({frame, fps, config: {damping: 15, stiffness: 150, mass: 0.9}});
  const qIn = spring({
    frame: frame - (Math.round(0.35 * fps) + typeFrames + 4),
    fps,
    config: {damping: 11, stiffness: 190, mass: 0.75},
  });
  const qAt = Math.round(0.35 * fps) + typeFrames + 4;
  const qSquash = 1 + (frame - qAt >= 0 ? Math.exp(-(frame - qAt) / 6) * Math.sin(((frame - qAt) / 5) * Math.PI * 2) * 0.18 : 0);
  const qLand = Math.max(0, 1 - Math.max(0, frame - qAt) / 12);
  const enter = ramp(frame, 0, 8, EASE_OUT);
  const exit = ramp(frame, durationInFrames - 9, durationInFrames, EASE_OUT);
  const cam = useCamera([
    {at: 0, zoom: 1.06, x: width / 2, y: height / 2},
    {at: durationInFrames, zoom: 1.0, x: width / 2, y: height / 2},
  ]);

  const bubbleW = layout === 'wide' ? 1180 * u : 880 * u;

  return (
    <AbsoluteFill style={{backgroundColor: C.bg, opacity: enter, transform: `scale(${1 - exit * 0.05})`}}>
      <Ambient glow="rgba(64,104,180,0.16)" cam={cam} />
      <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', transform: cam.transform, transformOrigin: '0 0'}}>
      <div
        style={{
          position: 'absolute',
          top: 62 * u,
          left: 52 * u,
          ...upper(0.26),
          fontSize: 19 * u,
          color: C.ink3,
        }}
      >
        {data.meta.task_label}
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 46 * u,
          transform: `translateY(${-30 * u}px)`,
        }}
      >
        <div
          style={{
            width: bubbleW,
            background: C.panel,
            border: `1px solid ${C.hair}`,
            borderRadius: 30 * u,
            borderBottomLeftRadius: 8 * u,
            padding: `${38 * u}px ${44 * u}px`,
            opacity: bubbleIn,
            transform: `translateY(${interpolate(bubbleIn, [0, 1], [46, 0])}px) scale(${interpolate(
              bubbleIn,
              [0, 1],
              [0.93, 1],
            )})`,
            boxShadow: `0 ${interpolate(bubbleIn, [0, 1], [90, 40]) * u}px ${
              interpolate(bubbleIn, [0, 1], [130, 90]) * u
            }px rgba(0,0,0,${interpolate(bubbleIn, [0, 1], [0.2, 0.62])})`,
          }}
        >
          <div style={{...upper(0.2), fontSize: 17 * u, color: C.ink3, marginBottom: 20 * u}}>
            user message
          </div>
          <Typed
            text={text}
            progress={typed}
            pop
            caretColor={C.ink2}
            style={{
              fontFamily: SANS,
              fontWeight: 500,
              fontSize: 40 * u,
              lineHeight: 1.36,
              color: C.ink,
              letterSpacing: '-0.005em',
            }}
          />
        </div>

        <div
          style={{
            fontFamily: SANS,
            fontWeight: 700,
            fontSize: 108 * u,
            letterSpacing: '-0.035em',
            color: C.ink,
            opacity: Math.min(1, qIn * 2.2),
            transform: `translateY(${interpolate(Math.min(qIn, 1), [0, 1], [-64, 0])}px) scale(${
              interpolate(qIn, [0, 1], [1.28, 1]) / qSquash
            }, ${interpolate(qIn, [0, 1], [1.28, 1]) * qSquash})`,
            textShadow: qLand > 0 ? `0 0 ${54 * u * qLand}px rgba(255,255,255,${0.42 * qLand})` : 'none',
          }}
        >
          {data.meta.hero_case.question}
        </div>
      </div>

      </AbsoluteFill>

      <Timer ms={0} progress={0} u={u} wake={ramp(frame, 10, 34, EASE_OUT)} label="stopwatch · standing by" />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 56 * u,
          textAlign: 'center',
          padding: `0 ${80 * u}px`,
          fontFamily: SANS,
          fontWeight: 600,
          fontSize: 33 * u,
          color: C.ink,
          opacity: ramp(frame, 6, 22, EASE_OUT),
          transform: `translateY(${interpolate(ramp(frame, 6, 22, EASE_OUT), [0, 1], [18, 0])}px)`,
        }}
      >
        {caption}
      </div>
      <StageWatermark data={data} />
    </AbsoluteFill>
  );
};
