// Palette and type scale — ANIMATION-PLAN.md §0 (near-black, one warm accent for Jev,
// cool desaturated blues for the Claude family, white type) with the Claude ramp taken
// from the dataviz skill's references/palette.md blue scale, stepped for a dark surface.

import {loadFont as loadArchivo} from '@remotion/google-fonts/Archivo';
import {loadFont as loadMono} from '@remotion/google-fonts/JetBrainsMono';

export const {fontFamily: SANS} = loadArchivo('normal', {
  weights: ['500', '600', '700'],
  subsets: ['latin', 'latin-ext'],
});
export const {fontFamily: MONO} = loadMono('normal', {
  weights: ['500', '700', '800'],
  subsets: ['latin', 'latin-ext'],
});

export const C = {
  bg: '#07070a',
  bgLift: '#101018',
  panel: 'rgba(255,255,255,0.045)',
  hair: 'rgba(255,255,255,0.10)',
  ink: '#ffffff',
  ink2: '#9aa3b6',
  ink3: '#5e6678',
  accent: '#ff6a2b',
  accentDim: 'rgba(255,106,43,0.18)',
  accentGlow: 'rgba(255,106,43,0.45)',
  /* Correct / incorrect: the dataviz skill's status pair, which clears 3:1 on the
     dark surface. Red-green confusion is covered by a secondary cue, not colour:
     a correct brick is solid, an incorrect one carries a lighter outline. */
  good: '#0ca30c',
  goodEdge: '#7de07d',
  wrong: '#d03b3b',
  wrongEdge: '#ffb4b4',
};

/** One hue, graded by tier: brightest = strongest model, on a dark surface. */
export const CLAUDE_RAMP = [
  '#cfe1f7',
  '#b8d0f0',
  '#a2c0e9',
  '#8bb0e2',
  '#75a0db',
  '#5f90d3',
  '#4a80cb',
  '#3670c2',
];

export const claudeColor = (tier: number) => CLAUDE_RAMP[Math.min(tier, CLAUDE_RAMP.length - 1)];

export const tabular: React.CSSProperties = {
  fontFamily: MONO,
  fontVariantNumeric: 'tabular-nums',
  fontFeatureSettings: '"tnum" 1',
};

export const upper = (letterSpacing = 0.12): React.CSSProperties => ({
  fontFamily: SANS,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: `${letterSpacing}em`,
});

/* ---- formats ------------------------------------------------------ */

export const secs = (ms: number, digits = 2) => (ms / 1000).toFixed(digits) + ' s';

export const shortLatency = (ms: number | null | undefined) => {
  if (ms == null) return '—';
  if (ms < 1000) return Math.round(ms) + ' ms';
  return (ms / 1000).toFixed(ms < 10000 ? 2 : 1) + ' s';
};

export const money = (v: number | null | undefined) => {
  if (v == null) return '—';
  if (v >= 1) return '$' + v.toFixed(2);
  if (v >= 0.01) return '$' + v.toFixed(2);
  return '$' + v.toFixed(3);
};

export const pct = (v: number | null | undefined, d = 1) => (v == null ? '—' : (v * 100).toFixed(d) + '%');

/** h:mm:ss for the thousand-in-a-row clocks; they run to hours. */
export const clock = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
};

/* What the two classes are CALLED on screen. The data keeps saying "benign" and
   "injection"; only these strings change if the wording changes again. */
export const CLASS_LABELS: Record<string, string> = {benign: 'SAFE', injection: 'ATTACK'};
export const CLASS_ORDER = ['benign', 'injection'] as const;
export const classLabel = (v: string | null | undefined) =>
  (v && CLASS_LABELS[v]) || (v ? v.toUpperCase() : '');
