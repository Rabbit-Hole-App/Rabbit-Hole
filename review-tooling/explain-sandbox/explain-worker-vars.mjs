// READ ONLY: prints, as one JSON line, the Motion variables of the production Worker as Cloudflare reports them (GET workers/scripts/<name>/settings)
// and the version it serves (GET workers/scripts/<name>/deployments, read with scripts/prod-release.mjs servedRelease from the checkout in the cwd).
// Run through with-cf.mjs, which puts CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment by name; nothing but these values is printed.
//   {"readable":true,"MOTION_MAX_CHARGE_USD":"5.00",...,"app_version":"...","app_sha12":"...","app_deployed_on":"..."}  or  {"readable":false,"why":"..."}
// Every request is a GET. motion-deploy.sh PO4 reads the first four keys; policy-evidence.mjs receipt reads all of them.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const NAME = "rabbit-hole-app", WANT = ["EXPLAIN_V2_ENABLED","EXPLAIN_PROGRAM_ENABLED","EXPLAIN_PROGRAM_EXECUTION_KILL","EXPLAIN_DIAGNOSTICS"];
const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account } = process.env;
const say = o => console.log(JSON.stringify(o));
const get = path => fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${NAME}/${path}`, { method: 'GET', headers: { authorization: `Bearer ${token}` } });
if (!token || !account) { say({ readable: false, why: 'no Cloudflare credentials in the environment (run through with-cf.mjs)' }); process.exit(0); }
try {
  const r = await get('settings');
  if (!r.ok) { say({ readable: false, why: `HTTP ${r.status}` }); process.exit(0); }
  const bindings = (await r.json())?.result?.bindings;
  if (!Array.isArray(bindings)) { say({ readable: false, why: 'the answer has no bindings list' }); process.exit(0); }
  const plain = Object.fromEntries(bindings.filter(b => b.type === 'plain_text' && WANT.includes(b.name)).map(b => [b.name, b.text]));
  // The served version is best effort: when it cannot be read the variables stay readable and version_why says why.
  let served = { app_version: null, app_sha12: null, app_deployed_on: null, version_why: null };
  try {
    const d = await get('deployments'), list = d.ok ? (await d.json())?.result?.deployments : null;
    if (!Array.isArray(list)) served.version_why = `deployments: HTTP ${d.status}`;
    else {
      const { servedRelease } = await import(pathToFileURL(resolve('scripts/prod-release.mjs')).href);
      const s = servedRelease(list);
      served = { app_version: s.version ?? null, app_sha12: s.sha12 ?? null, app_deployed_on: list[0]?.created_on ?? null, version_why: s.error ?? null };
    }
  } catch (error) { served.version_why = String(error.message || error).slice(0, 120); }
  say({ readable: true, ...Object.fromEntries(WANT.map(k => [k, plain[k] ?? ''])), ...served });
} catch (error) { say({ readable: false, why: String(error.message || error).slice(0, 120) }); }
