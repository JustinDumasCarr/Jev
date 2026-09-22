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
      correct?: boolean | null;
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

/** Every decision one row has completed, in order, with its correctness. */
type Brick = {correct: boolean; saidPositive: boolean; goldPositive: boolean; atMs: number; divider?: boolean};

function jevRun(seq: Seq[], elapsedMs: number): Brick[] {
  const out: Brick[] = [];
  let t = 0;
  for (let i = 0; i < seq.length * 40; i++) {
    const c = seq[i % seq.length];
    const e = c.systems.jev;
    const d = e?.duration_api_ms ?? 0;
    if (elapsedMs < t + d) break;
    t += d;
    out.push({
      correct: e?.correct !== false,
      saidPositive: e?.decision === 'injection',
      goldPositive: c.gold === 'injection',
      atMs: t,
    });
  }
  return out;
}

function claudeRun(seq: Seq[], ps: {sys: System}[], elapsedMs: number): Brick[] {
  const out: Brick[] = [];
  let t = 0;
  let lastModel = -1;
  for (let k = 0; k < ps.length * 4; k++) {
    const sid = ps[k % ps.length].sys.system;
    const c = seq[k % seq.length];
    const e = c?.systems[sid];
    const d = e?.duration_api_ms ?? 0;
    if (elapsedMs < t + d) break;
    t += d;
    if (k % ps.length !== lastModel && k > 0) {
      out.push({correct: true, saidPositive: false, goldPositive: false, atMs: t, divider: true});
    }
    lastModel = k % ps.length;
    out.push({
      correct: e?.correct !== false,
      saidPositive: e?.decision === 'injection',
      goldPositive: c.gold === 'injection',
      atMs: t,
    });
  }
  return out;
}

const scored = (b: Brick[]) => b.filter((x) => !x.divider);
const pctCorrect = (b: Brick[]) => {
  const s = scored(b);
  return s.length ? s.filter((x) => x.correct).length / s.length : 0;
};
const precision = (b: Brick[]) => {
  const said = scored(b).filter((x) => x.saidPositive);
  return said.length ? said.filter((x) => x.goldPositive).length / said.length : null;
};

/** One brick per decision, stacked upward, coloured by correctness. */
const Tower: React.FC<{
  bricks: Brick[];
  accent: string;
  brickH: number;
  h: number;
  w: number;
  u: number;
}> = ({bricks, accent, brickH, h, w, u}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const gap = Math.min(1.2 * u, brickH * 0.22);

  // One column, always. The brick height was scaled once at beat start from the
  // largest count the beat will reach, so the tallest tower ends near the top and
  // every other tower is proportionally short at exactly the same brick size.
  return (
    <div style={{position: 'relative', width: w, height: h}}>
      {/* the track: how far this tower could go */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 4 * u,
          background: 'rgba(255,255,255,0.035)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      />
      {bricks.map((b, i) => {
        const last = i === bricks.length - 1;
        const bh = b.divider ? Math.max(1.2 * u, brickH * 0.5) : brickH;
        // each brick settles from its own landing frame, not on a shared pulse
        const sinceLand = frame - (b.atMs / 1000) * fps;
        const settle = spring({frame: sinceLand, fps, config: {damping: 14, stiffness: 320}});

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: b.divider ? w * 0.22 : 2 * u,
              width: w - (b.divider ? w * 0.44 : 4 * u),
              bottom: 2 * u + i * (brickH + gap),
              height: Math.max(1.1, bh - gap),
              borderRadius: Math.min(2 * u, brickH * 0.3),
              background: b.divider
                ? 'rgba(255,255,255,0.32)'
                : b.correct
                  ? C.good
                  : C.wrong,
              // the secondary cue: a miss carries a lighter edge, a hit is solid
              boxShadow: b.divider || b.correct ? 'none' : `inset 0 0 0 ${Math.max(0.8, brickH * 0.18)}px ${C.wrongEdge}`,
              transform:
                sinceLand < 10 && !b.divider
                  ? `translateY(${(1 - Math.min(settle, 1)) * 8 * u}px)`
                  : 'none',
              opacity: sinceLand < 10 ? Math.min(1, Math.max(0, sinceLand) / 2) : 1,
            }}
          />
        );
      })}
    </div>
  );
};

/** The two possible answers, the chosen one lit. */
const Choice: React.FC<{
  chosen: string | null;
  p: number | null;
  accent: string;
  u: number;
  big: number;
}> = ({chosen, p, accent, u, big}) => (
  <div style={{display: 'flex', flexDirection: 'column', gap: 12 * u}}>
    {['benign', 'injection'].map((opt) => {
      const on = chosen === opt;
      const prob = on ? p ?? 0 : null;
      return (
        <div
          key={opt}
          style={{
            borderRadius: 12 * u,
            border: `${on ? 2.5 * u : 1}px solid ${on ? accent : 'rgba(255,255,255,0.10)'}`,
            background: on ? `${accent}1f` : 'transparent',
            padding: `${11 * u}px ${14 * u}px`,
          }}
        >
          <div style={{display: 'flex', alignItems: 'baseline', gap: 10 * u}}>
            <span
              style={{
                fontFamily: SANS,
                fontWeight: 700,
                fontSize: big,
                letterSpacing: '-0.02em',
                color: on ? accent : C.ink3,
                textTransform: 'uppercase',
              }}
            >
              {opt}
            </span>
            <span
              style={{
                ...tabular,
                fontWeight: 800,
                fontSize: big * 0.6,
                color: on ? C.ink : 'transparent',
                marginLeft: 'auto',
              }}
            >
              {on ? Math.round((prob ?? 0) * 100) + '%' : ''}
            </span>
          </div>
          {on ? (
            <div
              style={{
                marginTop: 9 * u,
                height: 9 * u,
                borderRadius: 999,
                background: 'rgba(255,255,255,0.10)',
                overflow: 'hidden',
              }}
            >
              {/* the probability it returned, linear */}
              <div style={{width: `${(prob ?? 0) * 100}%`, height: '100%', background: accent}} />
            </div>
          ) : null}
        </div>
      );
    })}
  </div>
);

const Readout: React.FC<{bricks: Brick[]; color: string; u: number}> = ({bricks, color, u}) => {
  const n = scored(bricks).length;
  const pr = precision(bricks);
  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 14 * u, whiteSpace: 'nowrap'}}>
      {[
        ['decisions', String(n), color],
        ['correct', n ? Math.round(pctCorrect(bricks) * 100) + '%' : '—', C.ink],
        ['precision', pr == null ? '—' : Math.round(pr * 100) + '%', C.ink],
      ].map(([k, v, col]) => (
        <div key={k}>
          <div style={{...upper(0.16), fontSize: 14 * u, color: C.ink3}}>{k}</div>
          <div style={{...tabular, fontWeight: 800, fontSize: 32 * u, color: col as string}}>{v}</div>
        </div>
      ))}
    </div>
  );
};

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
  /* The text and the decision on a row must belong to the same case, on every
     frame. So the pair on screen is the case Jev has just finished: its text on
     the left, its decision on the right, held for that call's own duration, and
     both advance together. At about 100 ms a call that is three frames and it
     blurs — the blur IS the speed, and every frame of it is true. */
  const jevDone = jev.doneCount > 0;
  const pairIdx = jevDone ? (jev.index - 1 + seq.length) % seq.length : jev.index;
  const pair = seq[pairIdx];
  const jevEntry = pair?.systems.jev;
  const pBar = jevDone ? jevEntry?.p ?? 0 : 0;
  const sinceJev = (jevMs / 1000) * fps;

  const jevBricks = jevRun(seq, elapsed);
  const claudeBricks = claudeRun(seq, ps, elapsed);
  // One brick height for both towers, computed once from what the beat will hold
  // at its end, so nothing ever rescales mid-beat.
  const endMs = (durationInFrames / fps) * 1000;
  const maxBricks = Math.max(
    jevRun(seq, endMs).length,
    claudeRun(seq, ps, endMs).length,
    1,
  );

  const pad = (wide ? 76 : 52) * u;
  const contentW = width - pad * 2;
  const gap = 22 * u;
  const colW = (contentW - gap) / 2;
  const top = 200 * u;
  const rowH = (wide ? 292 : 320) * u;
  const towerH = rowH - (wide ? 78 : 82) * u;
  // 2 : 1 : 1 — options, tower, stats — with a hard gutter between each.
  const gutter = 20 * u;
  const inner = colW - 44 * u - gutter * 2;
  const optW = inner * 0.5;
  const towerW = inner * 0.25;
  const statW = inner * 0.25;
  const brickH = (towerH - 4 * u) / maxBricks;
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
              <div style={textStyle} key={pairIdx}>
                {pair?.text}
              </div>
            </Panel>
          </div>
          <div style={{width: colW}}>
            <Panel label="Jev 1.13" accent={C.accent} u={u} h={rowH}>
              <div style={{display: 'flex', gap: gutter, height: '100%'}}>
                <div style={{width: optW, minWidth: 0, overflow: 'hidden'}}>
                  <Choice
                    chosen={jevDone ? jevEntry?.decision ?? null : null}
                    p={jevEntry?.p ?? null}
                    accent={C.accent}
                    u={u}
                    big={(wide ? 28 : 25) * u}
                  />
                </div>
                <Tower bricks={jevBricks} accent={C.accent} brickH={brickH} h={towerH} w={towerW} u={u} />
                <div style={{width: statW, minWidth: 0}}>
                  <Readout bricks={jevBricks} color={C.accent} u={u} />
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
              <div style={{display: 'flex', gap: gutter, height: '100%'}}>
                <div style={{width: optW, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column'}}>
                  {thinking ? (
                    <div style={{display: 'flex', alignItems: 'center', gap: 12 * u, marginTop: 6 * u}}>
                      <div
                        style={{
                          flex: 1,
                          height: 11 * u,
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
                      <span style={{...tabular, fontSize: 21 * u, color: C.ink2, whiteSpace: 'nowrap'}}>
                        {thinkTokens} thinking
                      </span>
                    </div>
                  ) : (
                    <Choice
                      chosen={typed >= 1 ? botEntry?.decision ?? null : null}
                      p={botEntry?.p ?? null}
                      accent={claudeColor(model?.tier ?? 0)}
                      u={u}
                      big={(wide ? 28 : 25) * u}
                    />
                  )}
                  {!thinking ? (
                    <div
                      style={{
                        marginTop: 'auto',
                        ...tabular,
                        fontSize: 18 * u,
                        color: C.ink3,
                        overflow: 'hidden',
                        maxHeight: 62 * u,
                      }}
                    >
                      <Typed
                        text={botEntry?.output_text ?? ''}
                        progress={typed}
                        caretColor={claudeColor(model?.tier ?? 0)}
                        style={{fontFamily: MONO, fontSize: 18 * u, lineHeight: 1.4, display: 'block'}}
                      />
                    </div>
                  ) : null}
                </div>
                <Tower
                  bricks={claudeBricks}
                  accent={claudeColor(model?.tier ?? 0)}
                  brickH={brickH}
                  h={towerH}
                  w={towerW}
                  u={u}
                />
                <div style={{width: statW, minWidth: 0}}>
                  <Readout bricks={claudeBricks} color={claudeColor(model?.tier ?? 0)} u={u} />
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
