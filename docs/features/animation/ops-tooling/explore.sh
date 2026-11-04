#!/usr/bin/env bash
# explore.sh <golden file> <tag>
cd C:/Users/cyudhist/Desktop/workspace/an21-qualify
export PREVIEW_VERSION=4d2318c1-3883-4a57-8e0e-189a808e825f PREVIEW_SHA=852c86ce5cbef7c1f6d737eea4ed0ddcc36ee61f
node scripts/animation/sgd-qualify.mjs --base https://rabbit-hole-web-dev-animation.tryrabbithole.workers.dev --candidate-worktree C:/Users/cyudhist/Desktop/workspace/animation-ladder --mvp3-sha 852c86ce5cbef7c1f6d737eea4ed0ddcc36ee61f --prompts-hash 9c4d417b73a2467a71137ddba26e90457ab96900e79353edcd4d55362073702e --golden-hash 1837a72b6366ee8a8bc78d66f05ea749a56088f413d981a5a7bd4ca9316265dc --cap 1500 --prior 0 --concurrency 5 --typical author=45,review=20,repair=45 --sessions-file C:/s/spec/animation/sgd-mvp1-acceptance/gate2-sessions-g2-202611040617.json --out C:/s/spec/animation/sgd-mvp1-acceptance/release-gate2-c10-explore-$2 --controls-only --golden-file "$1" 2>&1 | grep -v -i deprecat
