#!/usr/bin/env bash
# run-gates.sh <candidate sha> <preview version id> <prompt-files hash> <tag, e.g. c10>
# Mints fresh Gate 2 test users (announced), then starts Gate 1 (SGD 20 + regression 9) and Gate 2 (controls first, then ten jobs) in the background.
set -uo pipefail
C=$1; V=$2; P=$3; T=$4; G=${5:-ae82facb429aefc4a7a5b4fd8a3a14467fd543a9cbdfc4b758f675f40989371b}
W=C:/Users/cyudhist/Desktop/workspace/animation-ladder; Q=C:/Users/cyudhist/Desktop/workspace/an21-qualify; GA=C:/s/spec/animation/sgd-mvp1-acceptance
[ "$(git -C $W rev-parse HEAD)" = "$C" ] || { echo "worktree $W is not at $C"; exit 1; }
cd $Q; M=$(node scripts/animation/dev-test-session.mjs --mint --fresh --count 5 2>&1 | tee /dev/stderr | sed -n 's/^use it for ONE run: sgd-qualify.mjs --sessions-file //p' | tr -d '\r'); [ -n "$M" ] || { echo "mint failed"; exit 1; }
cat > /tmp/gate1-$T.sh <<EOS
cd $W
node scripts/animation/author-sample.mjs scripts/animation/plans/sgd-loss-surface.json -n 20 --send --concurrency 5 --max-credits 900 --candidate-sha $C --freeze-prompts $P --freeze-golden $G --label gate1-sgd-$T; echo "SGD EXIT \$?"
node scripts/animation/author-sample.mjs scripts/animation/plans/grid-game-run6.json scripts/animation/plans/pendulum-aj_78cc3d3.json scripts/animation/plans/projectile-aj_54eec6a.json -n 3 --send --concurrency 3 --max-credits 350 --candidate-sha $C --freeze-prompts $P --freeze-golden $G --label gate1-regression-$T; echo "REG EXIT \$?"
EOS
cat > /tmp/gate2-$T.sh <<EOS
cd $Q
export PREVIEW_VERSION=$V PREVIEW_SHA=$C
A="--base https://rabbit-hole-web-dev-animation.tryrabbithole.workers.dev --candidate-worktree $W --mvp3-sha $C --prompts-hash $P --golden-hash $G --cap 1500 --prior 0 --concurrency 5 --typical author=45,review=20,repair=45 --sessions-file $M --out $GA/release-gate2-$T"
node scripts/animation/sgd-qualify.mjs \$A --check 2>&1 | grep -v -i deprecat | tail -6
node scripts/animation/sgd-qualify.mjs \$A
echo "GATE2 EXIT \$?"
EOS
nohup bash /tmp/gate1-$T.sh > /tmp/gate1-$T.log 2>&1 &
nohup bash /tmp/gate2-$T.sh > /tmp/gate2-$T.log 2>&1 &
echo "started $T $(TZ='PST8PDT,M3.2.0,M11.1.0' date '+%-I:%M %p PT')"
