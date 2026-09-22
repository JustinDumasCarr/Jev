import React from 'react';
import {interpolate, random, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {C} from '../theme';
import {SNAP, clamp01, wobble} from '../stage';

/* A real tumbler, drawn big.
 *
 * Tapered sides, a thick base, an elliptical rim in perspective, liquid whose
 * colour deepens with depth, a refraction hint where the back rim shows through
 * the liquid, two speculars, a contact shadow, a splash and a lid.
 *
 * The one thing that is never eased, sprung or fudged: `frac`, the liquid level,
 * which is elapsed time over the shared cap and nothing else. */

/** One liquid for every glass. The system is identified by the rim, the lid and
 *  the label — never by the colour of what is being poured, because what is being
 *  poured is the same thing in every glass: elapsed time. */
export const LIQUID = '#4d8fe0';
export const LIQUID_DEEP = '#2f6ec0';

export type TumblerProps = {
  id: string;
  /** 0..1, strictly linear in elapsed time */
  frac: number;
  /** the system's colour: rim, lid, label and a thin tint. Not the liquid. */
  color: string;
  accent?: boolean;
  /** frames since this system answered; negative while it is still pouring */
  since: number;
  /** frames since this glass entered */
  sinceEnter: number;
  /** frames since the pour started, for the splash */
  sincePour: number;
  x: number;
  baseY: number;
  w: number;
  h: number;
  u: number;
};

export const Tumbler: React.FC<TumblerProps> = ({
  id,
  frac,
  color,
  accent,
  since,
  sinceEnter,
  sincePour,
  x,
  baseY,
  w,
  h,
  u,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  /* ---- geometry: a tapered tumbler ------------------------------- */
  const topW = w;
  const botW = w * 0.8;
  const topY = baseY - h;
  const rimRy = topW * 0.15; // the rim ellipse, seen from slightly above
  const baseH = 26 * u;
  const halfAt = (y: number) => {
    // half-width at a height, linear taper from base to rim
    const t = clamp01((baseY - y) / h);
    return (botW + (topW - botW) * t) / 2;
  };
  const ryAt = (y: number) => (halfAt(y) / (topW / 2)) * rimRy;

  const cx = x + w / 2;
  const outline = `M ${cx - topW / 2} ${topY}
                   L ${cx - botW / 2} ${baseY - baseH}
                   Q ${cx - botW / 2} ${baseY} ${cx - botW / 2 + 12 * u} ${baseY}
                   L ${cx + botW / 2 - 12 * u} ${baseY}
                   Q ${cx + botW / 2} ${baseY} ${cx + botW / 2} ${baseY - baseH}
                   L ${cx + topW / 2} ${topY} Z`;

  /* ---- entrance: drop in, land with a squash --------------------- */
  const enter = spring({frame: sinceEnter, fps, config: SNAP, durationInFrames: 26});
  const squash = 1 + wobble(sinceEnter - 16, 7, 9) * 0.06;
  const dropY = interpolate(enter, [0, 1], [-210 * u, 0]);

  /* ---- the measurement ------------------------------------------- */
  const level = clamp01(frac) * (h - baseH * 0.55);
  const surfaceY = baseY - baseH * 0.35 - level;
  const done = since >= 0;
  const slosh = done ? wobble(since, 8, 15) : Math.sin(frame * 0.32 + x) * 0.12;
  const surfRy = ryAt(surfaceY);
  const surfRx = halfAt(surfaceY);

  /* ---- impact -------------------------------------------------- */
  // A lid has weight: it falls over about half a second and overshoots a little
  // before it settles. IMPACT was too stiff — it read as a pop, not a drop.
  const lidS = done ? spring({frame: since, fps, config: {damping: 13, stiffness: 140, mass: 1.0}}) : 0;
  const lidY = done ? interpolate(lidS, [0, 1], [-130 * u, 0]) : 0;
  const lidSquash = done ? 1 + wobble(since - 9, 6, 8) * 0.24 : 1;
  // Perspective: while the lid is still up in the air it is nearer the eye, so it
  // reads a little wider and a lot flatter, and settles into the rim's own ellipse.
  const lift = done ? clamp01(-lidY / (130 * u)) : 0;
  const lidRx = (topW / 2 + 5 * u) * (1 + lift * 0.2);
  const lidRy = rimRy * (1 - lift * 0.62);
  const flash = done ? Math.max(0, 1 - since / 10) : 0;
  const splash = clamp01(1 - sincePour / 10);

  const cid = `tb-${id}`;
  return (
    <g transform={`translate(0 ${dropY})`} opacity={enter}>
      <g transform={`translate(${cx} ${baseY}) scale(1 ${squash}) translate(${-cx} ${-baseY})`}>
        <defs>
          <clipPath id={cid}>
            <path d={outline} />
          </clipPath>
          {/* colour deepens with depth */}
          <linearGradient id={`lq-${cid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={LIQUID} stopOpacity={0.78} />
            <stop offset="45%" stopColor={LIQUID} stopOpacity={0.93} />
            <stop offset="100%" stopColor={LIQUID_DEEP} stopOpacity={1} />
          </linearGradient>
          <linearGradient id={`gl-${cid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(255,255,255,0.16)" />
            <stop offset="26%" stopColor="rgba(255,255,255,0.03)" />
            <stop offset="76%" stopColor="rgba(255,255,255,0.02)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.14)" />
          </linearGradient>
        </defs>

        {/* contact shadow on the bench */}
        <ellipse
          cx={cx}
          cy={baseY + 7 * u}
          rx={botW * 0.66}
          ry={11 * u}
          fill="rgba(0,0,0,0.6)"
          opacity={0.75}
        />
        {/* the light the liquid bounces onto the bench */}
        {level > 4 * u ? (
          <>
            {/* caustic: the light the liquid throws onto the bench */}
            <ellipse
              cx={cx}
              cy={baseY + 7 * u}
              rx={botW * (0.52 + clamp01(frac) * 0.22)}
              ry={(9 + clamp01(frac) * 5) * u}
              fill={LIQUID}
              opacity={0.1 + clamp01(frac) * 0.22}
              style={{filter: `blur(${9 * u}px)`}}
            />
            <ellipse
              cx={cx}
              cy={baseY + 6 * u}
              rx={botW * 0.34}
              ry={6 * u}
              fill="#bcd9ff"
              opacity={0.08 + clamp01(frac) * 0.2}
              style={{filter: `blur(${5 * u}px)`}}
            />
          </>
        ) : null}

        {/* the vessel body */}
        <path d={outline} fill={`url(#gl-${cid})`} />

        {/* the back half of the rim, seen through the empty glass */}
        <path
          d={`M ${cx - topW / 2} ${topY} A ${topW / 2} ${rimRy} 0 0 0 ${cx + topW / 2} ${topY}`}
          fill="none"
          stroke="rgba(255,255,255,0.14)"
          strokeWidth={2.4 * u}
        />

        <g clipPath={`url(#${cid})`}>
          {/* liquid body */}
          <rect
            x={cx - topW}
            y={surfaceY + slosh * 4 * u}
            width={topW * 2}
            height={level + baseH * 2}
            fill={`url(#lq-${cid})`}
          />
          {/* refraction hint: what is behind the glass shifts and brightens
              where the liquid is, and a caustic runs down the inside */}
          {level > 5 * u ? (
            <>
              <rect
                x={cx - topW / 2}
                y={surfaceY}
                width={topW}
                height={level + baseH}
                fill="rgba(255,255,255,0.05)"
              />
              <path
                d={`M ${cx + halfAt(surfaceY) * 0.42} ${surfaceY + 8 * u}
                    Q ${cx + halfAt(surfaceY) * 0.2} ${surfaceY + level * 0.55}
                      ${cx + halfAt(baseY) * 0.34} ${baseY - baseH}`}
                stroke="rgba(255,255,255,0.22)"
                strokeWidth={6 * u}
                fill="none"
                strokeLinecap="round"
              />
              {/* the back edge of the base, seen through the liquid: shifted
                  sideways and brightened, the way glass bends what is behind it */}
              <ellipse
                cx={cx + 9 * u}
                cy={baseY - baseH}
                rx={halfAt(baseY - baseH) * 1.04}
                ry={ryAt(baseY - baseH) * 1.15}
                fill="none"
                stroke="rgba(190,222,255,0.5)"
                strokeWidth={3 * u}
              />
              {/* and the tier's own colour as a thin tint on the wall */}
              <rect
                x={cx - topW / 2}
                y={surfaceY}
                width={topW}
                height={level + baseH}
                fill={color}
                opacity={0.12}
              />
            </>
          ) : null}

          {/* the surface: an ellipse in the same perspective as the rim */}
          {level > 1.5 * u ? (
            <g
              transform={`translate(${cx} ${surfaceY}) rotate(${slosh * 1.9}) translate(${-cx} ${-surfaceY})`}
            >
              <ellipse
                cx={cx}
                cy={surfaceY + slosh * 4 * u}
                rx={surfRx}
                ry={surfRy}
                fill={LIQUID}
                opacity={0.42}
              />
              <ellipse
                cx={cx}
                cy={surfaceY + slosh * 4 * u}
                rx={surfRx * 0.97}
                ry={surfRy * 0.92}
                fill="none"
                stroke="rgba(255,255,255,0.4)"
                strokeWidth={2.4 * u}
              />
              <ellipse
                cx={cx - surfRx * 0.2}
                cy={surfaceY + slosh * 4 * u - surfRy * 0.15}
                rx={surfRx * 0.42}
                ry={surfRy * 0.34}
                fill="rgba(255,255,255,0.3)"
              />
            </g>
          ) : null}

          {/* splash when the pour first lands */}
          {splash > 0 && sincePour >= 0 ? (
            <g opacity={splash}>
              {[0, 1, 2, 3, 4, 5].map((k) => {
                const s = random(`sp-${id}-${k}`);
                const t = 1 - splash;
                return (
                  <ellipse
                    key={k}
                    cx={cx + (s - 0.5) * topW * 1.25 * t}
                    cy={baseY - baseH - t * 62 * u * (0.35 + s) + t * t * 40 * u}
                    rx={(3 + s * 3.4) * u * splash}
                    ry={(2.4 + s * 2.8) * u * splash}
                    fill="#fff"
                    opacity={0.62}
                  />
                );
              })}
            </g>
          ) : null}
        </g>

        {/* thick base */}
        <path
          d={`M ${cx - halfAt(baseY - baseH)} ${baseY - baseH}
              L ${cx - botW / 2} ${baseY - 10 * u}
              Q ${cx - botW / 2} ${baseY} ${cx - botW / 2 + 12 * u} ${baseY}
              L ${cx + botW / 2 - 12 * u} ${baseY}
              Q ${cx + botW / 2} ${baseY} ${cx + botW / 2} ${baseY - 10 * u}
              L ${cx + halfAt(baseY - baseH)} ${baseY - baseH} Z`}
          fill="rgba(255,255,255,0.09)"
        />
        <ellipse cx={cx} cy={baseY - baseH} rx={halfAt(baseY - baseH)} ry={ryAt(baseY - baseH)} fill="rgba(255,255,255,0.07)" />

        {/* walls */}
        <path
          d={outline}
          fill="none"
          stroke={accent ? C.accent : 'rgba(255,255,255,0.34)'}
          strokeWidth={accent ? 4.5 * u : 3 * u}
        />
        {/* front half of the rim, brighter */}
        <path
          d={`M ${cx - topW / 2} ${topY} A ${topW / 2} ${rimRy} 0 0 0 ${cx + topW / 2} ${topY}`}
          fill="none"
          stroke={accent ? C.accent : 'rgba(255,255,255,0.34)'}
          strokeWidth={accent ? 4.5 * u : 3 * u}
          transform={`translate(0 ${2 * u})`}
          opacity={0}
        />
        <ellipse
          cx={cx}
          cy={topY}
          rx={topW / 2}
          ry={rimRy}
          fill="none"
          stroke={accent ? C.accent : 'rgba(255,255,255,0.4)'}
          strokeWidth={accent ? 4.5 * u : 3 * u}
        />

        {/* speculars */}
        <path
          d={`M ${cx - topW * 0.33} ${topY + 26 * u} L ${cx - botW * 0.3} ${baseY - baseH - 18 * u}`}
          stroke="rgba(255,255,255,0.11)"
          strokeWidth={22 * u}
          strokeLinecap="round"
        />
        <path
          d={`M ${cx + topW * 0.42} ${topY + 34 * u} L ${cx + botW * 0.38} ${baseY - baseH - 24 * u}`}
          stroke="rgba(255,255,255,0.4)"
          strokeWidth={3.5 * u}
          strokeLinecap="round"
        />

        {flash > 0 ? (
          <path d={outline} fill="none" stroke="#fff" strokeWidth={7 * u * flash} opacity={flash * 0.9} />
        ) : null}

        {/* the lid: anticipation, drop, squash, settle */}
        {done ? (
          <g
            transform={`translate(0 ${lidY}) translate(${cx} ${topY}) scale(${1 / lidSquash} ${lidSquash}) translate(${-cx} ${-topY})`}
            opacity={clamp01(since / 2)}
          >
            {/* the side of the lid, so it has thickness */}
            <path
              d={`M ${cx - lidRx} ${topY} L ${cx - lidRx} ${topY + 13 * u}
                  A ${lidRx} ${lidRy} 0 0 0 ${cx + lidRx} ${topY + 13 * u}
                  L ${cx + lidRx} ${topY} Z`}
              fill={color}
              opacity={0.85}
            />
            <ellipse cx={cx} cy={topY} rx={lidRx} ry={lidRy} fill={color} />
            <ellipse
              cx={cx}
              cy={topY}
              rx={lidRx}
              ry={lidRy}
              fill="none"
              stroke="rgba(255,255,255,0.6)"
              strokeWidth={3 * u}
            />
            <ellipse cx={cx} cy={topY - 9 * u} rx={lidRx * 0.33} ry={lidRy * 0.36} fill={color} />
            <rect x={cx - lidRx * 0.33} y={topY - 9 * u} width={lidRx * 0.66} height={10 * u} fill={color} />
          </g>
        ) : null}

        {/* the last drop: the pour cuts, but what was already falling still lands */}
        {done && since >= 0 && since < 22 ? (
          (() => {
            const t = since / 14; // linear fall, it is just gravity
            const fallTop = topY - 120 * u;
            const dy = t < 1 ? t * t * (surfaceY - fallTop) : surfaceY - fallTop;
            const landed = since - 14;
            return (
              <g>
                {t < 1 ? (
                  <ellipse
                    cx={cx}
                    cy={fallTop + dy}
                    rx={7 * u * (1 - t * 0.25)}
                    ry={7 * u * (1 + t * 0.85)}
                    fill={LIQUID}
                    opacity={0.95}
                  />
                ) : null}
                {landed >= 0 && landed < 8 ? (
                  <ellipse
                    cx={cx}
                    cy={surfaceY}
                    rx={interpolate(landed / 8, [0, 1], [surfRx * 0.12, surfRx * 0.8])}
                    ry={interpolate(landed / 8, [0, 1], [surfRy * 0.12, surfRy * 0.8])}
                    fill="none"
                    stroke="rgba(214,234,255,0.9)"
                    strokeWidth={2.6 * u * (1 - landed / 8)}
                    opacity={1 - landed / 8}
                  />
                ) : null}
              </g>
            );
          })()
        ) : null}

        {/* the ring the impact throws off */}
        {done && since < 18 ? (
          <ellipse
            cx={cx}
            cy={topY}
            rx={interpolate(clamp01(since / 18), [0, 1], [topW * 0.2, topW * 1.5])}
            ry={interpolate(clamp01(since / 18), [0, 1], [rimRy * 0.2, rimRy * 1.5])}
            fill="none"
            stroke={color}
            strokeWidth={4 * u * (1 - clamp01(since / 18))}
            opacity={1 - clamp01(since / 18)}
          />
        ) : null}
      </g>
    </g>
  );
};

/** The pour: a column arriving from above the frame, thinning as the glass fills. */
export const Pour: React.FC<{
  cx: number;
  fromY: number;
  toY: number;
  w: number;
  color: string;
  frac: number;
  seed: number;
  u: number;
  opacity: number;
}> = ({cx, fromY, toY, w, color, frac, seed, u, opacity}) => {
  const frame = useCurrentFrame();
  const wide = interpolate(frac, [0, 1], [w * 0.115, w * 0.07]);
  const j = Math.sin(frame * 0.6 + seed * 1.7) * 3 * u;
  const bead = fromY + ((frame * 34 * u) % Math.max(1, toY - fromY));
  return (
    <g opacity={opacity}>
      <path
        d={`M ${cx - wide} ${fromY}
            C ${cx - wide * 0.55 + j} ${fromY + (toY - fromY) * 0.4},
              ${cx - wide * 0.4} ${fromY + (toY - fromY) * 0.75},
              ${cx - wide * 0.44} ${toY}
            L ${cx + wide * 0.44} ${toY}
            C ${cx + wide * 0.4} ${fromY + (toY - fromY) * 0.75},
              ${cx + wide * 0.55 + j} ${fromY + (toY - fromY) * 0.4},
              ${cx + wide} ${fromY} Z`}
        fill={color}
        opacity={0.92}
      />
      <path
        d={`M ${cx - wide * 0.35} ${fromY} L ${cx - wide * 0.16} ${toY}`}
        stroke="rgba(255,255,255,0.45)"
        strokeWidth={wide * 0.22}
        strokeLinecap="round"
      />
      <circle cx={cx + j * 0.4} cy={bead} r={wide * 0.26} fill="#fff" opacity={0.4} />
    </g>
  );
};
