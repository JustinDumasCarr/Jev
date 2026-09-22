import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {Tag} from '../chrome';
import {C, SANS, claudeColor, money, pct, shortLatency, tabular, upper} from '../theme';
import {Ambient, EASE_OUT, SNAP, StageWatermark, ramp, useCamera} from '../stage';
import {jevOf, panels, verdict} from '../timeline.mjs';
import type {FilmProps, System} from '../types';

/* Beat 6 — the end card, and the poster frame. Three enormous numbers for Jev, the
   verdict, the capped models behind it, and one provenance line. */

const Big: React.FC<{value: string; label: string; sub?: string; u: number; delay: number}> = ({
  value,
  label,
  sub,
  u,
  delay,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame: frame - delay, fps, config: {damping: 16, stiffness: 170}});
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6 * u,
        opacity: s,
        transform: `translateY(${interpolate(s, [0, 1], [30, 0])}px)`,
      }}
    >
      <div
        style={{
          ...tabular,
          fontWeight: 800,
          fontSize: 92 * u,
          lineHeight: 1,
          color: C.accent,
          letterSpacing: '-0.04em',
        }}
      >
        {value}
      </div>
      <div style={{...upper(0.22), fontSize: 17 * u, color: C.ink2}}>{label}</div>
      {sub ? <div style={{...tabular, fontSize: 19 * u, color: C.ink3}}>{sub}</div> : null}
    </div>
  );
};

export const EndCard: React.FC<FilmProps> = ({data, layout}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const u = height / 1080;
  const jev = jevOf(data) as System;
  const ps = panels(data, layout) as {sys: System; tier: number}[];
  const v = verdict(data);
  const m = data.meta;

  const camE = useCamera([
    {at: 0, zoom: 1.08, x: width / 2, y: height / 2},
    {at: 40, zoom: 1, x: width / 2, y: height / 2},
    {at: 400, zoom: 1.015, x: width / 2, y: height / 2},
  ]);
  const titleIn = spring({frame, fps, config: SNAP, durationInFrames: 12});
  const chipsIn = spring({frame: frame - 3, fps, config: SNAP, durationInFrames: 14});

  const enter = ramp(frame, 0, 10, EASE_OUT);
  return (
    <AbsoluteFill style={{backgroundColor: C.bg, opacity: enter}}>
      <Ambient glow="rgba(255,106,43,0.2)" cam={camE} />
      <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', transform: camE.transform, transformOrigin: '0 0'}}>
      {/* the models that answered, behind everything */}
      <div
        style={{
          position: 'absolute',
          top: 118 * u,
          left: 0,
          right: 0,
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: 10 * u,
          padding: `0 ${layout === 'wide' ? 340 * u : 70 * u}px`,
          opacity: chipsIn * 0.85,
        }}
      >
        {ps.map((p) => (
          <div
            key={p.sys.system}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10 * u,
              border: `1px solid ${claudeColor(p.tier)}55`,
              borderRadius: 10 * u,
              padding: `${8 * u}px ${14 * u}px`,
            }}
          >
            <span style={{fontFamily: SANS, fontWeight: 600, fontSize: 21 * u, color: claudeColor(p.tier)}}>
              {p.sys.label}
            </span>
            <span style={{...tabular, fontSize: 20 * u, color: C.ink3}}>
              {shortLatency(p.sys.latency_ms.p50)}
            </span>
          </div>
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 34 * u,
          transform: `translateY(${28 * u}px)`,
        }}
      >
        <div style={{display: 'flex', alignItems: 'center', gap: 14 * u, opacity: titleIn}}>
          <span
            style={{
              fontFamily: SANS,
              fontWeight: 700,
              fontSize: 56 * u,
              color: C.ink,
              letterSpacing: '-0.03em',
            }}
          >
            {jev.label}
          </span>
          <Tag size={15 * u} color={C.accent}>
            via OpenRouter
          </Tag>
        </div>

        <div style={{display: 'flex', gap: layout === 'wide' ? 130 * u : 46 * u}}>
          <Big value={shortLatency(jev.latency_ms.p50)} label="per decision" sub="p50" u={u} delay={4} />
          <Big
            value={money(jev.cost_per_1000_usd)}
            label="per 1,000"
            sub="real charge"
            u={u}
            delay={9}
          />
          <Big
            value={pct(jev.accuracy.point)}
            label="accuracy"
            sub={`${pct(jev.accuracy.ci_low, 0)}–${pct(jev.accuracy.ci_high, 0)}`}
            u={u}
            delay={14}
          />
        </div>

        <div
          style={{
            marginTop: 12 * u,
            textAlign: 'center',
            opacity: spring({frame: frame - 18, fps, config: {damping: 200}, durationInFrames: 14}),
          }}
        >
          {v.lines.map((l: {head: string; tail: string}, i: number) => (
            <div
              key={i}
              style={{
                fontFamily: SANS,
                fontWeight: 700,
                fontSize: 46 * u,
                letterSpacing: '-0.03em',
                color: C.ink,
                marginBottom: 2 * u,
              }}
            >
              Jev is {l.head}{' '}
              <span style={{...upper(0.14), fontSize: 20 * u, color: C.ink3}}>{l.tail}</span>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: 58 * u,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontFamily: SANS,
          fontWeight: 500,
          fontSize: 19 * u,
          color: C.ink3,
          lineHeight: 1.5,
          padding: `0 ${60 * u}px`,
        }}
      >
        {m.task_label} · {m.filter} · {m.split} split · n={jev.n} per system · {m.run_date} · git{' '}
        {m.git_sha}
        <br />
        Claude latency via Claude Code (duration_api_ms, effort low, thinking off); Jev via OpenRouter.
        Claude cost is notional list price; Jev's is the real charge. Non-inferiority margin{' '}
        {v.marginPts} points, fixed before any data.
      </div>
      </AbsoluteFill>
      <StageWatermark data={data} />
    </AbsoluteFill>
  );
};
