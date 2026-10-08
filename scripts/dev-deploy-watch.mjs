// The dev-branch trigger (owner, 2026-10-08: "create a dev branch where when pushing on dev deploys to the stable preview url").
//   node scripts/dev-deploy-watch.mjs --checkout <clean deploy checkout> [--once]
// Polls Rabbit-Hole-App/Rabbit-Hole dev (remote rabbit-hole) every minute. A new head deploys through dev-deploy.mjs
// --branch rabbit-hole/dev once its gate record is at <git common dir>/rabbit-hole-gates/<full tree sha>.log; until then
// it waits. The checkout runs the dev-deploy.mjs of the commit it deploys, and it is forced to that commit, so point it
// at the dedicated deploy checkout only. Each head is tried once: a refused or failed deploy waits for the next push.
// Needs the environment dev-deploy.mjs needs. Never deploys production; a push to main triggers nothing here.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const INTERVAL_MS = 60_000;
export const watchStep = ({ head, last, gate }) => head === last ? 'idle' : gate ? 'deploy' : 'wait';

async function main() {
  const i = process.argv.indexOf('--checkout');
  const checkout = i > 0 ? process.argv[i + 1] : null;
  if (!checkout) throw new Error('--checkout <clean deploy checkout> is required');
  const git = (...a) => execFileSync('git', a, { cwd: checkout, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const gates = join(git('rev-parse', '--path-format=absolute', '--git-common-dir'), 'rabbit-hole-gates');
  const say = line => console.log(`${new Date().toISOString().slice(0, 19)}Z ${line}`);
  let last = null, said = null;
  const once = line => { if (line !== said) say(line); said = line; };
  for (;;) {
    try {
      git('fetch', '-q', 'rabbit-hole', 'dev');
      const head = git('rev-parse', 'rabbit-hole/dev^{commit}');
      const gate = join(gates, `${git('rev-parse', `${head}^{tree}`)}.log`);
      const step = watchStep({ head, last, gate: existsSync(gate) });
      if (step === 'wait') once(`dev ${head.slice(0, 8)}: waiting for its gate record ${gate}`);
      if (step === 'deploy') {
        last = head;
        // --force: npm ci rewrites a bin's line endings in this checkout (dev-deploy.mjs), which would block the switch.
        git('checkout', '-q', '--force', '--detach', head);
        say(`dev ${head.slice(0, 8)}: deploying`);
        const r = spawnSync(process.execPath, ['scripts/dev-deploy.mjs', '--sha', head, '--gate', gate, '--branch', 'rabbit-hole/dev'], { cwd: checkout, stdio: 'inherit' });
        say(`dev ${head.slice(0, 8)}: dev-deploy exit ${r.status}`);
      }
    } catch (e) { once(`! ${String(e.stderr || e.message).trim().split('\n')[0]}`); }
    if (process.argv.includes('--once')) return;
    await new Promise(r => setTimeout(r, INTERVAL_MS));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
