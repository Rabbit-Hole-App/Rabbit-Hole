// Poll (GET only) until the stable preview serves the new shared program read, i.e. the b7a0b2e85 deploy is live. Credentials by NAME, never printed.
import fs from 'node:fs';
const env = fs.readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8');
const get = n => (env.match(new RegExp(`^${n}=(.*)$`, 'm')) || [])[1]?.trim().replace(/^['"]|['"]$/g, '');
const h = { 'CF-Access-Client-Id': get('ACCESS_SMOKE_CLIENT_ID'), 'CF-Access-Client-Secret': get('ACCESS_SMOKE_CLIENT_SECRET') };
const url = 'https://preview.digrabbithole.com/api/learn/boards/shared/<SHARE_TOKEN>/cards/card-sandbox-ex1-b/program';
const t0 = Date.now();
for (;;) {
  const r = await fetch(url, { headers: h, redirect: 'manual' }); const body = await r.json().catch(() => null);
  console.log(new Date().toISOString(), r.status, body ? Object.keys(body).join(',') : '');
  if (r.status === 200 && body?.artifact) { console.log('LIVE: shared program read answers 200'); break; }
  if (Date.now() - t0 > 30 * 60 * 1000) { console.log('TIMEOUT waiting for the deploy'); process.exit(2); }
  await new Promise(res => setTimeout(res, 20000));
}
