// Runs a command with CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID taken BY NAME from the owner credentials file.
// The values are never printed or logged. Usage: node with-cf.mjs <cwd> <cmd> [args...]
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const ENV_FILE = 'C:/Users/cyudhist/Desktop/workspace/small-deploy/.env';
const text = readFileSync(ENV_FILE, 'utf8');
const env = { ...process.env };
for (const name of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']) {
  const m = text.match(new RegExp(`^${name}=(.*)$`, 'm'));
  if (!m) { console.error(`${name} is missing from the credentials file`); process.exit(2); }
  env[name] = m[1].trim().replace(/^['"]|['"]$/g, '');
}
const [cwd, cmd, ...args] = process.argv.slice(2);
const WR = "C:/Users/cyudhist/Desktop/workspace/credits-2500/node_modules/wrangler/bin/wrangler.js";
const r = cmd === "wrangler" ? spawnSync(process.execPath, [WR, ...args], { cwd, env, stdio: "inherit" }) : spawnSync(cmd, args, { cwd, env, stdio: "inherit", shell: process.platform === "win32" });
process.exit(r.status ?? 1);
