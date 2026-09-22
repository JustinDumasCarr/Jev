import React from 'react';
import {AbsoluteFill, interpolate, random, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, SANS, tabular} from '../../theme';
import type {FilmProps} from '../../types';
import type {Racer} from '../shared';
import {RACE_AT, TOTAL_FRAMES, raceAt, useV2Race} from './race';
import {
  Ambient,
  Camera,
  EASE_OUT,
  FootNote,
  IMPACT,
  POP,
  SNAP,
  StageWatermark,
  Timer,
  TitleBlock,
  clamp01,
  ramp,
  wobble,
  useCamera,
} from '../../stage';

/* P3 v2 — glasses filling.
 *
 * Linear, always: the liquid level (elapsed time over the shared cap).
 * Everything else is craft — the glasses drop in with anticipation and a
 * squash on landing, a stream forms from a stretching droplet, thins as the
 * glass fills and cuts with a last drop, the surface sloshes when the pour
 * stops, a lid lifts before it falls and bounces, and the camera pushes into
 * Jev's glass the instant it caps, then pulls back onto eight that are still
 * pouring. */

const Glass: React.FC<{
  r: Racer;
  i: number;
  x: number;
  w: number;
  top: number;
  h: number;
  elapsed: number;
  slowest: number;
  capFrame: number;
  enterAt: number;
  u: number;
}> = ({r, i, x, w, top, h, elapsed, slowest, capFrame, enterAt, u}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  /* -------- entrance: drop in, land with a squash ------------------- */
  const enter = spring({frame: frame - enterAt, fps, config: SNAP, durationInFrames: 26});
  const landed = frame - enterAt - 16;
  const squashY = 1 + wobble(landed, 7, 9) * 0.07; // follow-through on landing
  const dropY = interpolate(enter, [0, 1], [-190 * u, 0]);

  /* -------- the measurement ---------------------------------------- */
  const frac = clamp01(Math.min(elapsed, r.ms) / slowest); // strictly linear
  const level = frac * h;
  const done = elapsed >= r.ms;
  const since = frame - capFrame;

  const bottom = top + h;
  const surfaceY = bottom - level;
  const bw = w * 0.9;
  const bx = x + (w - bw) / 2;
  const body = `M ${x} ${top} L ${bx} ${bottom - 14 * u} Q ${bx} ${bottom} ${bx + 14 * u} ${bottom} L ${
    bx + bw - 14 * u
  } ${bottom} Q ${bx + bw} ${bottom} ${bx + bw} ${bottom - 14 * u} L ${x + w} ${top} Z`;
  const cid = `c3-${r.sys.system}`;

  /* -------- pour: anticipation, stream, thinning, cut --------------- */
  const pourStart = RACE_AT - 5; // the droplet stretches just before the clock starts
  const forming = ramp(frame, pourStart, RACE_AT + 2, EASE_OUT);
  const pouring = !done && frame >= pourStart;
  const streamW = interpolate(frac, [0, 1], [17 * u, 9 * u]); // thins as it fills
  const jitter = Math.sin(frame * 0.7 + i * 1.7) * 2.2 * u;

  /* -------- impact: splash, slosh, lid ------------------------------ */
  const splash = clamp01(1 - Math.max(0, frame - (RACE_AT + 1)) / 9);
  const slosh = done ? wobble(since, 8, 13) : 0;
  const lidS = done ? spring({frame: since, fps, config: IMPACT}) : 0;
  // anticipation: the lid lifts a touch before it drops
  const lidY = done
    ? interpolate(
        Math.min(lidS, 1),
        [0, 0.18, 1],
        [-64 * u, -78 * u, 0],
      )
    : 0;
  const lidSquash = done ? 1 + wobble(since - 6, 6, 7) * 0.22 : 1;
  const flash = done ? Math.max(0, 1 - since / 11) : 0;

  return (
    <g transform={`translate(0 ${dropY}) `} opacity={enter}>
      <g transform={`translate(${x + w / 2} ${bottom}) scale(1 ${squashY}) translate(${-(x + w / 2)} ${-bottom})`}>
        <defs>
          <clipPath id={cid}>
            <path d={body} />
          </clipPath>
          <linearGradient id={`lg-${cid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={r.color} stopOpacity={0.98} />
            <stop offset="55%" stopColor={r.color} stopOpacity={0.8} />
            <stop offset="100%" stopColor={r.color} stopOpacity={0.62} />
          </linearGradient>
          <radialGradient id={`fl-${cid}`}>
            <stop offset="0%" stopColor="#fff" stopOpacity={0.9} />
            <stop offset="100%" stopColor="#fff" stopOpacity={0} />
          </radialGradient>
        </defs>

        {/* the vessel */}
        <path d={body} fill="rgba(255,255,255,0.035)" />

        {/* the pour */}
        {pouring ? (
          <g opacity={forming}>
            {/* the falling column, wider at the spout and drawn out as it falls */}
            <path
              d={`M ${x + w / 2 - streamW / 2} ${top - 86 * u}
                  C ${x + w / 2 - streamW * 0.3 + jitter} ${top - 30 * u},
                    ${x + w / 2 - streamW * 0.22} ${top + 30 * u},
                    ${x + w / 2 - streamW * 0.3} ${surfaceY}
                  L ${x + w / 2 + streamW * 0.3} ${surfaceY}
                  C ${x + w / 2 + streamW * 0.22} ${top + 30 * u},
                    ${x + w / 2 + streamW * 0.3 + jitter} ${top - 30 * u},
                    ${x + w / 2 + streamW / 2} ${top - 86 * u} Z`}
              fill={r.color}
              opacity={0.9}
            />
            {/* a bead running down the column — secondary motion */}
            <circle
              cx={x + w / 2 + jitter * 0.4}
              cy={top - 86 * u + ((frame * 30 * u) % Math.max(1, 86 * u + (surfaceY - top)))}
              r={streamW * 0.3}
              fill="#fff"
              opacity={0.35}
            />
          </g>
        ) : null}

        {/* liquid */}
        <g clipPath={`url(#${cid})`}>
          <rect
            x={x - 8 * u}
            y={surfaceY + slosh * 5 * u}
            width={w + 16 * u}
            height={level + 14 * u}
            fill={`url(#lg-${cid})`}
          />
          {/* meniscus: rides the surface, tilts with the slosh */}
          {level > 1.5 * u ? (
            <g transform={`translate(${x + w / 2} ${surfaceY}) rotate(${slosh * 2.4}) translate(${-(x + w / 2)} ${-surfaceY})`}>
              <ellipse
                cx={x + w / 2}
                cy={surfaceY + slosh * 5 * u}
                rx={w * 0.54}
                ry={7 * u}
                fill="rgba(255,255,255,0.38)"
              />
              <ellipse
                cx={x + w / 2}
                cy={surfaceY + slosh * 5 * u + 3 * u}
                rx={w * 0.4}
                ry={3 * u}
                fill="rgba(255,255,255,0.18)"
              />
            </g>
          ) : null}
          {/* splash on first contact */}
          {splash > 0 && frame >= RACE_AT ? (
            <g opacity={splash}>
              {[0, 1, 2, 3, 4].map((k) => {
                const s = random(`sp-${r.sys.system}-${k}`);
                const t = 1 - splash;
                return (
                  <circle
                    key={k}
                    cx={x + w / 2 + (s - 0.5) * w * 1.5 * t}
                    cy={bottom - 6 * u - t * 40 * u * (0.4 + s)}
                    r={(2.6 + s * 2) * u * splash}
                    fill="#fff"
                    opacity={0.55}
                  />
                );
              })}
            </g>
          ) : null}
        </g>

        {/* glass: rim, specular highlight, and a light flash on close */}
        <path
          d={body}
          fill="none"
          stroke={r.isJev ? C.accent : 'rgba(255,255,255,0.3)'}
          strokeWidth={r.isJev ? 4.5 * u : 2.5 * u}
        />
        <path
          d={`M ${x + w * 0.15} ${top + 16 * u} L ${x + w * 0.235} ${bottom - 26 * u}`}
          stroke="rgba(255,255,255,0.24)"
          strokeWidth={5.5 * u}
          strokeLinecap="round"
        />
        {flash > 0 ? (
          <path d={body} fill="none" stroke="#fff" strokeWidth={6 * u * flash} opacity={flash * 0.85} />
        ) : null}

        {/* the lid: anticipation, drop, squash, bounce */}
        {done ? (
          <g
            transform={`translate(0 ${lidY}) translate(${x + w / 2} ${surfaceY}) scale(${
              1 / lidSquash
            } ${lidSquash}) translate(${-(x + w / 2)} ${-surfaceY})`}
            opacity={clamp01(lidS * 3)}
          >
            <rect x={x - 11 * u} y={surfaceY - 17 * u} width={w + 22 * u} height={15 * u} rx={6 * u} fill={r.color} />
            <rect x={x + w * 0.28} y={surfaceY - 28 * u} width={w * 0.44} height={12 * u} rx={5 * u} fill={r.color} />
            <rect
              x={x - 11 * u}
              y={surfaceY - 17 * u}
              width={w + 22 * u}
              height={3 * u}
              rx={2 * u}
              fill="rgba(255,255,255,0.5)"
            />
          </g>
        ) : null}

        {/* impact ring */}
        {done && since < 16 ? (
          <circle
            cx={x + w / 2}
            cy={surfaceY}
            r={interpolate(clamp01(since / 16), [0, 1], [w * 0.2, w * 1.9])}
            fill="none"
            stroke={r.color}
            strokeWidth={3.4 * u * (1 - clamp01(since / 16))}
            opacity={1 - clamp01(since / 16)}
          />
        ) : null}
      </g>
    </g>
  );
};

export const P3GlassesV2: React.FC<FilmProps> = ({data}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const u = height / 1080;
  const race = useV2Race(data);
  const {elapsed, progress} = raceAt(race, frame, fps);

  const top = 352 * u;
  const h = 430 * u;
  const slot = (width - 90 * u) / race.rs.length;
  const gw = slot * 0.78;
  const xOf = (i: number) => 45 * u + slot * i + (slot - gw) / 2;

  /* camera: hold wide, punch into Jev the moment it caps, pull back out */
  const jevCap = race.capFrame(race.jev);
  const jevX = xOf(0) + gw / 2;
  const jevY = top + h - 6 * u;
  const cam = useCamera([
    {at: 0, zoom: 1, x: width / 2, y: height / 2},
    {at: jevCap - 2, zoom: 1, x: width / 2, y: height / 2},
    {at: jevCap + 13, zoom: 2.05, x: jevX, y: jevY},
    {at: jevCap + 38, zoom: 2.05, x: jevX, y: jevY},
    {at: jevCap + 58, zoom: 1, x: width / 2, y: height / 2},
    {at: TOTAL_FRAMES - 30, zoom: 1, x: width / 2, y: height / 2},
    {at: TOTAL_FRAMES, zoom: 1.05, x: width / 2, y: height / 2 - 20 * u},
  ]);

  return (
    <AbsoluteFill style={{backgroundColor: C.bg}}>
      <Ambient glow="rgba(64,104,180,0.2)" cam={cam} />

      <Camera cam={cam}>
        <svg width={width} height={height} style={{position: 'absolute', inset: 0}}>
          {/* the bench the glasses stand on */}
          <rect x={26 * u} y={top + h} width={width - 52 * u} height={3 * u} rx={2 * u} fill="rgba(255,255,255,0.12)" />
          <rect x={26 * u} y={top + h + 3 * u} width={width - 52 * u} height={26 * u} fill="url(#bench)" />
          <defs>
            <linearGradient id="bench" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(255,255,255,0.07)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </linearGradient>
          </defs>

          {/* the rig the liquid pours from */}
          <g opacity={ramp(frame, 4, 22, EASE_OUT)}>
            <rect
              x={26 * u}
              y={top - 118 * u}
              width={width - 52 * u}
              height={16 * u}
              rx={8 * u}
              fill="rgba(255,255,255,0.10)"
            />
            <rect
              x={26 * u}
              y={top - 118 * u}
              width={width - 52 * u}
              height={3 * u}
              rx={2 * u}
              fill="rgba(255,255,255,0.22)"
            />
            {race.rs.map((r, i) => (
              <rect
                key={r.sys.system}
                x={xOf(i) + gw / 2 - 9 * u}
                y={top - 104 * u}
                width={18 * u}
                height={20 * u}
                rx={5 * u}
                fill={r.isJev ? C.accent : 'rgba(255,255,255,0.22)'}
              />
            ))}
          </g>

          {race.rs.map((r, i) => (
            <Glass
              key={r.sys.system}
              r={r}
              i={i}
              x={xOf(i)}
              w={gw}
              top={top}
              h={h}
              elapsed={elapsed}
              slowest={race.slowest}
              capFrame={race.capFrame(r)}
              enterAt={race.enterAt(i)}
              u={u}
            />
          ))}
        </svg>

        {/* labels and times live in the world, so the camera carries them */}
        {race.rs.map((r, i) => {
          const done = elapsed >= r.ms;
          const since = frame - race.capFrame(r);
          const labelIn = spring({
            frame: frame - race.enterAt(i) - 10,
            fps,
            config: SNAP,
            durationInFrames: 22,
          });
          const stamp = done ? spring({frame: since, fps, config: POP}) : 0;
          return (
            <div
              key={r.sys.system}
              style={{
                position: 'absolute',
                left: xOf(i) + gw / 2,
                top: top + h + 40 * u,
                transform: `translateX(-50%) translateY(${interpolate(labelIn, [0, 1], [18, 0])}px)`,
                textAlign: 'center',
                width: slot,
                opacity: labelIn,
              }}
            >
              <div
                style={{
                  fontFamily: SANS,
                  fontWeight: 700,
                  fontSize: 21 * u,
                  color: r.isJev ? C.accent : C.ink,
                  lineHeight: 1.12,
                  whiteSpace: 'nowrap',
                }}
              >
                {r.sys.label}
              </div>
              <div
                style={{
                  ...tabular,
                  fontWeight: 800,
                  fontSize: (r.isJev ? 36 : 29) * u,
                  color: done ? r.color : C.ink3,
                  marginTop: 5 * u,
                  transform: `scale(${done ? interpolate(Math.min(stamp, 1), [0, 1], [1.75, 1]) : 1})`,
                  textShadow: done && since < 12 ? `0 0 ${26 * u}px ${r.color}` : 'none',
                }}
              >
                {((done ? r.ms : Math.min(elapsed, r.ms)) / 1000).toFixed(2)}
              </div>
            </div>
          );
        })}
      </Camera>

      <TitleBlock code="P3" title="Glasses filling" note="Jev vs 8 Claude · thinking off" u={u} />
      <Timer
        ms={elapsed}
        progress={progress}
        u={u}
        accent={elapsed < race.jev.ms + 1}
        label={race.speed >= 0.995 ? 'elapsed · real time' : `elapsed · ×${race.speed.toFixed(2)} speed`}
      />
      <FootNote text="same pour rate, same glass · the level is the wait" u={u} />
      <StageWatermark data={data} />
    </AbsoluteFill>
  );
};
