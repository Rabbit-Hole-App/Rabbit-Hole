// Generalise the incremental mode of build-c4.sh: --base <sha|branch> --branch <name> (with --only) instead of the --c6 preset only,
// and a `mainff` stage that fetches and verifies that main is an ancestor of HEAD (the final main merge is then a no-op fast-forward).
import fs from 'node:fs';
const f = 'C:/s/spec/animation/release/build-c4.sh';
let b = fs.readFileSync(f, 'utf8');
const rep = (a, c) => { if (b.split(a).length !== 2) throw new Error(`anchor: ${a.slice(0, 80)}`); b = b.replace(a, () => c); };

rep('  [ "${args[$k]}" = --c6 ] && PRESET=c6\ndone',
`  [ "\${args[$k]}" = --c6 ] && PRESET=c6
  [ "\${args[$k]}" = --base ] && C4_BASE=\${args[$((k+1))]}       # incremental: the branch or sha to build on (e.g. release/animation-ladder-c6)
  [ "\${args[$k]}" = --branch ] && C4_BRANCH=\${args[$((k+1))]}   # incremental: the new branch (e.g. release/animation-ladder-c7)
done
if [ -n "\${C4_BASE:-}" ] && [ -n "\${C4_BRANCH:-}" ] && [ -n "$ONLY" ]; then NODOCS=1; fi   # --base + --branch + --only is an incremental run: no docs step`);

rep('case "$STAGE" in\n', `mainff_stage() {
  git fetch -q rabbit-hole main || die "fetch main failed"
  if git merge-base --is-ancestor rabbit-hole/main HEAD; then
    echo "MAIN FF: rabbit-hole/main $(git rev-parse --short=9 rabbit-hole/main) is an ancestor of HEAD $(git rev-parse --short=9 HEAD): the final main merge is a no-op fast-forward"
  else
    echo "MAIN NOT AN ANCESTOR: rabbit-hole/main $(git rev-parse --short=9 rabbit-hole/main) is not in HEAD $(git rev-parse --short=9 HEAD): main moved; one more merge of main is needed"; return 1
  fi
}

case "$STAGE" in
`);
rep('  identities) identities_stage;;\n', '  identities) identities_stage;;\n  mainff) mainff_stage;;\n');
rep('deploy_stage && identities_stage;;', 'deploy_stage && identities_stage && mainff_stage;;');
rep('#   bash build-c4.sh identities            prompt-files hash, golden hash and candidate SHA (harness --dry-run, nothing sent)',
`#   bash build-c4.sh identities            prompt-files hash, golden hash and candidate SHA (harness --dry-run, nothing sent)
#   bash build-c4.sh mainff                fetch main and verify it is an ancestor of HEAD (the final main merge is then a no-op fast-forward)
#   --base <sha|branch> --branch <name> --only ref1,ref2   GENERIC INCREMENTAL run (no docs step), e.g. C7 on top of C6:
#                                          C4_EXPECT="feat/an20-c4-prompts=<sha>" bash build-c4.sh all --base release/animation-ladder-c6 --branch release/animation-ladder-c7 --only feat/an20-c4-prompts`);
fs.writeFileSync(f, b);
console.log('patched');
