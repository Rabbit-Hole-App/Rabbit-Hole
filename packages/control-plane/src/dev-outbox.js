// Dev stub email transport (owner 2026-10-09: preview invitations with authenticated dev test accounts, outbound email
// through a stub, no production credentials). On the dev control plane only - SMALL_ENV=dev and EMAIL_TRANSPORT=stub,
// both in wrangler.rabbit-hole-dev.jsonc, neither in production - sendEmail writes the message to the dev Learn media
// bucket instead of calling Resend. The messages hold invitation links and codes, so they are never echoed to whoever
// sent them (recipient-only invitations: the link is the possession proof); only a holder of the dev test secret reads
// them, through POST /test/outbox, the way /test/session mints a test person's session.
import { testMode } from './auth.js';

export const stubTransport = env => env.SMALL_ENV === 'dev' && env.EMAIL_TRANSPORT === 'stub' && !!env.LEARN_MEDIA;
const PREFIX = 'dev-outbox/';
const keyFor = to => `${PREFIX}${encodeURIComponent(String(to).toLowerCase())}/`;

export async function stubSend(env, to, subject, text) {
  const at = new Date().toISOString();
  const id = `${at.replace(/[-:.]/g, '')}-${crypto.randomUUID().slice(0, 8)}`;
  await env.LEARN_MEDIA.put(`${keyFor(to)}${id}.json`, JSON.stringify({ to: String(to).toLowerCase(), subject, text, at }), { httpMetadata: { contentType: 'application/json' } });
  return true;
}

// Constant-time string comparison, so the secret check leaks nothing through timing.
const same = (a, b) => {
  const x = new TextEncoder().encode(String(a)), y = new TextEncoder().encode(String(b));
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
};

// POST /test/outbox {secret, to} -> { messages: [{ to, subject, text, at }] }, newest first, at most 20.
// 404 unless the stub transport is on and the instance is in test mode; 401 for a wrong secret.
export async function outboxRoute(req, env) {
  if (!stubTransport(env) || !testMode(env) || !env.TEST_BYPASS_SECRET) return Response.json({ error: 'not enabled' }, { status: 404 });
  if (req.method !== 'POST') return Response.json({ error: 'POST required' }, { status: 405 });
  let body; try { body = await req.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!same(body?.secret ?? '', env.TEST_BYPASS_SECRET)) return Response.json({ error: 'bad secret' }, { status: 401 });
  if (typeof body.to !== 'string' || !body.to.includes('@')) return Response.json({ error: 'to: an email address' }, { status: 400 });
  const listed = await env.LEARN_MEDIA.list({ prefix: keyFor(body.to) });
  const keys = listed.objects.map(o => o.key).sort().reverse().slice(0, 20);
  const messages = [];
  for (const key of keys) { const o = await env.LEARN_MEDIA.get(key); if (o) messages.push(JSON.parse(await o.text())); }
  return Response.json({ messages }, { headers: { 'Cache-Control': 'no-store' } });
}
