#!/bin/zsh
# Run AFTER scripts/run_full.sh has finished: purge every row whose case changed at the audit
# gate (including the system that was in progress during the first purge) and let the runner
# regenerate them for every system and rep that exists. Idempotent.
set -u
cd "$(dirname "$0")/.."
PY=.venv/bin/python
$PY scripts/purge_changed_ids.py
for d in results/task2/*/; do
  s=$(basename $d)
  for rep in 1 2 3; do
    split=all; [ $rep -gt 1 ] && [ "$s" != "jev" ] && split=variance
    [ $rep -gt 1 ] && [ "$s" != "jev" ] && ! grep -q "\"rep\": $rep" $d/results.jsonl 2>/dev/null && continue
    $PY -m harness.run --task task2 --system $s --rep $rep --split $split
  done
done
git -c user.name='Justin Dumas-Carr' -c user.email='justin.dumas.carr@gmail.com' add results/ && git -c user.name='Justin Dumas-Carr' -c user.email='justin.dumas.carr@gmail.com' commit -q -m "WP6: rerun the 41 audit-changed task-2 ids for every system

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" && echo committed
