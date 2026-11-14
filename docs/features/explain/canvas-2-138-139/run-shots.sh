#!/bin/bash
# One stack at a time on 8998, under the heavy lock (name r139s). Labels: base (40a77cecb), r138 (03fc4642f), r139 (4ec260c08).
Q=/c/s/spec/release-queue; S=/c/s/spec/canvas-2-evidence; LOG=$S/run-shots-cv3.log; : > $LOG
bash $Q/heavy-lock.sh acquire r139s 5400 >> $LOG 2>&1 || exit 1
for pair in r138:/c/s/explain-canvas-2 r139:/c/s/explain-canvas-3; do
  L=${pair%%:*}; W=${pair#*:}; P=$S/persist-$L; rm -rf $P
  echo "== $L $W $(git -C $W rev-parse HEAD)" >> $LOG
  (cd $W && bash /c/s/spec/canvas-cards-local/stack.sh start $P) >> $LOG 2>&1 || { echo "STACK START FAILED $L" >> $LOG; (cd $W && bash /c/s/spec/canvas-cards-local/stack.sh stop $P) >> $LOG 2>&1; continue; }
  node $S/shots.mjs $L $W >> $LOG 2>&1 || echo "SHOTS FAILED $L" >> $LOG
  (cd $W && bash /c/s/spec/canvas-cards-local/stack.sh stop $P) >> $LOG 2>&1
  sleep 5
done
bash $Q/heavy-lock.sh release r139s >> $LOG 2>&1
echo "SHOTS ALL DONE" >> $LOG
