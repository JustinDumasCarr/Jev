#!/bin/zsh
# WP6 driver: the full Jev-vs-Claude run, PLAN.md §7. Resumable: run.py skips existing
# (case, rep) rows, so re-running this script continues where it stopped. Usage-limit
# pauses are handled inside run.py. Each Claude system runs alone (cache prefix warm).
set -u
cd "$(dirname "$0")/.."
PY=.venv/bin/python
LOG=results/driver.log
GIT=(git -c user.name='Justin Dumas-Carr' -c user.email='justin.dumas.carr@gmail.com')
CLAUDE_SYSTEMS=(haiku45-nothink haiku45 sonnet5-nothink sonnet5 sonnet46-nothink sonnet46 opus46-nothink opus46 opus47-nothink opus47 opus48-nothink opus48 opus5-nothink opus5 fable51-nothink fable51)
log(){ echo "$(date '+%F %T') $*" | tee -a $LOG; }
runlog(){ $PY -m harness.metrics --task $1 --systems $2 --split all --prefilter all --quick 2>/dev/null | tail -1 | sed "s/^/| $1 | $(date '+%F %T') | /" >> results/RUNLOG.md; }
commit(){ $GIT add results/ >/dev/null 2>&1; $GIT commit -q -m "WP6: $1

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" >/dev/null 2>&1 && log "committed: $1"; }
err_rate(){ # $1 task $2 system -> percent errors
  local d=results/$1/$2; local r=$( [ -f $d/results.jsonl ] && wc -l < $d/results.jsonl || echo 0 ); local e=$( [ -f $d/errors.jsonl ] && wc -l < $d/errors.jsonl || echo 0 )
  [ $((r+e)) -eq 0 ] && echo 0 || echo $(( 100*e/(r+e) )); }
run(){ log "run $*"; $PY -m harness.run "$@" >> $LOG 2>&1 || log "run.py exit $? for: $*"; }

log "=== WP6 driver start ==="
# 1. Jev, task 2, three reps (task 1 already done by WP5)
for rep in 1 2 3; do run --task task2 --system jev --rep $rep --split all; done
runlog task2 jev; commit "jev task2 reps 1-3"
# 2. Task-2 pilot (50 cases) per Claude system as a schema sanity check
for s in $CLAUDE_SYSTEMS; do
  run --task task2 --system $s --rep 1 --split all --limit 50
  log "pilot task2 $s: error rate $(err_rate task2 $s)%"
done
commit "task2 pilot, 16 Claude systems"
# 3. Full runs, one Claude system at a time, both tasks
for s in $CLAUDE_SYSTEMS; do
  for t in task1 task2; do
    run --task $t --system $s --rep 1 --split all
    er=$(err_rate $t $s); log "full $t $s: error rate ${er}%"
    if [ $er -gt 3 ]; then log "STOP-CONDITION: $t $s error rate ${er}% > 3%; skipping to next (PLAN §7 rule), needs review"; echo "| $t | $(date '+%F %T') | STOP-CONDITION $s error rate ${er}% |" >> results/RUNLOG.md; fi
    runlog $t $s
  done
  commit "full run $s, both tasks"
done
# 4. Variance subset, reps 2 and 3, every Claude system, both tasks
for s in $CLAUDE_SYSTEMS; do for t in task1 task2; do for rep in 2 3; do run --task $t --system $s --rep $rep --split variance; done; done; done
commit "variance subset reps 2-3, 16 Claude systems"
# 5. Effort sweep, task 2 only
for s in opus5-high fable51-medium; do run --task task2 --system $s --rep 1 --split all; runlog task2 $s; done
commit "effort sweep task2"
log "=== WP6 driver done ==="
