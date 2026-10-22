// Builds nothing; deploys Lane D's render clone (render/wrangler.jsonc, rabbit-hole-web-dev-explain-d) and sets its
// bearer token. Run from packages/web after `npm run build -- --outDir dist-render`.
// Cloudflare credentials come by name from the canonical credentials file and are never printed.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const ENV_FILE = 'C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', TOKEN_FILE = 'C:/s/toc-explain-d/render-token';
const keys = {};
for (const line of readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
  const m = /^\s*(CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID)\s*=\s*(.*)\s*$/.exec(line);
  if (m) keys[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
}
if (!keys.CLOUDFLARE_API_TOKEN) throw new Error('CLOUDFLARE_API_TOKEN missing from the credentials file');
mkdirSync('C:/s/toc-explain-d', { recursive: true });
if (!existsSync(TOKEN_FILE)) writeFileSync(TOKEN_FILE, randomBytes(24).toString('hex'));
const env = { ...process.env, ...keys };
const wrangler = args => execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['wrangler', ...args], { env, stdio: ['pipe', 'inherit', 'inherit'], shell: process.platform === 'win32', input: args[0] === 'secret' ? readFileSync(TOKEN_FILE, 'utf8').trim() : undefined });
wrangler(['deploy', '--config', 'render/wrangler.jsonc', '--name', 'rabbit-hole-web-dev-explain-d']);
wrangler(['secret', 'put', 'RENDER_DEV_TOKEN', '--config', 'render/wrangler.jsonc', '--name', 'rabbit-hole-web-dev-explain-d']);
console.log('deployed rabbit-hole-web-dev-explain-d');
