// READ-ONLY: GET worker settings; prints only binding names matching INTERACT_* and plain-text values of those. No writes.
import { readFileSync } from 'node:fs';
const env = readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8');
const g = k => (env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1] || '').trim().replace(/^['"]|['"]$/g, '');
const H = { Authorization: `Bearer ${g('CLOUDFLARE_API_TOKEN')}` }, A = 'c08d3dbdc53a3afd3cb09a536ac42318';
for (const name of ['rabbit-hole-app']) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${A}/workers/scripts/${name}/settings`, { headers: H });
  const j = await r.json().catch(() => ({}));
  console.log(name, 'HTTP', r.status, 'success', j.success, (j.errors || []).map(e => e.message).join('; ').slice(0, 200));
  const b = j.result?.bindings || [];
  console.log('bindings total', b.length);
  for (const x of b.filter(x => /^INTERACT_/.test(x.name))) console.log(' ', x.name, x.type, x.type === 'plain_text' ? JSON.stringify(x.text) : '(value hidden)');
  console.log('has INTERACT_DESCRIPTION_FIT:', b.some(x => x.name === 'INTERACT_DESCRIPTION_FIT'));
}
