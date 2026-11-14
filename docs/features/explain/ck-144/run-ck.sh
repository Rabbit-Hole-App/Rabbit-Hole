#!/bin/bash
# One stack at a time on 8998 under the heavy lock (r144s). before = main 65164f686 (worktree explain-pv-143), after = the tree given as $1 (default explain-ctrlk-144).
Q=/c/s/spec/release-queue; S=/c/s/spec/ck-144-evidence; LOG=$S/run-ck.log; : > $LOG
AFTER=${1:-/c/s/explain-ctrlk-144}
for i in $(seq 1 240); do grep -q "GATE RUN DONE" $Q/144-gate-run.log 2>/dev/null && break; sleep 30; done
bash $Q/heavy-lock.sh acquire r144s 5400 >> $LOG 2>&1 || exit 1
for pair in before:/c/s/explain-base-main8d5 after:$AFTER; do
  L=${pair%%:*}; W=${pair#*:}; P=$S/persist-$L; rm -rf $P
  echo "== $L $W $(git -C $W rev-parse HEAD)" >> $LOG
  [ "$L" = after ] && rm -rf $W/packages/web/dist $W/packages/web/dist-dev
  (cd $W && bash /c/s/spec/canvas-cards-local/stack.sh start $P) >> $LOG 2>&1 || { echo "STACK START FAILED $L" >> $LOG; (cd $W && bash /c/s/spec/canvas-cards-local/stack.sh stop $P) >> $LOG 2>&1; continue; }
  node $S/shots-ck.mjs $L $W >> $LOG 2>&1 || echo "SHOTS FAILED $L" >> $LOG
  (cd $W && bash /c/s/spec/canvas-cards-local/stack.sh stop $P) >> $LOG 2>&1
  sleep 5
done
bash $Q/heavy-lock.sh release r144s >> $LOG 2>&1
echo "SHOTS ALL DONE" >> $LOG
