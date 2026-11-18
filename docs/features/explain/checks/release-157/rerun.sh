#!/bin/bash
# after merging main 710801bb2: rerun every web test that reads AdaptiveCanvas / canvas-slots / learn-position, the audio, transcript, voice, selection, shared, minimap, svg-snapshots, learn-slash tests, check-map, no-ellipsis
cd /c/s/r157-int
one() { f=$1; o=$(node --test "$f" 2>&1); r=$?; echo "$r $f $(echo "$o" | grep -E '^ℹ (tests|pass|fail) ' | sed 's/ℹ //' | tr '\n' ' ')"; if [ $r -ne 0 ]; then echo "$o" | grep -E '^\s*✖' | head -4 | sed 's/^/    /'; fi; }
export -f one
( grep -l "AdaptiveCanvas\|canvas-slots\|learn-position" packages/web/src/*.test.mjs
  ls packages/web/src/{transcript-scroll,explanation-card-interactions,card-layout,audio-playing,explanation-audio,explanation-audio-client,transcript-window,transcript-reveal,voice-session,voice-tts,voice-ui,voice-stt,selection-toolbar,shared-ask,shared-canvas-parity,shared-canvas-parity-canvas,learn-minimap,learn-slash,card-selection,card-prompt-reveal,explanation-minimize-toolbar,explanation-minimize-wiring,explanation-minimize,canvas-slots,learn-position}.test.mjs
  ls packages/web/src/tutor-diagrams/svg-snapshots.test.mjs packages/web/src/tutor-diagrams/ml-plot.test.mjs packages/web/src/tutor-diagrams/TutorDiagram.test.mjs scripts/ci/check-map.test.mjs packages/control-plane/test/no-ellipsis.test.js ) | sort -u | xargs -P 6 -I{} bash -c 'one {}'
echo RERUN-DONE
