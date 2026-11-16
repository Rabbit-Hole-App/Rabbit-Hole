# fix 3: the bench copy of the planner kind text

Found by the MVP preview's affected-tests step (scripts/explain-bench/set3-bench.test.mjs:59, "bench and production kind text are one text"). Commit ef0cf23b7 (planner: a short numbered derivation is a timeline) changed the production text in packages/control-plane/src/explanation-planner.js (flow and timeline lines); the bench copy scripts/explain-bench/planner.mjs was not changed with it, so the two texts differed.
Before: the test fails, the flow and timeline lines differ. After: the bench copy carries the same two strings (hunk: bench-planner-kind-text.diff); set3-bench.test.mjs 7/7 pass.
Not a pin: the test asserts the two copies are one text, and they were not.
