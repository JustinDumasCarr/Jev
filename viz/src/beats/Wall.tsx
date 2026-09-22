import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {Caption, Stopwatch, Tag, Typed} from '../chrome';
import {C, MONO, SANS, claudeColor, tabular, upper} from '../theme';
import {jevOf, panels} from '../timeline.mjs';
import type {FilmProps, System} from '../types';

/* Beat 3 — every Claude model writes at once. The main event.

   All of them started the same call at t = 0. Jev's answer is already pinned at the top.
   Each panel runs on its own measured `duration_api_ms`: a thinking shimmer with a live
   token counter climbing to that model's real thinking tokens (the content is never
   shown), then its answer typed at its own rate — its output tokens over its own time —
   and a cap with the time it actually took. Nothing here is eased: the counter, the
   typing and the stopwatch are all linear in the measurement. Only the panels' entrance
   and the cap stamp use springs, because those are objects, not quantities. */

const CAP_MS = 12000;

const heroMs = (s: System | null) => (s?.hero?.duration_api_ms ?? s?.latency_ms.p50 ?? 0) as number;

const Panel: React.FC<{
  sys: System;
  ghost: System | null;
  tier: number;
  elapsed: number;
  index: number;
  u: number;
  w: number;
  h: number;
}> = ({sys, ghost, tier, elapsed, index, u, w, h}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const color = claudeColor(tier);
  const hero = sys.hero;
  const duration = heroMs(sys);
  const thinkMs = hero?.thinking_ms_est ?? 0;
  const typeMs = Math.max(1, duration - thinkMs);
  const overCap = duration > CAP_MS;

  const enter = spring({frame: frame - index * 1, fps, config: {damping: 200}, durationInFrames: 12});
  const thinking = elapsed < thinkMs;
  const thinkTokens = Math.floor(interpolate(elapsed, [0, Math.max(1, thinkMs)], [0, hero?.thinking_tokens ?? 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  }));
  const typed = interpolate(elapsed, [thinkMs, thinkMs + typeMs], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const capped = !overCap && elapsed >= duration;
  // How long this panel has been capped, in frames — drives the stamp spring, so the
  // bounce belongs to the stamp and not to the time it is showing.
  const sinceCap = capped ? ((elapsed - duration) / 1000) * fps : -1;
  const stamp = capped ? spring({frame: Math.round(sinceCap), fps, config: {damping: 12, stiffness: 240}}) : 0;

  const shimmer = (frame % 40) / 40;
  const ghostDone = ghost ? elapsed >= heroMs(ghost) : false;

  return (
    <div style={{position: 'relative', width: w, height: h, opacity: enter}}>
      {ghost ? (
        <div
          style={{
            position: 'absolute',
            left: 13 * u,
            top: 13 * u,
            width: w,
            height: h,
            borderRadius: 20 * u,
            border: `1px solid ${color}`,
            opacity: 0.3,
            background: 'rgba(255,255,255,0.02)',
          }}
        />
      ) : null}

      <div
        style={{
          position: 'relative',
          width: w,
          height: h,
          borderRadius: 20 * u,
          background: capped ? 'rgba(255,255,255,0.055)' : 'rgba(255,255,255,0.028)',
          border: `${capped ? 2 * u : 1}px solid ${capped ? color : C.hair}`,
          boxShadow: capped ? `0 0 ${34 * u}px ${color}26` : 'none',
          padding: `${16 * u}px ${20 * u}px`,
          display: 'flex',
          flexDirection: 'column',
          gap: 8 * u,
          overflow: 'hidden',
          transform: `translateY(${interpolate(enter, [0, 1], [26, 0])}px)`,
        }}
      >
        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 * u}}>
          <div style={{display: 'flex', alignItems: 'center', gap: 9 * u, minWidth: 0, flexShrink: 1}}>
            <span
              style={{
                fontFamily: SANS,
                fontWeight: 700,
                fontSize: 29 * u,
                color: capped ? color : C.ink,
                letterSpacing: '-0.02em',
                whiteSpace: 'nowrap',
              }}
            >
              {sys.label}
            </span>
            <Tag size={11 * u}>thinking off</Tag>
          </div>
          {capped ? (
            <span
              style={{
                ...tabular,
                fontWeight: 800,
                fontSize: 36 * u,
                flexShrink: 0,
                color,
                transform: `scale(${interpolate(Math.min(stamp, 1), [0, 1], [1.7, 1])})`,
                transformOrigin: 'right center',
                whiteSpace: 'nowrap',
              }}
            >
              {(duration / 1000).toFixed(2)}s
            </span>
          ) : overCap && elapsed >= CAP_MS ? (
            <span style={{...upper(0.16), fontSize: 15 * u, color: C.ink3}}>still writing</span>
          ) : (
            <span style={{...tabular, fontSize: 22 * u, color: C.ink3}}>
              {(Math.min(elapsed, duration) / 1000).toFixed(2)}s
            </span>
          )}
        </div>

        {thinking ? (
          <div style={{display: 'flex', alignItems: 'center', gap: 12 * u, marginTop: 6 * u}}>
            <div
              style={{
                flex: 1,
                height: 10 * u,
                borderRadius: 999,
                overflow: 'hidden',
                background: 'rgba(255,255,255,0.06)',
              }}
            >
              <div
                style={{
                  width: '38%',
                  height: '100%',
                  borderRadius: 999,
                  background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
                  transform: `translateX(${interpolate(shimmer, [0, 1], [-100, 270])}%)`,
                }}
              />
            </div>
            <span style={{...tabular, fontSize: 21 * u, color: C.ink2, whiteSpace: 'nowrap'}}>
              {thinkTokens} thinking tokens
            </span>
          </div>
        ) : (
          <div
            style={{
              flex: 1,
              minHeight: 0,
              opacity: capped ? 0.95 : 1,
            }}
          >
            <Typed
              text={hero?.output_text ?? ''}
              progress={typed}
              caretColor={color}
              style={{
                fontFamily: MONO,
                fontWeight: 500,
                fontSize: 19 * u,
                lineHeight: 1.45,
                color: capped ? C.ink : C.ink2,
                wordBreak: 'break-word',
                display: 'block',
              }}
            />
          </div>
        )}
      </div>

      {/* the thinking twin's own cap time, on a tab that sticks out of the pair */}
      {ghost ? (
        <div
          style={{
            position: 'absolute',
            right: -6 * u,
            bottom: -11 * u,
            padding: `${5 * u}px ${12 * u}px`,
            borderRadius: 8 * u,
            background: C.bg,
            border: `1px solid ${color}66`,
            ...tabular,
            fontSize: 18 * u,
            fontWeight: 700,
            color: ghostDone ? color : C.ink3,
            whiteSpace: 'nowrap',
          }}
        >
          {ghostDone ? (heroMs(ghost) / 1000).toFixed(2) + 's' : '…'} · thinking on
        </div>
      ) : null}
    </div>
  );
};

export const Wall: React.FC<FilmProps & {caption: string}> = ({data, layout, caption}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const u = height / 1080;
  const jev = jevOf(data);
  const jevMs = heroMs(jev);
  const ps = panels(data, layout) as {sys: System; ghost: System | null; tier: number}[];

  // Real elapsed time of the call, continuing from where Jev stamped. Linear, always.
  const elapsed = Math.min(CAP_MS, jevMs + (frame / fps) * 1000);

  const cols = layout === 'wide' ? 4 : 2;
  const rows = Math.ceil(ps.length / cols);
  const gap = 18 * u;
  const outer = layout === 'wide' ? 72 * u : 54 * u;
  const gridTop = 322 * u;
  const gridBottom = height - 164 * u;
  const gridW = width - outer * 2;
  const gridH = gridBottom - gridTop;
  const pw = (gridW - gap * (cols - 1)) / cols - (layout === 'wide' ? 14 * u : 0);
  const ph = (gridH - gap * (rows - 1)) / rows - (layout === 'wide' ? 14 * u : 0);

  const jevIn = spring({frame, fps, config: {damping: 200}, durationInFrames: 10});

  return (
    <AbsoluteFill>
      {/* Jev, already done, pinned */}
      <div
        style={{
          position: 'absolute',
          top: 52 * u,
          left: outer,
          right: outer,
          height: 84 * u,
          borderRadius: 18 * u,
          border: `${2 * u}px solid ${C.accent}`,
          background: 'rgba(255,106,43,0.12)',
          display: 'flex',
          alignItems: 'center',
          gap: 20 * u,
          padding: `0 ${24 * u}px`,
          opacity: jevIn,
          transform: `translateY(${interpolate(jevIn, [0, 1], [-30, 0])}px)`,
        }}
      >
        <span style={{fontFamily: SANS, fontWeight: 700, fontSize: 34 * u, color: C.accent}}>
          {jev?.label ?? 'Jev'}
        </span>
        <Tag size={13 * u}>via OpenRouter</Tag>
        <span style={{...tabular, fontWeight: 700, fontSize: 30 * u, color: C.ink}}>
          {(jev?.hero?.decision || '').toUpperCase()} {Math.round((jev?.hero?.p ?? 0) * 100)}%
        </span>
        <span style={{flex: 1}} />
        <span style={{...upper(0.18), fontSize: 15 * u, color: C.ink3}}>answered at</span>
        <span style={{...tabular, fontWeight: 800, fontSize: 46 * u, color: C.accent}}>
          {(jevMs / 1000).toFixed(2)}s
        </span>
      </div>

      {/* the clock everyone is running against */}
      <div style={{position: 'absolute', top: 158 * u, left: 0, right: 0, display: 'flex', justifyContent: 'center'}}>
        <Stopwatch ms={elapsed} width={width} size={128 * u} label="elapsed · real time" />
      </div>

      <div
        style={{
          position: 'absolute',
          top: gridTop,
          left: outer,
          width: gridW,
          height: gridH,
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridAutoRows: `${ph}px`,
          gap,
        }}
      >
        {ps.map((p, i) => (
          <Panel
            key={p.sys.system}
            sys={p.sys}
            ghost={p.ghost}
            tier={p.tier}
            elapsed={elapsed}
            index={i}
            u={u}
            w={pw}
            h={ph}
          />
        ))}
      </div>

      <Caption text={caption} width={width} />
    </AbsoluteFill>
  );
};
