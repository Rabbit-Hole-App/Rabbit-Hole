#!/bin/bash
# Re-run of the two steps a test-only commit can change (ci with check-map, web unit) on the final tip, under the heavy lock (name r144b). Outputs 144b-step-<name>.out, log 144b-gate-run.log.
W=/c/s/explain-ctrlk-144; Q=/c/s/spec/release-queue; LOG=$Q/144b-gate-run.log; LOCK="bash $Q/heavy-lock.sh"; : > $LOG
echo "SHA $(git -C $W rev-parse HEAD)" >> $LOG
step() { local name=$1; shift; $LOCK acquire r144b >> $LOG 2>&1; local t0=$(date +%s); "$@" > $Q/144b-step-$name.out 2>&1; local rc=$?; $LOCK release r144b >> $LOG 2>&1; echo "STEP $name rc=$rc $(( $(date +%s) - t0 ))s" >> $LOG; }
step ci bash -c "cd $W && node --test --test-concurrency=1 'scripts/ci/*.test.mjs'"
step webunit bash -c "cd $W/packages/web && npm run test:unit"
echo "RERUN DONE" >> $LOG
