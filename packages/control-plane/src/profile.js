// A person's own profile (Settings > Profile, user 2026-09-30): the display name and PNG picture they
// chose, kept in LEARN_DB user_profiles by account principal, and their public handle (user_handles, migration 0008,
// docs/features/user-handles.md) and public description (user_profile_descriptions, learn migration 0013,
// docs/features/creator-profile.md). Served by the dev worker (the app's origin), like canvases; only the signed-in
// owner reads or writes their row. The browser sees one profile: { name, avatar, handle, description } and, for a signed-in
// account, emailPreferences (docs/features/signup-email-preferences.md: kept in the main D1 by the account, never by request body).
import { repositoryIdentity } from './repositories.js';
import { normalizeHandle } from './handle.js';
import { validateEmailPreferences } from './email-preferences.js';
import { emailPreferenceView, saveEmailPreferences } from './email-preferences-store.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export const NAME_MAX = 60;
export const AVATAR_MAX = 200_000; // characters of the data URL (a 256px PNG is far below this)
export const DESCRIPTION_MAX = 160;
const PNG_DATA_URL = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/;
const PROFILE = 'SELECT p.name, p.avatar, h.handle, d.description FROM user_profiles p LEFT JOIN user_handles h ON h.email = p.email LEFT JOIN user_profile_descriptions d ON d.email = p.email WHERE p.email=?';

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
  if (Object.hasOwn(body || {}, 'description')) {
    if (body.description !== null && typeof body.description !== 'string') return { error: 'description must be text' };
    // Plain text on one line: line breaks, tabs and control characters become single spaces. It is shown as text,
    // never as HTML or a link, so markup is kept as typed and renders literally.
    const description = String(body.description ?? '').replace(/[\s\u0000-\u001f\u007f]+/g, ' ').trim();
    if (description.length > DESCRIPTION_MAX) return { error: `description must be at most ${DESCRIPTION_MAX} characters` };
    out.description = description || null;
  }
  if (Object.hasOwn(body || {}, 'handle')) {
    const checked = normalizeHandle(body.handle);
    if (checked.error) return checked;
    out.handle = checked.handle;
  }
  if (Object.hasOwn(body || {}, 'emailPreferences')) {
    const checked = validateEmailPreferences(body.emailPreferences);
    if (checked.error) return checked;
    out.emailPreferences = checked.value;
  }
  if (!Object.keys(out).length) return { error: 'nothing to update' };
  return { value: out };
}

// The signed-in account's email choices for the response, or nothing: no account id (a CLI token), or the table not applied yet,
// leaves the profile exactly as it was.
const emailView = async (env, user) => {
  if (!user.userId) return {};
  try { return { emailPreferences: await emailPreferenceView(env, user.userId) }; } catch { return {}; }
};

export const profileRoute = url => url.pathname === '/api/profile';

export async function profileFetch(req, env) {
  const user = await repositoryIdentity(req, env);
  if (user instanceof Response) return user;
  const db = env.LEARN_DB;
  if (req.method === 'GET') {
    const row = await db.prepare(PROFILE).bind(user.email).first();
    return json({ name: row?.name ?? null, avatar: row?.avatar ?? null, handle: row?.handle ?? null, description: row?.description ?? null, ...(await emailView(env, user)) });
  }
  if (req.method !== 'PUT') return json({ error: 'Method not allowed' }, 405);
  if (req.headers.has('origin') && req.headers.get('origin') !== new URL(req.url).origin) return json({ error: 'Invalid origin' }, 403);
  let body;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const input = validateProfile(body);
  if (input.error) return json({ error: input.error }, 400);
  if (input.value.emailPreferences && !user.userId) return json({ error: 'Email choices need a signed-in account.' }, 409); // before any write
  const current = await db.prepare(PROFILE).bind(user.email).first();
  const { handle, description, emailPreferences, ...fields } = input.value;
  const next = { name: current?.name ?? null, avatar: current?.avatar ?? null, handle: current?.handle ?? null, description: current?.description ?? null, ...fields };
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
  if (description !== undefined) {
    // Its own row, by reference to the profile row (a foreign key): an empty description deletes it.
    await db.prepare('INSERT INTO user_profiles (email) VALUES (?) ON CONFLICT(email) DO NOTHING').bind(user.email).run();
    if (description) await db.prepare('INSERT INTO user_profile_descriptions (email, description) VALUES (?, ?) ON CONFLICT(email) DO UPDATE SET description=excluded.description').bind(user.email, description).run();
    else await db.prepare('DELETE FROM user_profile_descriptions WHERE email=?').bind(user.email).run();
    next.description = description;
  }
  if (Object.keys(fields).length) {
    await db.prepare("INSERT INTO user_profiles (email, name, avatar, updated_at) VALUES (?, ?, ?, datetime('now')) ON CONFLICT(email) DO UPDATE SET name=excluded.name, avatar=excluded.avatar, updated_at=excluded.updated_at")
      .bind(user.email, next.name, next.avatar).run();
  }
  if (emailPreferences) {
    // Last, after the handle: a taken handle changed nothing. The account is the session's, never the body's. The pair is one
    // statement (whole or not at all). A failure is loud (the choice is not silently dropped) and the retry recovers: the handle is
    // already this account's, so the pair is saved again, with the values the retry carries; it replaces an earlier onboarding row
    // and never a Settings change or an unsubscribe made since.
    try { await saveEmailPreferences(env, user.userId, emailPreferences); }
    catch { return json({ error: 'Your email choices could not be saved. Try again.' }, 503); }
  }
  return json({ ...next, ...(await emailView(env, user)) });
}
