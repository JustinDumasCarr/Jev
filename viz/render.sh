#!/usr/bin/env bash
# Render the film from a data file — ANIMATION-PLAN.md §2.
#
#   ./render.sh                                   # the default fixture, both layouts
#   ./render.sh data.json                         # real data, both layouts
#   ./render.sh data.fixture-jev-loses.json square
#
# A fixture data file renders to <name>.FIXTURE.mp4 so a placeholder cut can never be
# mistaken for the real one by its filename. Outputs land in viz/out/.
set -euo pipefail

cd "$(dirname "$0")"

DATA="${1:-data.fixture.json}"
ONLY="${2:-both}"
OUT="out"
mkdir -p "$OUT"

[ -f "$DATA" ] || { echo "no such data file: $DATA" >&2; exit 1; }

FIXTURE=$(node -e "process.stdout.write(String(require('./$DATA').meta.fixture===true))")
VARIANT=$(basename "$DATA" .json | sed 's/^data//; s/^\.//' | tr '[:lower:]' '[:upper:]')
if [ "$FIXTURE" = "true" ]; then
  SUFFIX=".${VARIANT:-FIXTURE}"
else
  SUFFIX=""
fi

echo "data: $DATA (fixture=$FIXTURE) -> suffix '$SUFFIX'"

render_one () {
  local layout="$1" comp="$2" stem="$3"
  local props="$OUT/.props-$layout.json"
  node -e "
    const fs=require('fs');
    const data=JSON.parse(fs.readFileSync('$DATA','utf8'));
    fs.writeFileSync('$props', JSON.stringify({layout:'$layout',data}));
  "
  local mp4="$OUT/$stem$SUFFIX.mp4"
  echo "[$layout] rendering $mp4"
  npx remotion render src/index.ts "$comp" "$mp4" --props="$props" --log=error

  node scripts/write-srt.mjs "$DATA" "$layout" "$OUT/$stem$SUFFIX.srt"

  local frames
  frames=$(node -e "
    const data=require('./$DATA');
    import('./src/timeline.mjs').then(t=>process.stdout.write(String(t.totalFrames(data,'$layout')-1)));
  ")
  if [ "$layout" = "square" ]; then
    echo "[$layout] poster frame $frames"
    npx remotion still src/index.ts "$comp" "$OUT/poster$SUFFIX.png" \
      --props="$props" --frame="$frames" --log=error
  fi
  rm -f "$props"

  local mb secs
  mb=$(node -e "process.stdout.write((require('fs').statSync('$mp4').size/1e6).toFixed(1))")
  secs=$(node -e "
    const data=require('./$DATA');
    import('./src/timeline.mjs').then(t=>process.stdout.write((t.totalFrames(data,'$layout')/30).toFixed(1)));
  ")
  echo "[$layout] done: ${secs}s, ${mb} MB"
}

if [ "$ONLY" = "both" ] || [ "$ONLY" = "square" ]; then
  render_one square JevVsClaude-Square jev-vs-claude-1080sq
fi
if [ "$ONLY" = "both" ] || [ "$ONLY" = "wide" ]; then
  render_one wide JevVsClaude-Wide jev-vs-claude-1080p
fi

ls -la "$OUT"
