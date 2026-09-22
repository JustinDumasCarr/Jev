import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {Caption, Stopwatch, Typed} from '../chrome';
import {C, SANS, upper} from '../theme';
import type {FilmProps} from '../types';

/* Beat 1 — the prompt. Dark frame, the hero case types itself in, one word underneath,
   the stopwatch already visible at zero so the viewer knows something is about to be
   timed (§5b: the hook has to land without sound, inside three seconds). */

export const Prompt: React.FC<FilmProps & {caption: string}> = ({data, layout, caption}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const u = height / 1080;
  const hero = data.meta.hero_case;
  const text = hero.text || '(no case text available)';

  const typeFrames = Math.round(1.5 * fps);
  const typed = interpolate(frame, [Math.round(0.35 * fps), Math.round(0.35 * fps) + typeFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const bubbleIn = spring({frame, fps, config: {damping: 200}, durationInFrames: 14});
  const qIn = spring({
    frame: frame - (Math.round(0.35 * fps) + typeFrames + 4),
    fps,
    config: {damping: 12, stiffness: 140},
  });

  const bubbleW = layout === 'wide' ? 1180 * u : 880 * u;

  return (
    <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
      <div
        style={{
          position: 'absolute',
          top: 64 * u,
          ...upper(0.26),
          fontSize: 20 * u,
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
            transform: `scale(${interpolate(bubbleIn, [0, 1], [0.96, 1])})`,
            boxShadow: `0 ${40 * u}px ${90 * u}px rgba(0,0,0,0.55)`,
          }}
        >
          <div style={{...upper(0.2), fontSize: 17 * u, color: C.ink3, marginBottom: 20 * u}}>
            user message
          </div>
          <Typed
            text={text}
            progress={typed}
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
            opacity: qIn,
            transform: `scale(${interpolate(qIn, [0, 1], [0.72, 1])})`,
          }}
        >
          {data.meta.hero_case.question}
        </div>
      </div>

      <div style={{position: 'absolute', bottom: 210 * u, opacity: interpolate(frame, [fps, fps * 1.6], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>
        <Stopwatch ms={0} width={width} size={64 * u} label="stopwatch" />
      </div>

      <Caption text={caption} width={width} />
    </AbsoluteFill>
  );
};
