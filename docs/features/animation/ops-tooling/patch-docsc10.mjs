// build-c4.sh: --docsc10 (one idempotent docs commit after the merges), --platform-day-usd N pass-through to the deploy,
// and C4_REJECT="ref=regex": a ref whose commits (subject+body) or changed paths since the base match the regex stops the build before any merge.
import fs from 'node:fs';
const f = 'C:/s/spec/animation/release/build-c4.sh';
let b = fs.readFileSync(f, 'utf8');
const rep = (a, c) => { if (b.split(a).length !== 2) throw new Error(`anchor: ${a.slice(0, 80)}`); b = b.replace(a, () => c); };
rep('DOCS24=0; DOCSC8=0; DOCSC9=0', 'DOCS24=0; DOCSC8=0; DOCSC9=0; DOCSC10=0; PDU=""');
rep('  [ "${args[$k]}" = --docsc9 ] && DOCSC9=1 ',
`  [ "\${args[$k]}" = --docsc10 ] && DOCSC10=1                   # also record the C10 lineage note in the plan (one idempotent docs commit)
  [ "\${args[$k]}" = --platform-day-usd ] && PDU=\${args[$((k+1))]}   # passed to the deploy (the dev clone only): the platform day cap on the clone
  [ "\${args[$k]}" = --docsc9 ] && DOCSC9=1 `);
rep('    for pair in $EXPECT; do',
`    for pair in \${C4_REJECT:-}; do   # "ref=regex ref=regex" (no spaces inside a regex): scope guard, e.g. C10's lane c must carry no render-test or arrow-trace work
      if [ "\${pair%%=*}" = "$ref" ]; then
        rx=\${pair#*=}
        hits=$( { git log -i -E --grep="$rx" --format='commit %h %s' "$BASE..$sha"; git diff --name-only "$BASE...$sha" | grep -i -E "$rx" | sed 's/^/path /'; } 2>/dev/null )
        [ -z "$hits" ] || { echo "$hits" | head -20; die "step $n $ref: out of scope (matches $rx); NOT merged, tell the coordinator"; }
      fi
    done
    for pair in $EXPECT; do`);
rep('  # after the merges: no markers, no duplicate headings, dependencies unchanged or reinstalled',
`  if [ $DOCSC10 = 1 ]; then
    node $RD/plan-doc-update-c10.mjs docs/superpowers/plans/2026-10-30-animation.md || die "plan-doc-update-c10 failed"
    if [ -n "$(git status --porcelain --untracked-files=no docs/superpowers/plans/2026-10-30-animation.md)" ]; then
      git add docs/superpowers/plans/2026-10-30-animation.md
      git commit -q -m "docs(animation): C10 = C9 + decision 29 azimuth line + decision 30 rim hold + label distance cap + primitives-check CI fix; platform day cap raised on the clone (decision 31)" || die "docsc10 commit failed"
      echo "C10 docs commit $(git rev-parse --short=9 HEAD)"
    else echo "C10 note already recorded"; fi
  fi
  # after the merges: no markers, no duplicate headings, dependencies unchanged or reinstalled`);
rep('bash $RD/deploy-preview-release.sh $sha --ci-pending >', 'bash $RD/deploy-preview-release.sh $sha --ci-pending \${PDU:+--platform-day-usd $PDU} >');
rep("grep -E 'newest run|CI PENDING|Current Version ID|READBACK|CHECK|RESULT|NOTE' $O/logs/c4-deploy.out", "grep -E 'newest run|CI PENDING|Current Version ID|READBACK|CHECK|RESULT|NOTE|PLATFORM DAY CAP' $O/logs/c4-deploy.out");
fs.writeFileSync(f, b);
console.log('patched');
