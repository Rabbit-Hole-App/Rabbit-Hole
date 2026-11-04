// build-c4.sh: --docs24 runs plan-doc-update-24.mjs after the merges and commits it (independent of --no-docs, which only skips decision 23).
import fs from 'node:fs';
const f = 'C:/s/spec/animation/release/build-c4.sh';
let b = fs.readFileSync(f, 'utf8');
const rep = (a, c) => { if (b.split(a).length !== 2) throw new Error(`anchor: ${a.slice(0, 80)}`); b = b.replace(a, () => c); };

rep('ONLY=""; NODOCS=0; PRESET=""', 'ONLY=""; NODOCS=0; PRESET=""; DOCS24=0');
rep('  [ "${args[$k]}" = --c6 ] && PRESET=c6\n', '  [ "${args[$k]}" = --c6 ] && PRESET=c6\n  [ "${args[$k]}" = --docs24 ] && DOCS24=1                     # also record owner decision 24 in the plan (one idempotent docs commit)\n');
rep('  # after the merges: no markers, no duplicate headings, dependencies unchanged or reinstalled',
`  # decision 24 (owner, 4 November 2026): one small idempotent docs commit, after the merges
  if [ $DOCS24 = 1 ]; then
    node $RD/plan-doc-update-24.mjs docs/superpowers/plans/2026-10-30-animation.md || die "plan-doc-update-24 failed"
    if [ -n "$(git status --porcelain --untracked-files=no docs/superpowers/plans/2026-10-30-animation.md)" ]; then
      git add docs/superpowers/plans/2026-10-30-animation.md
      git commit -q -m "docs(animation): decision 24 in the plan: the 8-of-9 Gate 2 bar for one more cycle, the C7 scope, Gate 1 and Gate 2 rerun on C7, strict tool output do-now if the schema subset fits" || die "docs24 commit failed"
      echo "decision 24 docs commit $(git rev-parse --short=9 HEAD)"
    else echo "decision 24 already recorded"; fi
  fi
  # after the merges: no markers, no duplicate headings, dependencies unchanged or reinstalled`);
rep('#   bash build-c4.sh mainff ', '#   --docs24                               also record owner decision 24 in the plan (an idempotent docs commit after the merges)\n#   bash build-c4.sh mainff ');
fs.writeFileSync(f, b);
console.log('patched');
