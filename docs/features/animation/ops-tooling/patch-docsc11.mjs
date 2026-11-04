// build-c4.sh: --docsc11 runs plan-doc-update-c11.mjs after the merges and commits it (one idempotent docs commit).
import fs from 'node:fs';
const f = 'C:/s/spec/animation/release/build-c4.sh';
let b = fs.readFileSync(f, 'utf8');
const rep = (a, c) => { if (b.split(a).length !== 2) throw new Error(`anchor: ${a.slice(0, 80)}`); b = b.replace(a, () => c); };
rep('DOCSC10=0; PDU=""', 'DOCSC10=0; DOCSC11=0; PDU=""');
rep('  [ "${args[$k]}" = --docsc10 ] && DOCSC10=1 ', '  [ "${args[$k]}" = --docsc11 ] && DOCSC11=1                   # also record the C11 lineage note in the plan (one idempotent docs commit)\n  [ "${args[$k]}" = --docsc10 ] && DOCSC10=1 ');
rep('  # after the merges: no markers, no duplicate headings, dependencies unchanged or reinstalled',
`  if [ $DOCSC11 = 1 ]; then
    node $RD/plan-doc-update-c11.mjs docs/superpowers/plans/2026-10-30-animation.md || die "plan-doc-update-c11 failed"
    if [ -n "$(git status --porcelain --untracked-files=no docs/superpowers/plans/2026-10-30-animation.md)" ]; then
      git add docs/superpowers/plans/2026-10-30-animation.md
      git commit -q -m "docs(animation): C11 = C10 + decision 34: the golden (the exemplar) retuned after the job-0 control rejected it (arrow scale, Full-batch step arrow and label, arrow colours, rim-consistent path); exemplar pin re-pinned (golden file ae82facb429a..., exemplar draft 9ae7fe47...); C10 CI green; golden and prompt-files hashes change; primitives check renamed slopeArrow->fullArrow" || die "docsc11 commit failed"
      echo "C11 docs commit $(git rev-parse --short=9 HEAD)"
    else echo "C11 note already recorded"; fi
  fi
  # after the merges: no markers, no duplicate headings, dependencies unchanged or reinstalled`);
fs.writeFileSync(f, b);
console.log('patched');
