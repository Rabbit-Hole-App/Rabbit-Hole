// Patch build-c4.sh for an INCREMENTAL second run (C6): --c6 preset (branch release/animation-ladder-c6 from 44b13764e, only the two moved lane branches,
// no decision-23 docs step), --only/--no-docs generic options, branch creation from BASE whenever the tree is clean, an identities stage and per-branch state files.
import fs from 'node:fs';
const f = 'C:/s/spec/animation/release/build-c4.sh';
let b = fs.readFileSync(f, 'utf8');
const rep = (a, c) => { if (b.split(a).length !== 2) throw new Error(`anchor: ${a.slice(0, 80)}`); b = b.replace(a, () => c); };

rep('EXPECT=${C4_EXPECT:-}   # "ref=sha ref=sha": the ref\'s tip must contain sha (equal or a descendant), else the build stops',
`EXPECT=\${C4_EXPECT:-}   # "ref=sha ref=sha": the ref's tip must contain sha (equal or a descendant), else the build stops
ONLY=""; NODOCS=0; PRESET=""
for ((k=0; k<\${#args[@]}; k++)); do
  [ "\${args[$k]}" = --only ] && ONLY=\${args[$((k+1))]}        # comma separated refs: the step list is exactly these (an incremental run)
  [ "\${args[$k]}" = --no-docs ] && NODOCS=1                   # skip the decision-23 docs step (already in the base)
  [ "\${args[$k]}" = --c6 ] && PRESET=c6
done
if [ "$PRESET" = c6 ]; then
  # Second candidate, built INCREMENTALLY on the frozen C4' (44b13764e = release/animation-ladder-c4): only the two lane branches that moved are merged.
  C4_BRANCH=\${C4_BRANCH:-release/animation-ladder-c6}; C4_BASE=\${C4_BASE:-44b13764e0586da73d2217acb87d878fd18a3722}
  [ -n "$ONLY" ] || ONLY="feat/an18-contract,feat/an20-c4-prompts"; NODOCS=1
fi`);
rep('BRANCH=${C4_BRANCH:-release/animation-ladder-c4}; BASE=${C4_BASE:-53a47f33ca90f3f18144ea2b196be4a724f3d10f}',
    'BRANCH=${C4_BRANCH:-release/animation-ladder-c4}; BASE=${C4_BASE:-53a47f33ca90f3f18144ea2b196be4a724f3d10f}\nSTATE=$RD_STATE_PLACEHOLDER');
b = b.replace('STATE=$RD_STATE_PLACEHOLDER\n', '');
rep('RD=/c/s/spec/animation/release; O=$RD/ladder; mkdir -p $O/logs', 'RD=/c/s/spec/animation/release; O=$RD/ladder; mkdir -p $O/logs\nSTATE=$O/STATE-$(basename $BRANCH).txt');
rep(`    [ "$(git rev-parse HEAD)" = $BASE ] || die "to create $BRANCH the worktree must be at the frozen C3' \${BASE:0:12} (it is at $(git rev-parse --short=12 HEAD) on $cur)"
    git switch -q -c $BRANCH $BASE || die "could not create $BRANCH"`,
`    git cat-file -e "$BASE^{commit}" 2>/dev/null || die "the base \${BASE:0:12} is not in this clone"
    git switch -q -c $BRANCH $BASE || die "could not create $BRANCH from \${BASE:0:12} (from $cur)"`);
rep(': > $O/C4-STATE.txt', ': > $STATE');
rep('  steps=(); [ $WITH_MAIN = 1 ] && steps+=("main"); [ -n "$FIRST" ] && steps+=("$FIRST")\n  steps+=("feat/an18-contract" "feat/golden-sgd" "feat/an20-c4-prompts" "feat/an20-c4-harness" "feat/an21-qualify" "feat/ladder-smoke" "feat/an21-copy")',
`  steps=(); [ $WITH_MAIN = 1 ] && steps+=("main"); [ -n "$FIRST" ] && steps+=("$FIRST")
  if [ -n "$ONLY" ]; then steps=(); IFS=, read -r -a steps <<< "$ONLY"; else
    steps+=("feat/an18-contract" "feat/golden-sgd" "feat/an20-c4-prompts" "feat/an20-c4-harness" "feat/an21-qualify" "feat/ladder-smoke" "feat/an21-copy"); fi`);
b = b.split('>> $O/C4-STATE.txt').join('>> $STATE');
rep('cat $O/C4-STATE.txt', 'cat $STATE');
rep('  # step 9: the docs commit\n  before=$(git rev-parse HEAD^{tree})\n  node $RD/plan-doc-update.mjs docs/superpowers/plans/2026-10-30-animation.md || die "plan-doc-update failed"\n  if [ -n "$(git status --porcelain --untracked-files=no docs/superpowers/plans/2026-10-30-animation.md)" ]; then',
`  # step 9: the docs commit (decision 23); skipped in an incremental run, where it is already in the base
  if [ $NODOCS = 1 ]; then echo "docs step skipped (--no-docs / --c6): decision 23 is in the base"; else
  node $RD/plan-doc-update.mjs docs/superpowers/plans/2026-10-30-animation.md || die "plan-doc-update failed"
  if [ -n "$(git status --porcelain --untracked-files=no docs/superpowers/plans/2026-10-30-animation.md)" ]; then`);
rep('  else echo "step 9: decision 23 already recorded"; fi\n', '  else echo "step 9: decision 23 already recorded"; fi\n  fi\n');
// identities stage
rep('case "$STAGE" in', `identities_stage() {
  for v in $(env | cut -d= -f1 | grep -i -E 'KEY|TOKEN|SECRET|PASSWORD|CLOUDFLARE'); do unset $v; done
  node scripts/animation/author-sample.mjs run scripts/animation/plans/sgd-run5.json -n 1 --dry-run --out $O/author-dry 2>&1 | grep -E '^(prompt-files|golden|candidate)' | cut -c1-200
}

case "$STAGE" in`);
rep('  deploy) deploy_stage;;\n  all) merge_stage && check_stage && push_stage && deploy_stage;;',
    '  deploy) deploy_stage;;\n  identities) identities_stage;;\n  all) merge_stage && check_stage && push_stage && deploy_stage && identities_stage;;');
rep('#   bash build-c4.sh all [--with-main]     merge, check, push, deploy; stops at the first failure',
`#   bash build-c4.sh all [--with-main]     merge, check, push, deploy, identities; stops at the first failure
#   bash build-c4.sh identities            prompt-files hash, golden hash and candidate SHA (harness --dry-run, nothing sent)
#   --c6                                   INCREMENTAL second candidate: branch release/animation-ladder-c6 from 44b13764e (C4'), ONLY the moved lanes
#                                          (feat/an18-contract, feat/an20-c4-prompts), fix.md resolver as before, no decision-23 docs step; same check/push/deploy.
#                                          Generic form: --only ref1,ref2 [--no-docs] with C4_BRANCH / C4_BASE. Example (the real run):
#                                          C4_EXPECT="feat/an18-contract=<sha> feat/an20-c4-prompts=<sha>" bash build-c4.sh all --c6`);
fs.writeFileSync(f, b);
console.log('patched');
