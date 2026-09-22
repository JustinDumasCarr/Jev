#!/bin/zsh
# WP6 parallel driver: N workers pull systems from the shared list under a per-system lock,
# so each system runs exactly once (run.py itself resumes and skips existing rows). Per-system
# concurrency stays 4 CLI processes (PLAN.md §6); the parallelism is across systems, recorded
# in results/driver.log. Usage: zsh scripts/run_parallel.sh [workers]
set -u
cd "$(dirname "$0")/.."
N=${1:-4}
PY=.venv/bin/python
LOG=results/driver.log
LOCKS=results/.locks; mkdir -p $LOCKS
GIT=(git -c user.name='Justin Dumas-Carr' -c user.email='justin.dumas.carr@gmail.com')
SYSTEMS=(haiku45 sonnet5-nothink sonnet5 sonnet46-nothink sonnet46 opus46-nothink opus46 opus47-nothink opus47 opus48-nothink opus48 opus5-nothink opus5 fable51-nothink fable51 haiku45-nothink)
log(){ echo "$(date '+%F %T') [$1] ${@:2}" | tee -a $LOG; }
runlog(){ $PY -m harness.metrics --task $1 --systems $2 --split all --prefilter all --quick 2>/dev/null | tail -1 | sed "s/^/| $1 | $(date '+%F %T') | /" >> results/RUNLOG.md; }
commit(){ mkdir $LOCKS/.git 2>/dev/null || return 0; $GIT add results/ >/dev/null 2>&1; $GIT commit -q -m "WP6: $1

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" >/dev/null 2>&1 && log $2 "committed: $1"; rmdir $LOCKS/.git; }
err_rate(){ local d=results/$1/$2; local r=$( [ -f $d/results.jsonl ] && wc -l < $d/results.jsonl || echo 0 ); local e=$( [ -f $d/errors.jsonl ] && wc -l < $d/errors.jsonl || echo 0 ); [ $((r+e)) -eq 0 ] && echo 0 || echo $(( 100*e/(r+e) )); }
worker(){
  local w=$1
  # phase 0 (Justin, 2026-09-22 evening): the 200-case stratified variance subset, rep 1, for
  # every system on both tasks FIRST, so real data exists for all 16 Claude configurations
  # within the hour and the films can render on it (n=200, stated on screen). The full run
  # (phase 1) then resumes and skips these rows.
  for s in $SYSTEMS; do
    mkdir $LOCKS/p0-$s 2>/dev/null || continue
    for t in task1 task2; do
      log $w "run $t $s variance-first"
      $PY -m harness.run --task $t --system $s --rep 1 --split variance >> $LOG.$w 2>&1 || log $w "run.py exit $? $t $s p0"
    done
    commit "200-case subset $s, both tasks" $w
  done
  # phase 1: full runs
  for s in $SYSTEMS; do
    mkdir $LOCKS/full-$s 2>/dev/null || continue
    for t in task1 task2; do
      log $w "run $t $s full"
      $PY -m harness.run --task $t --system $s --rep 1 --split all >> $LOG.$w 2>&1 || log $w "run.py exit $? $t $s"
      er=$(err_rate $t $s); log $w "full $t $s: error rate ${er}%"
      [ $er -gt 3 ] && echo "| $t | $(date '+%F %T') | STOP-CONDITION $s error rate ${er}% |" >> results/RUNLOG.md
      runlog $t $s
    done
    commit "full run $s, both tasks" $w
  done
  # phase 2: variance reps 2-3
  for s in $SYSTEMS; do
    mkdir $LOCKS/var-$s 2>/dev/null || continue
    for t in task1 task2; do for rep in 2 3; do
      log $w "run $t $s variance rep $rep"
      $PY -m harness.run --task $t --system $s --rep $rep --split variance >> $LOG.$w 2>&1 || log $w "run.py exit $? $t $s rep $rep"
    done; done
    commit "variance reps 2-3 $s" $w
  done
  # phase 3: effort sweep
  for s in opus5-high fable51-medium; do
    mkdir $LOCKS/sweep-$s 2>/dev/null || continue
    log $w "run task2 $s sweep"
    $PY -m harness.run --task task2 --system $s --rep 1 --split all >> $LOG.$w 2>&1 || log $w "run.py exit $? sweep $s"
    runlog task2 $s; commit "effort sweep $s" $w
  done
  log $w "worker done"
}
log main "=== parallel driver start: $N workers, 4 CLI processes each ==="
for i in $(seq 1 $N); do worker w$i & done
wait
log main "=== all workers done; running rerun_changed.sh ==="
zsh scripts/rerun_changed.sh >> $LOG 2>&1
log main "=== WP6 complete ==="
