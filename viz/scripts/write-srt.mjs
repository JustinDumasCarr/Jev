// Captions for the finished cut, from the same beat list the composition uses.
//
//   node scripts/write-srt.mjs <data.json> <square|wide> <out.srt>
//
// The lines are burned into the frame too (§5b) — most viewers never unmute — but the
// .srt ships for accessibility and for the report's embed.

import {readFileSync, writeFileSync} from 'node:fs';
import {captionLines, verdict} from '../src/timeline.mjs';

const [, , dataPath, layout, outPath] = process.argv;
if (!dataPath || !layout || !outPath) {
  console.error('usage: write-srt.mjs <data.json> <square|wide> <out.srt>');
  process.exit(1);
}

const data = JSON.parse(readFileSync(dataPath, 'utf8'));
const beats = captionLines(data, layout);
const v = verdict(data);
const FPS = 30;

const ts = (frames) => {
  const ms = Math.round((frames / FPS) * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)},${p(r, 3)}`;
};

const cues = [];
const push = (fromFrame, toFrame, text) => {
  if (!text) return;
  cues.push({fromFrame, toFrame, text});
};

if (data.meta.fixture) {
  const first = beats[0];
  push(0, first.durationInFrames, '[PLACEHOLDER DATA — no run has happened yet]');
}

for (const b of beats) {
  const end = b.from + b.durationInFrames - 4;
  push(b.from, end, b.srt || b.caption);
  if (b.id === 'accuracy' && v.weakest) {
    push(Math.round(b.from + b.durationInFrames * 0.75), end, `Weakest slice: ${v.weakest}.`);
  }
}

cues.sort((a, b) => a.fromFrame - b.fromFrame);

const out = cues
  .map((c, i) => `${i + 1}\n${ts(c.fromFrame)} --> ${ts(c.toFrame)}\n${c.text}\n`)
  .join('\n');

writeFileSync(outPath, out + '\n', 'utf8');
console.log(`  ${outPath}  (${cues.length} cues)`);
