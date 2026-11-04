// build-c4.sh: --docsc8 runs plan-doc-update-c8.mjs after the merges and commits it (one idempotent docs commit).
import fs from 'node:fs';
const f = 'C:/s/spec/animation/release/build-c4.sh';
let b = fs.readFileSync(f, 'utf8');
const rep = (a, c) => { if (b.split(a).length !== 2) throw new Error(`anchor: ${a.slice(0, 80)}`); b = b.replace(a, () => c); };
rep('ONLY=""; NODOCS=0; PRESET=""; DOCS24=0', 'ONLY=""; NODOCS=0; PRESET=""; DOCS24=0; DOCSC8=0');
rep('  [ "${args[$k]}" = --docs24 ] && DOCS24=1 ', '  [ "${args[$k]}" = --docsc8 ] && DOCSC8=1                     # also record the C8 lineage note in the plan (one idempotent docs commit)\n  [ "${args[$k]}" = --docs24 ] && DOCS24=1 ');
rep('  # after the merges: no markers, no duplicate headings, dependencies unchanged or reinstalled',
`  if [ $DOCSC8 = 1 ]; then
    node $RD/plan-doc-update-c8.mjs docs/superpowers/plans/2026-10-30-animation.md || die "plan-doc-update-c8 failed"
    if [ -n "$(git status --porcelain --untracked-files=no docs/superpowers/plans/2026-10-30-animation.md)" ]; then
      git add docs/superpowers/plans/2026-10-30-animation.md
      git commit -q -m "docs(animation): C8 = C7 + FX-AN-098 recorded in the plan (the review page's readout strip keeps text readouts)" || die "docsc8 commit failed"
      echo "C8 docs commit $(git rev-parse --short=9 HEAD)"
    else echo "C8 note already recorded"; fi
  fi
  # after the merges: no markers, no duplicate headings, dependencies unchanged or reinstalled`);
fs.writeFileSync(f, b);
console.log('patched');
