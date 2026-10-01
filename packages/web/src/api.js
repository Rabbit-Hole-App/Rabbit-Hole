import { learnPreview } from './flags.js';
import { isPrivateByoc, privateAuth } from './private-auth.js';
import { PREVIEW_WRITE_REFUSED, previewWriteAllowed } from './routes.js';

// "gmail-com" reads like a slug; the workspace shows as "Gmail".
export const wsName = (org) => ((org || '').split('-')[0] || org || '').replace(/^./, (c) => c.toUpperCase());

// Rabbit Hole names a workspace only by its real name. The email-domain workspace has none, so it
// reads Personal - never "Gmail" from gmail.com (user, 2026-09-28). The live build keeps wsName.
export const workspaceLabel = (name, org, preview = learnPreview) => name || (preview ? 'Personal' : wsName(org));

// Which sidebar section an app belongs to: workspace Apps, Shared, or Private.
// Private is strictly personal - a private app that has ANY shares lives in Shared
// (for the owner too, like Notion), and only unshared-private apps offer no Share button.
export const sectionOf = (a, org, email) => {
  if (a.org !== org) return 'shared';
  if (a.visibility !== 'private') return 'apps';
  const shared = (a.members?.length || 0) > 0 || (a.team_count || 0) > 0;
  return a.owner_email === email && !shared ? 'private' : 'shared';
};

// Appearance (Settings modal): 'system' | 'light' | 'dark', persisted locally.
export const getTheme = () => localStorage.getItem('small.theme') || 'system';
export function applyTheme(t) {
  const dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  window.dispatchEvent(new CustomEvent('small:theme', { detail: dark })); // embedded editors re-skin live
}

export const isDark = () => document.documentElement.classList.contains('dark');
export function setTheme(t) {
  localStorage.setItem('small.theme', t);
  applyTheme(t);
}

// Two pages don't need a router dep: pushState + a popstate event the root listens to.
export function navigate(to) {
  window.history.pushState(null, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

// Active workspace: '' = the email-domain one; custom slugs (w-*) ride a header
// on every call and the server only honours them for members.
export const getWs = () => localStorage.getItem('small.ws') || '';
export function setWs(slug) {
  if (slug) localStorage.setItem('small.ws', slug);
  else localStorage.removeItem('small.ws');
}
export const wsHeaders = () => (getWs() ? { 'X-Small-Workspace': getWs() } : {});

// Same-origin control-plane API. Session cookie rides along; 401 → magic-link login and back.
// The request api() makes - preview write refusal, private-BYOC auth, workspace header, 401 to login - with the
// raw Response returned, for a streamed body (the Tutor's NDJSON plan, LearnTutor.jsx).
export async function apiFetch(path, opts = {}) {
  // D7: the preview never writes live small-cp; the refusal reads like any other failed call (routes.js).
  if (learnPreview && (opts.method || 'GET') !== 'GET' && !previewWriteAllowed(path)) throw new Error(PREVIEW_WRITE_REFUSED);
  let authorization = {};
  if (isPrivateByoc) {
    try { authorization = await (await privateAuth()).headers(path); }
    catch (error) {
      if (error.status !== 401) throw error;
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      return new Promise(() => {});
    }
  }
  const r = await fetch(path, { ...opts, ...(isPrivateByoc ? { credentials: 'omit', redirect: 'error' } : {}),
    headers: { 'Content-Type': 'application/json', ...wsHeaders(), ...(opts.headers || {}), ...authorization } });
  if (r.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    return new Promise(() => {}); // navigation in flight
  }
  return r;
}

export async function api(path, opts = {}) {
  const r = await apiFetch(path, opts);
  const data = await r.json();
  if (!r.ok) throw Object.assign(new Error(data.error || `HTTP ${r.status}`), { status: r.status, data });
  return data;
}

const parse = (s) => new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z'); // D1 datetime or ISO

// A job can hold several crons, ';'-separated (dashboard "+" adds them).
export const cronList = (s) => String(s || '').split(';').map((x) => x.trim()).filter(Boolean);

// Human-readable cron for the common shapes; raw cron string as fallback. Cron fires in UTC.
export function cronHuman(c) {
  const [m, h, dom, , dow] = c.trim().split(/\s+/);
  const DOW = { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun' };
  const days = (d) => d.split(',').map((r) => r.split('-').map((x) => DOW[x] ?? x).join('–')).join(', ');
  const step = m.match(/^\*\/(\d+)$/);
  if (m === '*' && h === '*') return 'every minute';
  if (step && h === '*') return `every ${step[1]} min`;
  if (/^\d+$/.test(m) && h === '*') return `hourly at :${m.padStart(2, '0')}`;
  if (/^\d+$/.test(m) && /^\d+$/.test(h)) {
    const t = `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
    if (dow !== '*') return `${t} ${days(dow)}`;
    if (dom !== '*') return `${t} day ${dom}`;
    return `daily ${t}`;
  }
  return c;
}

// "Sep 4, 14:32" local time from a D1 datetime('now') string (UTC).
export function fmtTime(sqlDate) {
  if (!sqlDate) return '-';
  return parse(sqlDate).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// "2h ago" from a D1 datetime('now') string (UTC, "YYYY-MM-DD HH:MM:SS").
export function ago(sqlDate) {
  if (!sqlDate) return '-';
  const t = parse(sqlDate);
  const s = Math.max(0, (Date.now() - t.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 30 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return t.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
