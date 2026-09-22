import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {Typed} from '../chrome';
import {C, MONO, SANS, claudeColor, tabular, upper} from '../theme';
import {Ambient, EASE_OUT, POP, SNAP, StageWatermark, Timer, clamp01, ramp, useCamera} from '../stage';
import {panels} from '../timeline.mjs';
import type {FilmProps, System} from '../types';

/* ANIMATION-PLAN.md §5e — Justin's quadrant design, and the opening of the film.
 *
 *   top-left    the text Jev is judging          top-right    Jev's decision
 *   bottom-left the text Claude is judging       bottom-right Claude's, token by token
 *
 * Both rows start on the same case. The top row advances the instant Jev's decision
 * lands; the bottom row advances when Claude finishes typing, and each time it does
 * the next Claude model takes over, so all eight appear while Jev churns through
 * many texts. Every text is a real case, every decision the verbatim structured
 * output, every duration the measured one. Two counters and the stopwatch are the
 * only numbers on screen. */

type Seq = {
  id: string;
  text: string | null;
  gold: string | null;
  systems: Record<
    string,
    {
      decision: string | null;
      p: number | null;
      output_text: string;
      output_tokens: number;
      thinking_tokens: number;
      duration_api_ms: number | null;
      thinking_ms_est: number | null;
    }
  >;
};

/** Walk the sequence at one system's own measured durations. */
function walk(seq: Seq[], sid: string, elapsedMs: number, loop = true) {
  if (seq.length === 0) return {index: 0, startedMs: 0, doneCount: 0, entry: null as Seq | null};
  let t = 0;
  let done = 0;
  for (let i = 0; i < seq.length * (loop ? 40 : 1); i++) {
    const c = seq[i % seq.length];
    const d = c.systems[sid]?.duration_api_ms ?? 0;
    if (elapsedMs < t + d) {
      return {index: i % seq.length, startedMs: t, doneCount: done, entry: c};
    }
    t += d;
    done += 1;
  }
  const last = seq.length - 1;
  return {index: last, startedMs: t, doneCount: done, entry: seq[last]};
}

const Panel: React.FC<{
  label: string;
  accent?: string;
  children: React.ReactNode;
  u: number;
  h: number;
  flash?: number;
}> = ({label, accent, children, u, h, flash = 0}) => (
  <div
    style={{
      position: 'relative',
      height: h,
      borderRadius: 18 * u,
      background: 'rgba(255,255,255,0.032)',
      border: `${flash > 0 ? 2.5 * u : 1}px solid ${
        flash > 0 ? accent ?? C.hair : 'rgba(255,255,255,0.09)'
      }`,
      boxShadow: flash > 0 ? `0 0 ${40 * u}px ${accent}33` : 'none',
      padding: `${18 * u}px ${22 * u}px`,
      overflow: 'hidden',
    }}
  >
    <div style={{...upper(0.18), fontSize: 16 * u, color: C.ink3, marginBottom: 12 * u}}>{label}</div>
    {children}
  </div>
);

export const Quadrants: React.FC<FilmProps> = ({data, layout}) => {
  const frame = useCurrentFrame();
  const {fps, width, height, durationInFrames} = useVideoConfig();
  const u = height / 1080;
  const wide = layout === 'wide';
  const seq = ((data as unknown as {sequence: Seq[]}).sequence || []).filter((c) => c.text);
  const ps = panels(data, layout) as {sys: System; tier: number}[];
  const elapsed = (frame / fps) * 1000;

  const jev = walk(seq, 'jev', elapsed);

  /* The bottom row: one case per model, in tier order, each at its own duration. */
  let t = 0;
  let mi = 0;
  let ci = 0;
  let startedMs = 0;
  let botDone = 0;
  for (let k = 0; k < ps.length * 4; k++) {
    const model = ps[k % ps.length];
    const c = seq[k % seq.length];
    const d = c?.systems[model.sys.system]?.duration_api_ms ?? 0;
    if (elapsed < t + d) {
      mi = k % ps.length;
      ci = k % seq.length;
      startedMs = t;
      botDone = k;
      break;
    }
    t += d;
    mi = k % ps.length;
    ci = k % seq.length;
    startedMs = t;
    botDone = k + 1;
  }
  const model = ps[mi];
  const botCase = seq[ci];
  const botEntry = botCase?.systems[model.sys.system];
  const botMs = elapsed - startedMs;
  const thinkMs = botEntry?.thinking_ms_est ?? 0;
  const typeMs = Math.max(1, (botEntry?.duration_api_ms ?? 1) - thinkMs);
  const thinking = botMs < thinkMs;
  const typed = clamp01((botMs - thinkMs) / typeMs); // linear: its own measured rate
  const thinkTokens = Math.floor(
    interpolate(botMs, [0, Math.max(1, thinkMs)], [0, botEntry?.thinking_tokens ?? 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }),
  );

  const jevMs = elapsed - jev.startedMs;
  // the last case Jev actually finished — the panel is never empty, and it changes
  // every time a decision lands
  const shownIdx = jev.doneCount > 0 ? (jev.index - 1 + seq.length) % seq.length : jev.index;
  const shown = seq[shownIdx];
  const jevEntry = shown?.systems.jev;
  const jevFlash = Math.max(0, 1 - (jevMs / 1000) * fps / 5);
  const pBar = jev.doneCount > 0 ? jevEntry?.p ?? 0 : 0;
  const jevDone = jev.doneCount > 0;
  const sinceJev = (jevMs / 1000) * fps;

  const pad = (wide ? 76 : 52) * u;
  const contentW = width - pad * 2;
  const gap = 22 * u;
  const colW = (contentW - gap) / 2;
  const top = 200 * u;
  const rowH = (wide ? 292 : 320) * u;
  const enter = ramp(frame, 0, 7, EASE_OUT);
  const cam = useCamera([
    {at: 0, zoom: 1.03, x: width / 2, y: height / 2},
    {at: durationInFrames, zoom: 1, x: width / 2, y: height / 2},
  ]);

  const textStyle = {
    fontFamily: SANS,
    fontWeight: 500,
    fontSize: (wide ? 30 : 29) * u,
    lineHeight: 1.36,
    color: C.ink,
  } as React.CSSProperties;

  return (
    <AbsoluteFill style={{backgroundColor: C.bg, opacity: enter}}>
      <Ambient glow="rgba(64,104,180,0.16)" cam={cam} />

      <div style={{position: 'absolute', top: 48 * u, left: pad}}>
        <div style={{fontFamily: SANS, fontWeight: 700, fontSize: 34 * u, color: C.ink, letterSpacing: '-0.02em'}}>
          One decision. Is this a prompt injection?
        </div>
      </div>

      <div style={{position: 'absolute', top, left: pad, width: contentW}}>
        {/* ---- top row: Jev ------------------------------------------------ */}
        <div style={{display: 'flex', gap, marginBottom: 22 * u}}>
          <div style={{width: colW}}>
            <Panel label="the text" u={u} h={rowH}>
              <div style={textStyle} key={jev.index}>
                {jev.entry?.text}
              </div>
            </Panel>
          </div>
          <div style={{width: colW}}>
            <Panel label="Jev 1.13" accent={C.accent} u={u} h={rowH} flash={jevFlash}>
              <div style={{display: 'flex', flexDirection: 'column', height: '100%'}}>
                <div
                  style={{
                    fontFamily: SANS,
                    fontWeight: 700,
                    fontSize: (wide ? 62 : 58) * u,
                    letterSpacing: '-0.03em',
                    color: jevDone ? C.accent : C.ink3,
                    lineHeight: 1.05,
                    transform: `scale(${
                      jevDone ? interpolate(clamp01(sinceJev / 6), [0, 1], [1.16, 1]) : 1
                    })`,
                    transformOrigin: 'left center',
                  }}
                >
                  {jevDone ? (jevEntry?.decision || '').toUpperCase() : '· · ·'}
                </div>
                <div style={{marginTop: 22 * u, display: 'flex', alignItems: 'center', gap: 16 * u}}>
                  <div
                    style={{
                      flex: 1,
                      height: 16 * u,
                      borderRadius: 999,
                      background: 'rgba(255,255,255,0.10)',
                      overflow: 'hidden',
                    }}
                  >
                    {/* the probability it returned, no easing */}
                    <div style={{width: `${pBar * 100}%`, height: '100%', background: C.accent}} />
                  </div>
                  <span style={{...tabular, fontWeight: 800, fontSize: 38 * u, color: C.ink}}>
                    {Math.round(pBar * 100)}%
                  </span>
                </div>
                <div style={{marginTop: 'auto', display: 'flex', justifyContent: 'space-between'}}>
                  <span style={{...upper(0.16), fontSize: 15 * u, color: C.ink3}}>decisions</span>
                  <span style={{...tabular, fontWeight: 800, fontSize: 34 * u, color: C.accent}}>
                    {jev.doneCount}
                  </span>
                </div>
              </div>
            </Panel>
          </div>
        </div>

        {/* ---- bottom row: one Claude model at a time ---------------------- */}
        <div style={{display: 'flex', gap}}>
          <div style={{width: colW}}>
            <Panel label="the text" u={u} h={rowH}>
              <div style={textStyle} key={ci}>
                {botCase?.text}
              </div>
            </Panel>
          </div>
          <div style={{width: colW}}>
            <Panel label={model?.sys.label ?? ''} accent={claudeColor(model?.tier ?? 0)} u={u} h={rowH}>
              <div style={{display: 'flex', flexDirection: 'column', height: '100%'}}>
                {thinking ? (
                  <div style={{display: 'flex', alignItems: 'center', gap: 14 * u, marginTop: 10 * u}}>
                    <div
                      style={{
                        flex: 1,
                        height: 12 * u,
                        borderRadius: 999,
                        overflow: 'hidden',
                        background: 'rgba(255,255,255,0.07)',
                      }}
                    >
                      <div
                        style={{
                          width: '36%',
                          height: '100%',
                          borderRadius: 999,
                          background: `linear-gradient(90deg, transparent, ${claudeColor(
                            model?.tier ?? 0,
                          )}, transparent)`,
                          transform: `translateX(${interpolate((frame % 40) / 40, [0, 1], [-100, 280])}%)`,
                        }}
                      />
                    </div>
                    <span style={{...tabular, fontSize: 24 * u, color: C.ink2, whiteSpace: 'nowrap'}}>
                      {thinkTokens} thinking
                    </span>
                  </div>
                ) : (
                  <Typed
                    text={botEntry?.output_text ?? ''}
                    progress={typed}
                    caretColor={claudeColor(model?.tier ?? 0)}
                    style={{
                      fontFamily: MONO,
                      fontWeight: 500,
                      fontSize: (wide ? 25 : 24) * u,
                      lineHeight: 1.45,
                      color: C.ink,
                      wordBreak: 'break-word',
                      display: 'block',
                    }}
                  />
                )}
                <div style={{marginTop: 'auto', display: 'flex', justifyContent: 'space-between'}}>
                  <span style={{...upper(0.16), fontSize: 15 * u, color: C.ink3}}>decisions</span>
                  <span
                    style={{
                      ...tabular,
                      fontWeight: 800,
                      fontSize: 34 * u,
                      color: claudeColor(model?.tier ?? 0),
                    }}
                  >
                    {botDone}
                  </span>
                </div>
              </div>
            </Panel>
          </div>
        </div>
      </div>

      <Timer ms={elapsed} progress={clamp01(frame / durationInFrames)} u={u} label="elapsed" />

      <div
        style={{
          position: 'absolute',
          left: pad,
          right: pad,
          bottom: 26 * u,
          ...upper(0.14),
          fontSize: 17 * u,
          color: C.ink3,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        * real time · real test cases · each answer is what that model returned
      </div>

      <StageWatermark data={data} />
    </AbsoluteFill>
  );
};
