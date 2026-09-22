import React from 'react';
import {AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, SANS, claudeColor, pct, tabular, upper} from '../theme';
import {Ambient, EASE_OUT, StageWatermark, ramp, useCamera, Camera} from '../stage';
import {jevOf, panels, verdict} from '../timeline.mjs';
import type {FilmProps, System} from '../types';

/* Beat 5 — what the speed costs. Nine targets, one arrow each: the closer to the
   bullseye, the higher the accuracy on the test split. The 95% interval is the spread of
   the cluster — two paler arrows at the interval's ends around the solid one at the point
   estimate — so the uncertainty is visible as an image rather than a whisker.

   The flight is a spring (an object). Where the arrow LANDS is linear in the number. */

type Shot = {sys: System; color: string; isJev: boolean};

const Arrow: React.FC<{r: number; angle: number; color: string; scale: number; dim?: boolean}> = ({
  r,
  angle,
  color,
  scale,
  dim,
}) => {
  const rad = (angle * Math.PI) / 180;
  const tipX = Math.cos(rad) * r;
  const tipY = Math.sin(rad) * r;
  const len = 52 * scale;
  const tailX = Math.cos(rad) * (r + len);
  const tailY = Math.sin(rad) * (r + len);
  return (
    <g opacity={dim ? 0.42 : 1}>
      <line
        x1={tailX}
        y1={tailY}
        x2={tipX}
        y2={tipY}
        stroke={color}
        strokeWidth={dim ? 2.4 * scale : 4 * scale}
        strokeLinecap="round"
      />
      <circle cx={tipX} cy={tipY} r={(dim ? 3.6 : 5.6) * scale} fill={color} />
      <line
        x1={tailX}
        y1={tailY}
        x2={tailX + Math.cos(rad + 2.5) * 13 * scale}
        y2={tailY + Math.sin(rad + 2.5) * 13 * scale}
        stroke={color}
        strokeWidth={2 * scale}
        strokeLinecap="round"
      />
      <line
        x1={tailX}
        y1={tailY}
        x2={tailX + Math.cos(rad - 2.5) * 13 * scale}
        y2={tailY + Math.sin(rad - 2.5) * 13 * scale}
        stroke={color}
        strokeWidth={2 * scale}
        strokeLinecap="round"
      />
    </g>
  );
};

const Target: React.FC<{
  shot: Shot;
  index: number;
  delayFrames: number;
  lo: number;
  hi: number;
  u: number;
  size: number;
}> = ({shot, index, delayFrames, lo, hi, u, size}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const R = size / 2;
  const radiusFor = (acc: number) =>
    R * 0.9 * (1 - interpolate(acc, [lo, hi], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}));

  const a = shot.sys.accuracy;
  const fly = spring({frame: frame - delayFrames, fps, config: {damping: 15, stiffness: 120}});
  const ringIn = spring({frame: frame - index, fps, config: {damping: 200}, durationInFrames: 12});
  const box = size * 1.34;
  const start = R * 1.8;
  const angle = -128 + (index % 3) * 7;
  const rNow = (target: number) => interpolate(fly, [0, 1], [start, target]);
  const labelIn = interpolate(fly, [0.45, 1], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  const rings = [1, 0.72, 0.45, 0.2];
  const scale = size / 190;

  return (
    <div style={{display: 'flex', alignItems: 'center', gap: 6 * u}}>
      <svg width={box} height={box} viewBox={`${-box / 2} ${-box / 2} ${box} ${box}`}>
        <g opacity={ringIn}>
          {rings.map((f, i) => (
            <circle
              key={f}
              cx={0}
              cy={0}
              r={R * 0.92 * f}
              fill={i === rings.length - 1 ? `${shot.color}30` : 'none'}
              stroke={i === 0 ? `${shot.color}66` : 'rgba(255,255,255,0.14)'}
              strokeWidth={(i === 0 ? 2.2 : 1.5) * scale}
            />
          ))}
          <circle cx={0} cy={0} r={3.4 * scale} fill="rgba(255,255,255,0.5)" />
        </g>
        {fly > 0.02 ? (
          <>
            <Arrow r={rNow(radiusFor(a.ci_high))} angle={angle - 13} color={shot.color} scale={scale} dim />
            <Arrow r={rNow(radiusFor(a.ci_low))} angle={angle + 13} color={shot.color} scale={scale} dim />
            <Arrow r={rNow(radiusFor(a.point))} angle={angle} color={shot.color} scale={scale} />
          </>
        ) : null}
      </svg>
      <div style={{opacity: labelIn}}>
        <div
          style={{
            fontFamily: SANS,
            fontWeight: 700,
            fontSize: 25 * u,
            color: shot.isJev ? C.accent : C.ink,
            whiteSpace: 'nowrap',
            letterSpacing: '-0.015em',
          }}
        >
          {shot.sys.label}
        </div>
        <div
          style={{
            ...tabular,
            fontWeight: 800,
            fontSize: 44 * u,
            lineHeight: 1.05,
            color: shot.isJev ? C.accent : C.ink,
          }}
        >
          {pct(a.point)}
        </div>
        <div style={{...tabular, fontSize: 18 * u, color: C.ink3, whiteSpace: 'nowrap'}}>
          {pct(a.ci_low, 0)}–{pct(a.ci_high, 0)}
        </div>
      </div>
    </div>
  );
};

export const Targets: React.FC<FilmProps & {caption: string}> = ({data, layout, caption}) => {
  const frame = useCurrentFrame();
  const {fps, width, height, durationInFrames} = useVideoConfig();
  const u = height / 1080;
  const jev = jevOf(data) as System;
  const exit = ramp(frame, durationInFrames - 9, durationInFrames, EASE_OUT);
  const ps = panels(data, layout) as {sys: System; tier: number}[];
  const shots: Shot[] = [
    ...ps.map((p) => ({sys: p.sys, color: claudeColor(p.tier), isJev: false})),
    {sys: jev, color: C.accent, isJev: true},
  ];

  let lo = 1;
  let hi = 0;
  for (const s of shots) {
    lo = Math.min(lo, s.sys.accuracy.ci_low);
    hi = Math.max(hi, s.sys.accuracy.ci_high);
  }
  lo = Math.max(0, lo - 0.03);
  hi = Math.min(1, hi + 0.02);

  const size = layout === 'wide' ? 176 * u : 124 * u;
  const v = verdict(data);
  const headlineOut = interpolate(frame, [0, 6, 999999, 1000000], [0, 1, 1, 1]);

  // Jev's arrow lands last (§5 beat 5).
  const delayOf = (i: number) => Math.round((0.35 + i * 0.16) * fps);
  const verdictStart = durationInFrames - Math.round((layout === 'wide' ? 3.6 : 3.2) * fps);
  const words = v.lines.map((l: {head: string; tail: string; good: boolean}) => l);

  const camT = useCamera([
    {at: 0, zoom: 1.05, x: width / 2, y: height / 2 - 40 * u},
    {at: durationInFrames - 60, zoom: 1, x: width / 2, y: height / 2},
    {at: durationInFrames, zoom: 1.03, x: width / 2, y: height / 2 + 30 * u},
  ]);
  return (
    <AbsoluteFill style={{backgroundColor: C.bg, opacity: 1 - exit}}>
      <Ambient glow="rgba(120,120,160,0.13)" cam={camT} />
      <AbsoluteFill style={{transform: camT.transform, transformOrigin: '0 0'}}>
      <div
        style={{
          position: 'absolute',
          top: 58 * u,
          left: 0,
          right: 0,
          textAlign: 'center',
          ...upper(0.24),
          fontSize: 20 * u,
          color: C.ink3,
        }}
      >
        accuracy on the {data.meta.split} split · n={jev.n} per system · 95% interval
      </div>

      <div
        style={{
          position: 'absolute',
          top: 104 * u,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontFamily: SANS,
          fontWeight: 700,
          fontSize: 54 * u,
          letterSpacing: '-0.03em',
          color: C.ink,
          opacity:
            headlineOut *
            interpolate(frame, [verdictStart - 18, verdictStart], [1, 0], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
        }}
      >
        {caption}
      </div>

      <div
        style={{
          position: 'absolute',
          top: (layout === 'wide' ? 150 : 188) * u,
          left: 0,
          right: 0,
          display: 'grid',
          gridTemplateColumns: 'repeat(3, auto)',
          justifyContent: 'center',
          justifyItems: 'start',
          columnGap: layout === 'wide' ? 96 * u : 18 * u,
          rowGap: (layout === 'wide' ? 10 : 18) * u,
        }}
      >
        {shots.map((s, i) => (
          <Target
            key={s.sys.system}
            shot={s}
            index={i}
            delayFrames={delayOf(i)}
            lo={lo}
            hi={hi}
            u={u}
            size={size}
          />
        ))}
      </div>

      <VerdictBlock verdict={v} startFrame={verdictStart} u={u} width={width} />
      </AbsoluteFill>
      <StageWatermark data={data} />
    </AbsoluteFill>
  );
};

/* The verdict, typed one word at a time, straight out of data.json. It has to read
   correctly whether Jev clears a tier or not — both fixtures exercise this. */
const VerdictBlock: React.FC<{
  verdict: ReturnType<typeof verdict>;
  startFrame: number;
  u: number;
  width: number;
}> = ({verdict: v, startFrame, u, width}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame - startFrame;
  if (t < 0) return null;

  const pieces: {text: string; big: boolean; color: string}[] = [];
  v.lines.forEach((l: {head: string; tail: string; good: boolean}) => {
    pieces.push({text: 'Jev is ' + l.head, big: true, color: l.good ? C.ink : C.ink});
    pieces.push({text: '(' + l.tail + ')', big: false, color: C.ink3});
  });

  const allWords = pieces.flatMap((p, li) => p.text.split(' ').map((w) => ({w, li})));
  const perWord = 3.2;
  const shown = Math.floor(t / perWord);

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 54 * u,
        textAlign: 'center',
        padding: `0 ${60 * u}px`,
      }}
    >
      {[0, 1].map((row) => {
        const head = pieces[row * 2];
        const tail = pieces[row * 2 + 1];
        if (!head) return null;
        const before = allWords.filter((x) => x.li < row * 2).length;
        const headWords = head.text.split(' ');
        const tailWords = tail ? tail.text.split(' ') : [];
        return (
          <div
            key={row}
            style={{
              display: 'flex',
              gap: 14 * u,
              alignItems: 'baseline',
              justifyContent: 'center',
              marginBottom: 6 * u,
            }}
          >
            <span
              style={{
                fontFamily: SANS,
                fontWeight: 700,
                fontSize: 46 * u,
                letterSpacing: '-0.03em',
                color: C.ink,
              }}
            >
              {headWords.map((w, i) => {
                const idx = before + i;
                const on = shown >= idx;
                const pop = spring({
                  frame: frame - startFrame - idx * perWord,
                  fps,
                  config: {damping: 16, stiffness: 220},
                });
                return (
                  <span
                    key={i}
                    style={{
                      display: 'inline-block',
                      opacity: on ? 1 : 0,
                      transform: `translateY(${interpolate(on ? pop : 0, [0, 1], [16, 0])}px)`,
                      marginRight: '0.28em',
                    }}
                  >
                    {w}
                  </span>
                );
              })}
            </span>
            <span
              style={{
                ...upper(0.16),
                fontSize: 22 * u,
                color: C.ink3,
                opacity: shown >= before + headWords.length + tailWords.length - 1 ? 1 : 0,
              }}
            >
              {tail?.text}
            </span>
          </div>
        );
      })}
      {v.weakest ? (
        <div
          style={{
            marginTop: 14 * u,
            fontFamily: SANS,
            fontWeight: 600,
            fontSize: 27 * u,
            color: C.ink2,
            opacity: interpolate(t, [allWords.length * perWord, allWords.length * perWord + 10], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
              easing: Easing.out(Easing.quad),
            }),
          }}
        >
          Weakest slice: {v.weakest}.
        </div>
      ) : null}
    </div>
  );
};
