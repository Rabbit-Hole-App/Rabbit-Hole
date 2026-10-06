// A person's own profile (Settings > Profile, user 2026-09-30): the display name and PNG picture they
// chose, kept in LEARN_DB user_profiles by account principal, and their public handle (user_handles, migration 0008,
// docs/features/user-handles.md). Served by the dev worker (the app's origin), like canvases; only the signed-in
// owner reads or writes their row. The browser sees one profile: { name, avatar, handle }.
import { repositoryIdentity } from './repositories.js';
import { normalizeHandle } from './handle.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export const NAME_MAX = 60;
export const AVATAR_MAX = 200_000; // characters of the data URL (a 256px PNG is far below this)
const PNG_DATA_URL = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/;

// { value } or { error }: name is trimmed text (empty clears it); avatar is a PNG data URL or null.
export function validateProfile(body) {
  const out = {};
  if (Object.hasOwn(body || {}, 'name')) {
    if (body.name !== null && typeof body.name !== 'string') return { error: 'name must be text' };
    const name = String(body.name ?? '').replace(/\s+/g, ' ').trim();
    if (name.length > NAME_MAX) return { error: `name must be at most ${NAME_MAX} characters` };
    out.name = name || null;
  }
  if (Object.hasOwn(body || {}, 'avatar')) {
    if (body.avatar !== null && (typeof body.avatar !== 'string' || !PNG_DATA_URL.test(body.avatar))) return { error: 'avatar must be a PNG image' };
    if (body.avatar && body.avatar.length > AVATAR_MAX) return { error: 'avatar is too large' };
    out.avatar = body.avatar;
  }
  if (Object.hasOwn(body || {}, 'handle')) {
    const checked = normalizeHandle(body.handle);
    if (checked.error) return checked;
    out.handle = checked.handle;
  }
  if (!Object.keys(out).length) return { error: 'nothing to update' };
  return { value: out };
}

export const profileRoute = url => url.pathname === '/api/profile';

export async function profileFetch(req, env) {
  const user = await repositoryIdentity(req, env);
  if (user instanceof Response) return user;
  const db = env.LEARN_DB;
  if (req.method === 'GET') {
    const row = await db.prepare('SELECT p.name, p.avatar, h.handle FROM user_profiles p LEFT JOIN user_handles h ON h.email = p.email WHERE p.email=?').bind(user.email).first();
    return json({ name: row?.name ?? null, avatar: row?.avatar ?? null, handle: row?.handle ?? null });
  }
  if (req.method !== 'PUT') return json({ error: 'Method not allowed' }, 405);
  if (req.headers.has('origin') && req.headers.get('origin') !== new URL(req.url).origin) return json({ error: 'Invalid origin' }, 403);
  let body;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const input = validateProfile(body);
  if (input.error) return json({ error: input.error }, 400);
  const current = await db.prepare('SELECT p.name, p.avatar, h.handle FROM user_profiles p LEFT JOIN user_handles h ON h.email = p.email WHERE p.email=?').bind(user.email).first();
  const { handle, ...fields } = input.value;
  const next = { name: current?.name ?? null, avatar: current?.avatar ?? null, handle: current?.handle ?? null, ...fields };
  if (handle !== undefined && handle !== next.handle) {
    // The handle first, so a taken one changes nothing. One statement claims or changes it; the UNIQUE (NOCASE) index
    // is the authority, so of two people claiming the same handle at once exactly one gets it.
    await db.prepare('INSERT INTO user_profiles (email) VALUES (?) ON CONFLICT(email) DO NOTHING').bind(user.email).run();
    try { await db.prepare('INSERT INTO user_handles (email, handle) VALUES (?, ?) ON CONFLICT(email) DO UPDATE SET handle=excluded.handle').bind(user.email, handle).run(); }
    catch (error) {
      if (/UNIQUE/i.test(error.message)) return json({ error: `@${handle} is taken. Choose another.`, taken: true }, 409);
      throw error;
    }
    next.handle = handle;
  }
  if (Object.keys(fields).length) {
    await db.prepare("INSERT INTO user_profiles (email, name, avatar, updated_at) VALUES (?, ?, ?, datetime('now')) ON CONFLICT(email) DO UPDATE SET name=excluded.name, avatar=excluded.avatar, updated_at=excluded.updated_at")
      .bind(user.email, next.name, next.avatar).run();
  }
  return json(next);
}
