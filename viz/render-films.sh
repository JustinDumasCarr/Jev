#!/usr/bin/env bash
# Render one film per task, plus the standalone scoreboard clip for each.
#
#   ./render-films.sh                 # both fixtures, square only
#   ./render-films.sh both            # square and wide
#   ./render-films.sh square data.injection.json data.routing.json
#
# ANIMATION-PLAN.md §4: two films, one per task, never mashed together.
set -euo pipefail
cd "$(dirname "$0")"
WHICH="${1:-square}"
INJ="${2:-data.injection.fixture.json}"
RT="${3:-data.routing.fixture.json}"
OUT=out
mkdir -p "$OUT"

one () {  # comp data stem layout
  local comp="$1" data="$2" stem="$3" lay="$4"
  local fixture suffix props mp4
  fixture=$(node -e "process.stdout.write(String(require('./$data').meta.fixture===true))")
  suffix=$([ "$fixture" = "true" ] && echo ".FIXTURE" || echo "")
  props="$OUT/.p.json"
  node -e "
    const fs=require('fs');
    fs.writeFileSync('$props', JSON.stringify({layout:'$lay',data:JSON.parse(fs.readFileSync('$data','utf8'))}));
  "
  mp4="$OUT/$stem$suffix.mp4"
  echo "[$comp] -> $mp4"
  npx remotion render src/index.ts "$comp" "$mp4" --props="$props" --log=error
  node -e "console.log('   ', (require('fs').statSync('$mp4').size/1e6).toFixed(2), 'MB')"
  rm -f "$props"
}

for lay in square wide; do
  [ "$WHICH" = "both" ] || [ "$WHICH" = "$lay" ] || continue
  sfx=$([ "$lay" = "square" ] && echo 1080sq || echo 1080p)
  cap=$([ "$lay" = "square" ] && echo Square || echo Wide)
  one "JevVsClaude-Injection-$cap" "$INJ" "jev-vs-claude-injection-$sfx" "$lay"
  one "JevVsClaude-Routing-$cap"   "$RT"  "jev-vs-claude-routing-$sfx"   "$lay"
  one "Scoreboard-Injection-$cap"  "$INJ" "jev-vs-claude-injection-scoreboard-$sfx" "$lay"
  one "Scoreboard-Routing-$cap"    "$RT"  "jev-vs-claude-routing-scoreboard-$sfx"   "$lay"
done

# the path Justin's VLC already has open stays valid
if [ -f "$OUT/jev-vs-claude-injection-1080sq.FIXTURE.mp4" ]; then
  cp "$OUT/jev-vs-claude-injection-1080sq.FIXTURE.mp4" "$OUT/jev-vs-claude-1080sq.FIXTURE.mp4"
  echo "copied the injection square to the stable path"
fi
ls -la "$OUT"/*.mp4
