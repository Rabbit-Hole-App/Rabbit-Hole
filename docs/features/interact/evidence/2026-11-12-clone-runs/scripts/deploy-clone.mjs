// Deploys the dev clone rabbit-hole-web-dev-interact. Reads secrets by NAME from small-deploy/.env, never prints values.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const REPO = 'C:/Users/cyudhist/Desktop/workspace/feature-interactive';
const WEB = `${REPO}/packages/web`;
const NAME = 'rabbit-hole-web-dev-interact';
const step = process.argv[2];
// The clone's vars (owner 2026-11-13: the three Depth cards on the pin family). Override any with KEY=VALUE after the step, e.g. `deploy INTERACT_RUN=browser INTERACT_BUILD_PROFILE=google-low`.
const VARS = { INTERACT_SCENE_PLAN_ENABLED: 'true', USAGE_PLATFORM_DAY_USD: '20', INTERACT_DESCRIPTION_FIT: 'estimate', INTERACT_DESIGN_FIXTURE: 'toss', INTERACT_RUN: 'headless', INTERACT_REVIEW: 'shadow', INTERACT_BUILD_PROFILE: 'opus-baseline', EXPLAIN_DIAGNOSTICS: 'true' };
for (const arg of process.argv.slice(3)) { const m = /^([A-Z0-9_]+)=(.*)$/.exec(arg); if (m) VARS[m[1]] = m[2]; }
const varArgs = Object.entries(VARS).flatMap(([k, v]) => ['--var', `${k}:${v}`]);

const env0 = {};
for (const line of readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env0[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const need = k => { if (!env0[k]) { console.error(`missing key ${k}`); process.exit(2); } return env0[k]; };
const secrets = [need('CLOUDFLARE_API_TOKEN'), need('CLOUDFLARE_ACCOUNT_ID'), need('TLDRAW_LICENSE_KEY'), need('ANTHROPIC_API_KEY'), env0.ANTHROPIC_WORKSPACE_ID, env0.GEMINI_API_KEY, env0.FIREWORKS_API_KEY].filter(Boolean);
const redact = s => secrets.reduce((a, v) => a.split(v).join('***'), String(s ?? ''));
const base = { ...process.env, CLOUDFLARE_API_TOKEN: env0.CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID: env0.CLOUDFLARE_ACCOUNT_ID };

function run(cmd, args, { env = base, input, cwd = WEB } = {}) {
  const r = spawnSync(cmd, args, { cwd, env, input, encoding: 'utf8', shell: true, maxBuffer: 64 * 1024 * 1024 });
  process.stdout.write(redact(r.stdout)); process.stderr.write(redact(r.stderr));
  console.log(`[exit ${r.status}] ${cmd} ${args.filter(a => !String(a).includes('KEY')).slice(0, 4).join(' ')}`);
  return r.status;
}

if (step === 'build') {
  const env = { ...base, VITE_COACHING_DEV: 'true', VITE_TLDRAW_LICENSE_KEY: need('TLDRAW_LICENSE_KEY') };
  process.exit(run('npm', ['run', 'build', '--', '--outDir', process.argv[3] || 'dist-dev'], { env }));
} else if (step === 'deploy') {
  process.exit(run('npx', ['wrangler', 'deploy', '--config', 'wrangler.dev.jsonc', '--name', NAME,
    ...varArgs]));
} else if (step === 'secrets') {
  let code = 0;
  for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_WORKSPACE_ID', 'GEMINI_API_KEY', 'FIREWORKS_API_KEY']) {
    if (!env0[k]) { console.log(`skip ${k} (absent)`); continue; }
    code ||= run('npx', ['wrangler', 'secret', 'put', k, '--config', 'wrangler.dev.jsonc', '--name', NAME], { input: env0[k] });
  }
  process.exit(code);
} else if (step === 'dryrun') {
  process.exit(run('npx', ['wrangler', 'deploy', '--dry-run', '--config', 'wrangler.dev.jsonc', '--name', NAME, ...varArgs]));
} else if (step === 'info') {
  process.exit(run('npx', ['wrangler', 'deployments', 'list', '--config', 'wrangler.dev.jsonc', '--name', NAME]));
} else { console.error('step: build|deploy|secrets|info'); process.exit(2); }
