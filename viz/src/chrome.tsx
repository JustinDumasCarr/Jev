import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, MONO, SANS, tabular, upper} from './theme';

/* ------------------------------------------------------------------ *
 * Backdrop: near-black, a soft warm pool where the action is, and film
 * grain so the frame is never flat. Static — nothing here encodes data.
 * ------------------------------------------------------------------ */

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")";

export const Backdrop: React.FC<{glow?: string}> = ({glow = 'rgba(70,110,190,0.20)'}) => (
  <AbsoluteFill style={{backgroundColor: C.bg}}>
    <AbsoluteFill
      style={{
        background: `radial-gradient(68% 55% at 50% 38%, ${glow} 0%, rgba(7,7,10,0) 70%)`,
      }}
    />
    <AbsoluteFill style={{backgroundImage: GRAIN, opacity: 0.05, mixBlendMode: 'overlay'}} />
    <AbsoluteFill
      style={{
        background: 'radial-gradient(120% 100% at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.75) 100%)',
      }}
    />
  </AbsoluteFill>
);

/* ------------------------------------------------------------------ *
 * The watermark. Rendered whenever meta.fixture is true; there is no
 * prop, flag or switch that turns it off (ANIMATION-PLAN.md §3).
 * ------------------------------------------------------------------ */

export const Watermark: React.FC<{fixture: boolean; width: number; height: number}> = ({
  fixture,
  width,
  height,
}) => {
  if (!fixture) return null;
  const size = Math.round(width * 0.046);
  const rows = [-1, 0, 1];
  return (
    <AbsoluteFill style={{pointerEvents: 'none', overflow: 'hidden'}}>
      <AbsoluteFill
        style={{
          transform: `rotate(-${(Math.atan2(height, width) * 180) / Math.PI}deg)`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: size * 6.5,
        }}
      >
        {rows.map((r) => (
          <div
            key={r}
            style={{
              ...upper(0.18),
              fontSize: size,
              whiteSpace: 'nowrap',
              color: 'rgba(255,106,43,0.055)',
            }}
          >
            Placeholder data · Placeholder data
          </div>
        ))}
      </AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: '50%',
          transform: 'translate(-50%, -50%) rotate(-90deg)',
          transformOrigin: 'center',
          marginLeft: Math.round(height * 0.020),
          background: C.accent,
          color: '#140600',
          padding: `${Math.round(height * 0.006)}px ${Math.round(height * 0.015)}px`,
          borderRadius: 6,
          ...upper(0.16),
          fontSize: Math.round(height * 0.0145),
          whiteSpace: 'nowrap',
        }}
      >
        Placeholder data · no run has happened yet
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ *
 * Burned-in caption (§5b: most viewers never unmute).
 * ------------------------------------------------------------------ */

export const Caption: React.FC<{text: string; width: number; accent?: boolean}> = ({
  text,
  accent,
}) => {
  const frame = useCurrentFrame();
  const {fps, height} = useVideoConfig();
  // Sized off the frame HEIGHT, so the caption is the same physical size in both cuts.
  const u = height / 1080;
  if (!text) return null;
  const rise = spring({frame: frame - 4, fps, config: {damping: 200}, durationInFrames: 18});
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: Math.round(56 * u),
        textAlign: 'center',
        padding: `0 ${Math.round(80 * u)}px`,
        opacity: rise,
        transform: `translateY(${interpolate(rise, [0, 1], [18, 0])}px)`,
      }}
    >
      <span
        style={{
          fontFamily: SANS,
          fontWeight: 600,
          fontSize: Math.round(33 * u),
          lineHeight: 1.25,
          color: accent ? C.accent : C.ink,
          letterSpacing: '-0.01em',
        }}
      >
        {text}
      </span>
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * The stopwatch: the protagonist. Always shows a real measured value.
 * ------------------------------------------------------------------ */

export const Stopwatch: React.FC<{
  ms: number;
  width: number;
  label?: string;
  size?: number;
  color?: string;
  frozen?: boolean;
}> = ({ms, width, label, size, color, frozen}) => {
  const px = size ?? Math.round(width * 0.155);
  return (
    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: px * 0.06}}>
      <div
        style={{
          ...tabular,
          fontWeight: 800,
          fontSize: px,
          lineHeight: 0.92,
          color: color ?? C.ink,
          letterSpacing: '-0.03em',
          textShadow: frozen ? `0 0 ${px * 0.5}px ${C.accentGlow}` : 'none',
        }}
      >
        {(ms / 1000).toFixed(2)}
        <span style={{fontSize: px * 0.38, marginLeft: px * 0.08, color: C.ink2}}>s</span>
      </div>
      {label ? (
        <div style={{...upper(0.22), fontSize: px * 0.13, color: C.ink3}}>{label}</div>
      ) : null}
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * Small shared bits
 * ------------------------------------------------------------------ */

export const Tag: React.FC<{children: React.ReactNode; color?: string; size: number; solid?: boolean}> = ({
  children,
  color = C.ink3,
  size,
  solid,
}) => (
  <span
    style={{
      ...upper(0.14),
      fontSize: size,
      color: solid ? '#140600' : color,
      background: solid ? color : 'rgba(255,255,255,0.06)',
      border: solid ? 'none' : `1px solid ${C.hair}`,
      padding: `${size * 0.32}px ${size * 0.62}px`,
      borderRadius: size * 0.5,
      whiteSpace: 'nowrap',
      lineHeight: 1,
    }}
  >
    {children}
  </span>
);

/** Types a string out at a rate the caller controls. Linear: it encodes a real rate. */
export const Typed: React.FC<{
  text: string;
  progress: number;
  style?: React.CSSProperties;
  caret?: boolean;
  caretColor?: string;
  /** the newest character lands with a little weight */
  pop?: boolean;
}> = ({text, progress, style, caret = true, caretColor = C.accent, pop}) => {
  const frame = useCurrentFrame();
  const n = Math.max(0, Math.round(progress * text.length));
  const shown = text.slice(0, n);
  const blink = Math.floor(frame / 8) % 2 === 0;
  // String slicing, never per-character opacity: only the character that just
  // arrived is its own element, and only while it is landing.
  const head = pop && n > 0 && progress < 1 ? shown.slice(-1) : '';
  const body = head ? shown.slice(0, -1) : shown;
  return (
    <span style={{fontFamily: MONO, ...style}}>
      {body}
      {head ? (
        <span
          style={{
            display: 'inline-block',
            transform: `translateY(${-2 - (frame % 2) * 0.5}px) scale(1.06)`,
            opacity: 0.92,
          }}
        >
          {head}
        </span>
      ) : null}
      {caret && progress < 1 ? (
        <span
          style={{
            display: 'inline-block',
            width: '0.55em',
            height: '1.05em',
            transform: 'translateY(0.18em)',
            background: blink ? caretColor : 'transparent',
          }}
        />
      ) : null}
    </span>
  );
};
