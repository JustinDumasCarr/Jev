#!/usr/bin/env bash
# Render the five motion-metaphor prototypes of ANIMATION-PLAN.md §5c and a contact sheet.
#
#   ./render-proto.sh [data.fixture.json]
#
# Each clip is about 8 s, square, from the same fixture data as the film, watermark on.
# Kept small on purpose (< 3 MB) — these are for choosing a direction, not for posting.
set -euo pipefail
cd "$(dirname "$0")"

DATA="${1:-data.fixture.json}"
OUT="out/proto"
mkdir -p "$OUT"

FIXTURE=$(node -e "process.stdout.write(String(require('./$DATA').meta.fixture===true))")
SUFFIX=$([ "$FIXTURE" = "true" ] && echo ".FIXTURE" || echo "")

PROPS="$OUT/.props.json"
node -e "
  const fs=require('fs');
  const data=JSON.parse(fs.readFileSync('$DATA','utf8'));
  fs.writeFileSync('$PROPS', JSON.stringify({layout:'square',data}));
"

COMPS=(P1-Rockets P2-Rings P3-Glasses P4-Sprint P5-Thousand)

for c in "${COMPS[@]}"; do
  n="${c%%-*}"
  mp4="$OUT/$n$SUFFIX.mp4"
  echo "[$c] -> $mp4"
  npx remotion render src/index.ts "$c" "$mp4" --props="$PROPS" --crf=26 --log=error
  node -e "console.log('   ', (require('fs').statSync('$mp4').size/1e6).toFixed(2), 'MB')"
done

# One mid-scene frame each, labelled, stacked into a contact sheet.
# No drawtext needed: every prototype burns its own P-number badge into the frame (this
# ffmpeg build has no drawtext filter anyway).
args=()
filters=()
i=0
for c in "${COMPS[@]}"; do
  n="${c%%-*}"
  frame="$OUT/.sheet-$n.png"
  # frame 140 of 240: mid-scene, after several systems have landed
  ffmpeg -loglevel error -y -i "$OUT/$n$SUFFIX.mp4" -vf "select=eq(n\,140)" -vsync 0 -frames:v 1 "$frame"
  args+=(-i "$frame")
  filters+=("[$i:v]scale=540:540[v$i]")
  i=$((i + 1))
done

ffmpeg -loglevel error -y "${args[@]}" -filter_complex \
  "$(IFS=';'; echo "${filters[*]}");[v0][v1][v2][v3][v4]xstack=inputs=5:layout=0_0|540_0|1080_0|0_540|540_540:fill=black[out]" \
  -map "[out]" -frames:v 1 "$OUT/contact.png"

rm -f "$PROPS" "$OUT"/.sheet-*.png
ls -la "$OUT"
