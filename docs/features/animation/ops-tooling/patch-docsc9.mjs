// build-c4.sh: --docsc9 runs plan-doc-update-c9.mjs after the merges and commits it (one idempotent docs commit).
import fs from 'node:fs';
const f = 'C:/s/spec/animation/release/build-c4.sh';
let b = fs.readFileSync(f, 'utf8');
const rep = (a, c) => { if (b.split(a).length !== 2) throw new Error(`anchor: ${a.slice(0, 80)}`); b = b.replace(a, () => c); };
rep('DOCS24=0; DOCSC8=0', 'DOCS24=0; DOCSC8=0; DOCSC9=0');
rep('  [ "${args[$k]}" = --docsc8 ] && DOCSC8=1 ', '  [ "${args[$k]}" = --docsc9 ] && DOCSC9=1                     # also record the C9 lineage note in the plan (one idempotent docs commit)\n  [ "${args[$k]}" = --docsc8 ] && DOCSC8=1 ');
rep('  # after the merges: no markers, no duplicate headings, dependencies unchanged or reinstalled',
`  if [ $DOCSC9 = 1 ]; then
    node $RD/plan-doc-update-c9.mjs docs/superpowers/plans/2026-10-30-animation.md || die "plan-doc-update-c9 failed"
    if [ -n "$(git status --porcelain --untracked-files=no docs/superpowers/plans/2026-10-30-animation.md)" ]; then
      git add docs/superpowers/plans/2026-10-30-animation.md
      git commit -q -m "docs(animation): C9 = C8 + evidence + the owner's C9 list recorded in the plan" || die "docsc9 commit failed"
      echo "C9 docs commit $(git rev-parse --short=9 HEAD)"
    else echo "C9 note already recorded"; fi
  fi
  # after the merges: no markers, no duplicate headings, dependencies unchanged or reinstalled`);
fs.writeFileSync(f, b);
console.log('patched');
