#!/bin/bash
# One stack at a time on 8998 under the heavy lock (r143s). Labels: before = 139 candidate 4ec260c08 (its canvas files are identical to 141's), after = PV-1 tip.
Q=/c/s/spec/release-queue; S=/c/s/spec/pv-143-evidence; LOG=$S/run-pv.log; : > $LOG
bash $Q/heavy-lock.sh acquire r143s 5400 >> $LOG 2>&1 || exit 1
for pair in before:/c/s/explain-canvas-3 after:/c/s/explain-pv-143; do
  L=${pair%%:*}; W=${pair#*:}; P=$S/persist-$L; rm -rf $P
  echo "== $L $W $(git -C $W rev-parse HEAD)" >> $LOG
  (cd $W && bash /c/s/spec/canvas-cards-local/stack.sh start $P) >> $LOG 2>&1 || { echo "STACK START FAILED $L" >> $LOG; (cd $W && bash /c/s/spec/canvas-cards-local/stack.sh stop $P) >> $LOG 2>&1; continue; }
  node $S/shots-pv.mjs $L $W >> $LOG 2>&1 || echo "SHOTS FAILED $L" >> $LOG
  (cd $W && bash /c/s/spec/canvas-cards-local/stack.sh stop $P) >> $LOG 2>&1
  sleep 5
done
bash $Q/heavy-lock.sh release r143s >> $LOG 2>&1
echo "SHOTS ALL DONE" >> $LOG
