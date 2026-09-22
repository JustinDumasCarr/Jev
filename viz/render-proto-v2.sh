#!/usr/bin/env bash
# Round two of the prototypes (ANIMATION-PLAN.md §5c): P3 glasses, P5 thousand-square and
# P2 rings, rebuilt with a camera, ambient depth, anticipation and impact physics.
#
#   ./render-proto-v2.sh [data.fixture.json]
#
# Contact sheet carries TWO frames of each: mid-race, and the moment Jev lands.
set -euo pipefail
cd "$(dirname "$0")"

DATA="${1:-data.fixture.json}"
OUT="out/proto/v2"
mkdir -p "$OUT"

FIXTURE=$(node -e "process.stdout.write(String(require('./$DATA').meta.fixture===true))")
SUFFIX=$([ "$FIXTURE" = "true" ] && echo ".FIXTURE" || echo "")

PROPS="$OUT/.props.json"
node -e "
  const fs=require('fs');
  const data=JSON.parse(fs.readFileSync('$DATA','utf8'));
  fs.writeFileSync('$PROPS', JSON.stringify({layout:'square',data}));
"

# comp:name:mid-frame:jev-moment-frame
SPECS=(
  "v2-P3-Glasses:P3:120:44"
  "v2-P5-Thousand:P5:120:192"
  "v2-P2-Rings:P2:120:44"
)

for spec in "${SPECS[@]}"; do
  IFS=: read -r comp name mid jev <<<"$spec"
  mp4="$OUT/$name$SUFFIX.mp4"
  echo "[$comp] -> $mp4"
  npx remotion render src/index.ts "$comp" "$mp4" --props="$PROPS" --crf=24 --log=error
  node -e "console.log('   ', (require('fs').statSync('$mp4').size/1e6).toFixed(2), 'MB')"
  ffmpeg -loglevel error -y -i "$mp4" -vf "select=eq(n\,$mid)" -vsync 0 -frames:v 1 "$OUT/.s-$name-a.png"
  ffmpeg -loglevel error -y -i "$mp4" -vf "select=eq(n\,$jev)" -vsync 0 -frames:v 1 "$OUT/.s-$name-b.png"
done

# 3 columns (one per prototype) x 2 rows (mid-race on top, Jev's moment below)
ffmpeg -loglevel error -y \
  -i "$OUT/.s-P3-a.png" -i "$OUT/.s-P5-a.png" -i "$OUT/.s-P2-a.png" \
  -i "$OUT/.s-P3-b.png" -i "$OUT/.s-P5-b.png" -i "$OUT/.s-P2-b.png" \
  -filter_complex "\
[0:v]scale=540:540[v0];[1:v]scale=540:540[v1];[2:v]scale=540:540[v2];\
[3:v]scale=540:540[v3];[4:v]scale=540:540[v4];[5:v]scale=540:540[v5];\
[v0][v1][v2][v3][v4][v5]xstack=inputs=6:layout=0_0|540_0|1080_0|0_540|540_540|1080_540[out]" \
  -map "[out]" -frames:v 1 "$OUT/contact-v2.png"

rm -f "$PROPS" "$OUT"/.s-*.png "$OUT"/chk-*.png
ls -la "$OUT"
