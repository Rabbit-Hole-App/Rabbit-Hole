#!/bin/bash
# Release 143 gate (overnight train, STACKED): PV-1 (a published canvas opens where its materials are) + SH-1 (the shared page title in the landing footer font), stacked on the final BASE (release 142's candidate).
# FULL web gate: scripts/ci, scripts tests, tutor-diagrams (includes the svg snapshots test), figure-briefs, FULL web unit, web build, property count (max 362), planner-kind replay against the BASE candidate (0 moved).
# Control-plane is not touched (no server file in the diff), so its suite is skipped: state that in the report. No smoke (web-only, no card bytes change). Every heavy step runs under the machine-wide heavy lock (heavy-lock.sh, name r143).
# Usage: BASE_SHA=<142 candidate sha> BASE_TREE=<worktree of BASE_SHA> bash gate143.sh      One node process at a time. Logs: 143-gate-run.log; each step's output in 143-step-<name>.out.
W=/c/s/explain-pv-143; B=${BASE_TREE:?BASE_TREE (a worktree of the BASE candidate, node_modules junctioned) is required}; Q=/c/s/spec/release-queue; LOG=$Q/143-gate-run.log; LOCK="bash $Q/heavy-lock.sh"
S=C:/Users/cyudhist/AppData/Local/Temp/claude/fcb4fccafe1c0d51/38aa1f5b-809d-4ebb-8a0f-f62ad1732f23/scratchpad
: > $LOG
[ -n "${BASE_SHA:-}" ] || { echo "BASE_SHA (the 142 candidate sha) is required" | tee -a $LOG; exit 2; }
[ "$(git -C $B rev-parse HEAD)" = "$BASE_SHA" ] || { echo "BASE_TREE $B is not at $BASE_SHA" | tee -a $LOG; exit 2; }
git -C $W merge-base --is-ancestor $BASE_SHA HEAD || { echo "$W does not descend from $BASE_SHA" | tee -a $LOG; exit 2; }
[ -z "$(git -C $W diff --name-only $BASE_SHA HEAD -- packages/control-plane)" ] || echo "NOTE: the diff touches packages/control-plane: the control-plane suite must be added" | tee -a $LOG
step() { local name=$1; shift; $LOCK acquire r143 >> $LOG 2>&1; local t0=$(date +%s); "$@" > $Q/143-step-$name.out 2>&1; local rc=$?; $LOCK release r143 >> $LOG 2>&1; echo "STEP $name rc=$rc $(( $(date +%s) - t0 ))s" >> $LOG; return 0; }
echo "SHA $(git -C $W rev-parse HEAD) base-tree $(git -C $B rev-parse HEAD)" >> $LOG
step ci bash -c "cd $W && node --test --test-concurrency=1 'scripts/ci/*.test.mjs'"
step scripts bash -c "cd $W && node --test --test-concurrency=1 'scripts/*.test.mjs'"
step tutor bash -c "cd $W/packages/web && node --test --test-concurrency=1 'src/tutor-diagrams/*.test.mjs'"
step figbriefs bash -c "cd $W/packages/web && node --test scripts/figure-briefs.test.mjs"
step webunit bash -c "cd $W/packages/web && npm run test:unit"
step build bash -c "cd $W/packages/web && npm run build"
step props bash -c "cd $W && node C:/s/int8-props.mjs $W && node C:/s/int8-mixed.mjs $W"
step replay bash -c "cd $W && node C:/s/int8-replay.mjs $B $S/143-replay-base.json && node C:/s/int8-replay.mjs $W $S/143-replay-new.json && node C:/s/int8-cmp.mjs $S/143-replay-base.json $S/143-replay-new.json"
# svg snapshots: this release changes no snapshot, illustration or reference file; the diff below must list none.
git -C $W diff --name-only $BASE_SHA HEAD | grep -E "svg-snapshots|illustrations/|tutor-diagrams/" > $Q/143-snapshot-diff.txt || true
echo "SNAPSHOT-DIFF files: $(wc -l < $Q/143-snapshot-diff.txt)" >> $LOG
echo "GATE RUN DONE" >> $LOG
