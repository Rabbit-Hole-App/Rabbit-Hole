// READ ONLY (GET): the version the dev clone serves and the tag/message on it. Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment.
//   node preview-readback.mjs <worker name> <candidate sha>      exit 0 only if workers/tag is the 12-char sha and workers/message is the full sha
const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account } = process.env;
const [name, want, ...rest] = process.argv.slice(2);
const varName = rest[0] === '--var' ? rest[1] : null;
if (!token || !account || !name || !/^[0-9a-f]{40}$/.test(want || '')) { console.log('usage: preview-readback.mjs <worker> <40-hex sha> (credentials in the environment)'); process.exit(2); }
const get = async path => {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${name}/${path}`, { headers: { authorization: `Bearer ${token}` } });
  const body = await r.json().catch(() => null);
  if (!r.ok || body?.success === false) throw new Error(`GET ${path}: HTTP ${r.status}`);
  return body.result;
};
try {
  const top = (await get('deployments')).deployments[0], id = top.versions[0].version_id;
  // The tag is exposed on the VERSION object (GET versions/<id> annotations), not on the deployment annotations, which carry only the message.
  const note = (await get(`versions/${id}`)).annotations ?? {};
  console.log(`READBACK served version ${id} (${top.versions[0].percentage}%): workers/tag=${note['workers/tag'] ?? 'none'} workers/message=${note['workers/message'] ?? 'none'}`);
  const ok = note['workers/tag'] === want.slice(0, 12) && note['workers/message'] === want;
  console.log(ok ? 'READBACK OK: the SHA tag and message are on the served version' : 'READBACK MISMATCH: the served version does not carry the candidate SHA tag and message');
  if (varName) {
    // The worker's plain-text binding (GET settings); a secret binding prints its type only, never a value.
    const binding = (await get('settings')).bindings?.find(b => b.name === varName);
    console.log(binding ? `READBACK VAR ${varName}=${binding.type === 'plain_text' ? binding.text : `(${binding.type}, value not read)`}` : `READBACK VAR ${varName} is not set`);
  }
  process.exitCode = ok ? 0 : 1; // not process.exit: on Windows it can crash node while fetch connections close
} catch (e) { console.log(`READBACK FAILED: ${e.message}`); process.exitCode = 1; }
