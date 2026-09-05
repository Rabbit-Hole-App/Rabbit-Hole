// "gmail-com" reads like a slug; the workspace shows as "Gmail".
export const wsName = (org) => ((org || '').split('-')[0] || org || '').replace(/^./, (c) => c.toUpperCase());

// Which sidebar section an app belongs to: workspace Apps, Shared, or Private.
// Private is strictly personal — a private app that has ANY shares lives in Shared
// (for the owner too, like Notion), and only unshared-private apps offer no Share button.
export const sectionOf = (a, org, email) => {
  if (a.org !== org) return 'shared';
  if (a.visibility !== 'private') return 'apps';
  const shared = (a.members?.length || 0) > 0 || (a.team_count || 0) > 0;
  return a.owner_email === email && !shared ? 'private' : 'shared';
};

// Two pages don't need a router dep: pushState + a popstate event the root listens to.
export function navigate(to) {
  window.history.pushState(null, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

// Same-origin control-plane API. Session cookie rides along; 401 → magic-link login and back.
export async function api(path, opts = {}) {
  const r = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (r.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    return new Promise(() => {}); // navigation in flight
  }
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
  if (!sqlDate) return '—';
  return parse(sqlDate).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// "2h ago" from a D1 datetime('now') string (UTC, "YYYY-MM-DD HH:MM:SS").
export function ago(sqlDate) {
  if (!sqlDate) return '—';
  const t = parse(sqlDate);
  const s = Math.max(0, (Date.now() - t.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 30 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return t.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
