#!/bin/bash
# SH-1 header screenshots: waits for the 142 gate to finish (coordinator: the 142 gate goes first), then one stack at a time on 8998 under the heavy lock (r143h).
Q=/c/s/spec/release-queue; S=/c/s/spec/pv-143-evidence; LOG=$S/run-sh1.log; : > $LOG
for i in $(seq 1 240); do grep -q "GATE RUN DONE" $Q/142-gate-run.log 2>/dev/null && break; sleep 30; done
bash $Q/heavy-lock.sh acquire r143h 5400 >> $LOG 2>&1 || exit 1
for pair in before:/c/s/explain-canvas-3 after:/c/s/explain-pv-143; do
  L=${pair%%:*}; W=${pair#*:}; P=$S/persist-sh1-$L; rm -rf $P
  echo "== $L $W $(git -C $W rev-parse HEAD)" >> $LOG
  rm -rf $W/packages/web/dist $W/packages/web/dist-dev   # the bundles must match the tree: after SH-1 the pv-143 bundle is stale
  (cd $W && bash /c/s/spec/canvas-cards-local/stack.sh start $P) >> $LOG 2>&1 || { echo "STACK START FAILED $L" >> $LOG; (cd $W && bash /c/s/spec/canvas-cards-local/stack.sh stop $P) >> $LOG 2>&1; continue; }
  node $S/shots-sh1.mjs $L $W >> $LOG 2>&1 || echo "SHOTS FAILED $L" >> $LOG
  (cd $W && bash /c/s/spec/canvas-cards-local/stack.sh stop $P) >> $LOG 2>&1
  sleep 5
done
bash $Q/heavy-lock.sh release r143h >> $LOG 2>&1
echo "SHOTS ALL DONE" >> $LOG
