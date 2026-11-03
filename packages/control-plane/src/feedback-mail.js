// The owner's email for a stored feedback report (docs/features/learn-feedback.md "Email to the owner"). The report is already kept
// in Learn media (learn-feedback.js); the app Worker has no RESEND_API_KEY, so it asks this control plane, with the sender's own
// session, to mail the report it just stored. Only the key crosses: the mail is built from the stored object, never from what the
// caller sends, and only for the caller's own recent report. The recipient is FEEDBACK_NOTIFY_TO (a plain var); empty = no mail.
import { learnMedia } from './learn-storage.js';

const KEY = /^learn-feedback\/\d{4}-\d{2}-\d{2}\/[\w.:-]+\.json$/;
const REF = /^RH-[0-9A-Z]{4}-[0-9A-Z]{4}$/;
const ADDRESS = /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/;
const FRESH_MS = 10 * 60 * 1000; // a replay of an old key cannot mail again
const TITLES = { bug: 'Bug report', idea: 'Feature suggestion' };
const PROVIDERS = { google: 'Google sign-in', email: 'emailed sign-in', github: 'GitHub profile, not verified' };

// One line, no control characters: safe in a subject, a header value or a "label: value" row.
const line = (value, max = 300) => Array.from(String(value ?? ''), char => (char.charCodeAt(0) < 32 || [127, 8232, 8233].includes(char.charCodeAt(0)) ? ' ' : char)).join('').replace(/ {2,}/g, ' ').trim().slice(0, max);
export const deliverable = value => typeof value === 'string' && value.length <= 254 && ADDRESS.test(value) && !value.toLowerCase().endsWith('.invalid');

// A share link's token is a capability: the mail names the page, not the token.
const pathOf = value => line(value).replace(/(\/b\/)[^/?#\s]+/g, '$1[token]');

export function composeFeedbackMail(report, key) {
  const title = TITLES[report.kind] || 'Feedback';
  const ref = REF.test(report.ref) ? report.ref : '';
  const contact = report.contact && deliverable(report.contact.email) ? report.contact : null;
  const context = report.context || {};
  const ids = report.diagnostics ? [['errors', report.diagnostics.fingerprints], ['failed requests', report.diagnostics.traces]]
    .filter(([, list]) => list?.length).map(([name, list]) => `${name} ${list.map(id => line(id, 16)).join(' ')}`).join('; ') : '';
  const rows = [
    ['Kind', title], ['Reference', ref || 'none'], ['Received', line(report.at, 40)], null,
    String(report.text ?? ''), null,
    ['From', report.handle ? `@${line(report.handle, 40)}` : 'no handle chosen'],
    ['Contact', contact ? `${contact.email} (${contact.verified ? 'verified' : 'not verified'}${PROVIDERS[contact.provider] ? `: ${PROVIDERS[contact.provider]}` : ''})` : 'no deliverable address on file'],
    ['Account', line(report.userId, 40) || 'unknown'],
    ['Page', pathOf(context.path) || 'unknown'], ['App', line(report.app, 100) || 'none (Home, Library or Explore)'], ['Board', line(context.board, 100) || 'none'],
    ['Screen', line(context.viewport, 40) || 'unknown'], ['Browser', line(context.userAgent) || 'unknown'],
    ['Diagnostics', ids || 'none'], ['Stored at', line(key, 200)],
  ];
  const text = rows.map(row => (row === null ? '' : Array.isArray(row) ? `${row[0]}: ${row[1]}` : row)).join('\n');
  // Reply-To only for an address the sign-in verified: a reply reaches the person, never a made-up address.
  return { subject: `[Rabbit Hole] ${title}${ref ? ` ${ref}` : ''}`, text, replyTo: contact?.verified ? contact.email : null };
}

// POST /api/feedback/notify {key}, mounted in index.js after the session is resolved (user.uid is the verified session user).
export async function feedbackNotify(req, env, user, { sendEmail, now = Date.now() }) {
  const reply = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  if (!deliverable(env.FEEDBACK_NOTIFY_TO)) return reply({ sent: false, reason: 'not_configured' });
  let key;
  try { ({ key } = await req.json()); } catch { /* answered below */ }
  if (typeof key !== 'string' || !KEY.test(key)) return reply({ error: 'Invalid report' }, 400);
  const media = learnMedia(env);
  let report;
  try { report = await (await media?.get(key))?.json(); } catch { report = null; }
  if (!report) return reply({ error: 'Report not found' }, 404);
  if (!user?.uid || report.userId !== user.uid) return reply({ error: 'Not your report' }, 403);
  if (!(now - Date.parse(report.at) < FRESH_MS)) return reply({ sent: false, reason: 'stale' }, 409);
  const mail = composeFeedbackMail(report, key);
  // The report id is the idempotency key: Resend drops a repeat of the same report.
  let sent = false;
  try { sent = await sendEmail(env, env.FEEDBACK_NOTIFY_TO, mail.subject, mail.text, { idempotencyKey: `feedback-${line(report.id, 64)}`, replyTo: mail.replyTo }); } catch { /* answered below */ }
  return reply({ sent: Boolean(sent) }, sent ? 200 : 502);
}
