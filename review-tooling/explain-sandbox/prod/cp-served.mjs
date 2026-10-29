// READ ONLY GET: the version the production control plane (rabbit-hole-cp) serves, read with scripts/prod-release.mjs servedRelease from the checkout in the cwd.
// Run through with-cf.mjs (credentials by name). Prints one JSON line: {"readable":true,"cp_version":"...","cp_sha12":"..."} or {"readable":false,"why":"..."}.
// explain-worker-vars.mjs reads the app Worker; this is the same read for the control plane, so the emergency rollback can restore the released PAIR.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account } = process.env;
const say = o => console.log(JSON.stringify(o));
if (!token || !account) { say({ readable: false, why: 'no Cloudflare credentials in the environment (run through with-cf.mjs)' }); process.exit(0); }
try {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/rabbit-hole-cp/deployments`, { method: 'GET', headers: { authorization: `Bearer ${token}` } });
  const list = r.ok ? (await r.json())?.result?.deployments : null;
  if (!Array.isArray(list)) { say({ readable: false, why: `deployments: HTTP ${r.status}` }); process.exit(0); }
  const { servedRelease } = await import(pathToFileURL(resolve('scripts/prod-release.mjs')).href);
  const s = servedRelease(list);
  say({ readable: true, cp_version: s.version ?? null, cp_sha12: s.sha12 ?? null, why: s.error ?? null });
} catch (error) { say({ readable: false, why: String(error.message || error).slice(0, 120) }); }
