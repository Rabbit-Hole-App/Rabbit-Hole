// One-off patch: parametrize prod-bundle-probe.mjs (--features) and deploy-preview-release.sh (worktree, branch, post-deploy checks).
import fs from 'node:fs';
const dir = 'C:/s/spec/animation/release/';
const rep = (t, a, b) => { if (t.split(a).length !== 2) throw new Error(`anchor: ${a.slice(0, 60)}`); return t.replace(a, () => b); };

let p = fs.readFileSync(`${dir}prod-bundle-probe.mjs`, 'utf8');
p = rep(p, "const FEATURES = ['curve_radius', 'action_motion'];",
  "// The client features the build must declare: --features a,b,c (default: the two of the MVP1 release; the ladder candidate declares seven, see ANIMATION_CLIENT_FEATURES in capabilities.js).\nconst FEATURES = (args.features ? args.features.split(',') : ['curve_radius', 'action_motion']).filter(Boolean);");
p = rep(p, '//   node prod-bundle-probe.mjs --origin https://digrabbithole.com        online (GET only, after the release)',
  '//   node prod-bundle-probe.mjs --origin https://digrabbithole.com        online (GET only, after the release)\n//   add --features curve_radius,action_motion,surface_grid,trail_points,text_readout,arrow_anchor,clamp for the ladder candidate');
fs.writeFileSync(`${dir}prod-bundle-probe.mjs`, p);

let d = fs.readFileSync(`${dir}deploy-preview-release.sh`, 'utf8');
d = rep(d, 'WT=C:/Users/cyudhist/Desktop/workspace/animation-release\n',
  'WT=${DEPLOY_WT:-C:/Users/cyudhist/Desktop/workspace/animation-release}\nBRANCH=${DEPLOY_BRANCH:-release/animation-mvp1}   # the ladder candidate: DEPLOY_WT=C:/Users/cyudhist/Desktop/workspace/animation-ladder DEPLOY_BRANCH=release/animation-ladder\n');
d = rep(d, '[ "$(git -C $WT rev-parse --abbrev-ref HEAD)" = release/animation-mvp1 ] || { echo "RESULT FAIL not on release/animation-mvp1"; exit 2; }',
  '[ "$(git -C $WT rev-parse --abbrev-ref HEAD)" = "$BRANCH" ] || { echo "RESULT FAIL not on $BRANCH"; exit 2; }');
d = rep(d, 'echo "RESULT OK https://$NAME.tryrabbithole.workers.dev at $A"', `# Post-deploy checks (read-only): the page, the signed-out jobs route, the served bundle's client features (read from this tree), the launcher check.
B=https://$NAME.tryrabbithole.workers.dev; sleep 20
FEATS=$(node C:/s/spec/animation/release/tree-features.mjs "$WT")
echo "CHECK GET / -> $(curl -s -o /dev/null -w '%{http_code}' -A rabbit-hole-readonly $B/) (want 200)"
echo "CHECK signed-out GET jobs -> $(curl -s -o /dev/null -w '%{http_code}' -A rabbit-hole-readonly "$B/api/learn/animation/jobs?board=x") (want 401)"
echo "CHECK bundle features $FEATS: $(node C:/s/spec/animation/release/prod-bundle-probe.mjs --origin $B --features "$FEATS" 2>&1 | tail -1)"
echo "CHECK launcher: $(node C:/s/spec/animation/open-correction-fixture.mjs --check 2>&1 | tail -1 | cut -c1-120)"
echo "RESULT OK https://$NAME.tryrabbithole.workers.dev at $A"`);
fs.writeFileSync(`${dir}deploy-preview-release.sh`, d);

fs.writeFileSync(`${dir}tree-features.mjs`, `// Prints the Animation client features a worktree declares (ANIMATION_CLIENT_FEATURES in packages/web/src/animation3d/capabilities.js), comma separated.
import { readFileSync } from 'node:fs';
const text = readFileSync(\`\${process.argv[2]}/packages/web/src/animation3d/capabilities.js\`, 'utf8');
const m = text.match(/ANIMATION_CLIENT_FEATURES\\s*=\\s*Object\\.freeze\\(\\[([^\\]]*)\\]/);
if (!m) { console.error('no ANIMATION_CLIENT_FEATURES found'); process.exit(1); }
console.log([...m[1].matchAll(/'([a-z_]+)'/g)].map(x => x[1]).join(','));
`);
console.log('patched');
