import { useEffect, useState } from 'react';
import { Button } from '../ui.jsx';
import { PRODUCT } from '../flags.js';
import { CommentAvatar } from './CommentsPanel.jsx';
import { displayName } from './comments-api.js';

// /i: a canvas invitation (docs/features/canvas-comments.md section 6, screens a-k). The token arrives in the address's
// fragment, which no server, log or Referer ever sees; it moves to this tab's session storage at once and leaves the
// address. Joining always confirms the invited address with a fresh code sent there, whoever is signed in.
const KEY = 'rh_invite';
export function takeInviteToken(location, history, storage) {
  const fragment = location.hash.replace(/^#/, '');
  try {
    if (/^[A-Za-z0-9_-]{20,64}$/.test(fragment)) storage.setItem(KEY, fragment);
    if (location.hash) history.replaceState(null, '', '/i');
    return storage.getItem(KEY);
  } catch { return /^[A-Za-z0-9_-]{20,64}$/.test(fragment) ? fragment : null; }
}
const forget = () => { try { sessionStorage.removeItem(KEY); } catch { /* nothing kept */ } };

// The server's retry_after, rendered; never a fixed duration (C5).
export function waitText(seconds) {
  const s = Math.max(1, Math.ceil(seconds));
  if (s < 60) return `${s} second${s === 1 ? '' : 's'}`;
  if (s < 3600) { const m = Math.ceil(s / 60); return `${m} minute${m === 1 ? '' : 's'}`; }
  const h = Math.ceil(s / 3600); return `${h} hour${h === 1 ? '' : 's'}`;
}
const clock = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

async function post(action, body) {
  const response = await fetch(`/api/learn/invites/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, ...data };
}

const Frame = ({ children }) => (
  <main className="grid min-h-screen place-items-center bg-white p-6">
    <div data-invite className="w-full max-w-md rounded-xl border border-line p-6 shadow-sm">
      <a href="/" className="mb-5 flex items-center gap-2 no-underline"><img src="/landing/favicon-32-v1.png" alt="" width="20" height="20" className="h-5 w-5 rounded-sm" /><span className="text-sm font-semibold text-ink">{PRODUCT}</span></a>
      {children}
    </div>
  </main>
);
const Home = () => <Button variant="secondary" onClick={() => { window.location.href = '/'; }}>Go to {PRODUCT}</Button>;
const Open = ({ url }) => <Button variant="primary" onClick={() => { window.location.href = url; }}>Open canvas</Button>;
const who = account => (account?.name && account?.handle ? `${account.name} · @${account.handle}` : displayName(account));

export default function InvitePage() {
  const [token] = useState(() => takeInviteToken(window.location, window.history, sessionStorage));
  const [invite, setInvite] = useState(null);
  const [screen, setScreen] = useState(token ? 'loading' : 'missing');
  const [note, setNote] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const [joined, setJoined] = useState(null);
  useEffect(() => {
    if (!token) return;
    post('preview', { token }).then(data => {
      if (!data.ok) { setScreen('invalid'); forget(); return; }
      setInvite(data);
      setScreen(data.state === 'locked' ? 'locked' : !data.signed_in ? 'signin' : data.owner_self ? 'owner' : data.already_member ? 'member' : 'account');
    }, () => setScreen('invalid'));
  }, [token]);
  useEffect(() => {
    if (wait <= 0) return undefined;
    const timer = setTimeout(() => setWait(left => left - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const answer = data => {
    if (data.code === 'invite_invalid') { forget(); setScreen('invalid'); return; }
    if (data.code === 'sign_in') { setScreen('signin'); return; }
    if (data.code === 'owner_self') { setScreen('owner'); return; }
    if (data.code === 'already_member') { setInvite(current => ({ ...current, url: data.url })); setScreen('member'); return; }
    if (data.code === 'too_many_tries' && screen === 'account') { setScreen('locked'); return; }
    if (data.code === 'too_many_codes') setNote(`Too many codes requested. Try again in ${waitText(data.retry_after)}.`);
    else if (data.code === 'limited') setNote(`Too many emails to this address for now. Try again in ${waitText(data.retry_after)}.`);
    else if (data.code === 'email_unavailable') setNote(`We couldn't send the code. Try again in ${waitText(data.retry_after)}.`);
    else setNote(data.error || 'Something went wrong. Try again.');
    if (data.retry_after) setWait(Math.ceil(data.retry_after));
  };
  const sendCode = async () => {
    setBusy(true); setNote(null); setCode('');
    const data = await post('code', { token }).catch(() => ({ error: "We couldn't reach Rabbit Hole. Check your connection." }));
    setBusy(false);
    if (data.sent) { setScreen('code'); setWait(data.retry_after || 60); return; }
    answer(data);
  };
  const confirm = async () => {
    setBusy(true); setNote(null);
    const data = await post('accept', { token, code }).catch(() => ({ error: "We couldn't reach Rabbit Hole. Check your connection." }));
    setBusy(false);
    if (data.joined) { forget(); setJoined(data.url); setScreen('joined'); return; }
    if (data.code === 'code_wrong') { setNote(`That code isn't right. ${data.tries_left} ${data.tries_left === 1 ? 'try' : 'tries'} left.`); setScreen('wrong'); return; }
    if (data.code === 'too_many_tries') { setNote('Too many tries. Send a new code.'); setScreen('spent'); return; }
    if (data.code === 'code_expired') { setNote('This code has expired. Codes last 10 minutes.'); setScreen('expired'); return; }
    if (data.code === 'code_needed') { setScreen('account'); return; }
    answer(data);
  };
  const cancel = async () => {
    await post('cancel', { token }).catch(() => {});
    forget();
    window.location.href = '/';
  };

  if (screen === 'loading') return <Frame><p className="text-sm text-ink-2">Opening the invitation…</p></Frame>;
  if (screen === 'missing') return <Frame><h1 className="mb-2 text-lg font-semibold text-ink">Open the invitation link from your email again.</h1><Home /></Frame>;
  const inviter = displayName(invite?.inviter);
  if (screen === 'invalid') return <Frame><h1 className="mb-2 text-lg font-semibold text-ink">This invitation is no longer valid.</h1><p className="mb-4 text-sm text-ink-2">The owner cancelled it, it expired, or a newer one was sent. Ask {invite ? inviter : 'the owner'} for a new invitation.</p><Home /></Frame>;
  if (screen === 'locked') return <Frame><h1 className="mb-2 text-lg font-semibold text-ink">Too many wrong codes for this invitation.</h1><p className="mb-4 text-sm text-ink-2">Ask {inviter} to resend it.</p><Home /></Frame>;
  const verb = invite.comments_enabled ? 'view and comment on' : 'view';
  const title = <strong className="text-ink">{invite.title}</strong>;
  if (screen === 'owner') return <Frame><h1 className="mb-4 text-lg font-semibold text-ink">This is your canvas. Invitations are for the people you invite.</h1>{invite.url && <Open url={invite.url} />}</Frame>;
  if (screen === 'member') return <Frame><h1 className="mb-2 text-lg font-semibold text-ink">You already have access.</h1><p className="mb-4 text-sm text-ink-2">{who(invite.account)} can already {verb} {title}.</p>{invite.url && <Open url={invite.url} />}</Frame>;
  if (screen === 'joined') return <Frame><h1 className="mb-2 text-lg font-semibold text-ink">You've joined {invite.title}.</h1><p className="mb-4 text-sm text-ink-2">{who(invite.account)} can now view the canvas{invite.comments_enabled ? ' and comment on it' : ''}. You can't edit it.</p><Open url={joined} /></Frame>;
  const header = <p className="mb-4 text-sm text-ink-2">{inviter} invited you to {verb} {title}.</p>;
  if (screen === 'signin') return (
    <Frame>{header}
      <p className="mb-4 text-sm text-ink-2">Sent to <span data-masked className="text-ink">{invite.masked_email}</span></p>
      <Button variant="primary" onClick={() => { window.location.href = '/sign-in?next=/i'; }}>Sign in to continue</Button>
      <p className="mt-3 text-xs text-ink-3">Use any sign-in method. You'll confirm this email address next.</p>
    </Frame>
  );
  const account = (
    <div data-invite-account className="mb-4 rounded-lg border border-line p-3">
      <p className="mb-2 text-xs font-medium text-ink-2">Who gets access</p>
      <div className="flex items-center gap-2"><CommentAvatar author={invite.account} size="h-8 w-8" /><div><p className="text-sm text-ink">{who(invite.account)}</p><p className="text-xs text-ink-3">Signed in with {invite.account?.provider_label}</p></div></div>
    </div>
  );
  if (screen === 'account') return (
    <Frame>{header}{account}
      <p className="mb-4 text-sm text-ink-2">{inviter}'s invitation was sent to {invite.masked_email}. We'll email a code there to confirm it's yours.</p>
      {note && <p role="alert" className="mb-3 text-sm text-red-700">{note}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" data-send-code disabled={busy || wait > 0} onClick={sendCode}>Send code to {invite.masked_email}</Button>
        <Button variant="ghost" onClick={cancel}>Cancel</Button>
      </div>
      <p className="mt-3 text-xs text-ink-3">Not you? <a href="/logout" className="text-ink-2 underline">Switch account</a></p>
    </Frame>
  );
  // c, d, e and the spent code: the code entry, with Resend mirroring the server's own gap.
  const entry = screen === 'code' || screen === 'wrong';
  return (
    <Frame>{header}
      <p className="mb-3 text-sm text-ink-2">{screen === 'code' ? `We sent a new 6-digit code to ${invite.masked_email}. Earlier codes no longer work.` : note}</p>
      {entry && (
        <form onSubmit={event => { event.preventDefault(); if (code.length === 6) confirm(); }}>
          <input aria-label="6-digit code" data-code-input inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6} value={code}
            onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            className={`mb-2 h-12 w-full rounded-lg border px-3 text-center font-mono text-2xl tracking-[0.6em] outline-none ${screen === 'wrong' ? 'border-red-500 text-red-700' : 'border-line-strong focus:border-accent'}`} />
          <p className="mb-3 text-xs text-ink-3">Joining as {who(invite.account)} · expires in 10 minutes</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" type="submit" data-confirm-join disabled={busy || code.length !== 6}>Confirm and join</Button>
            <Button variant="ghost" type="button" disabled={busy || wait > 0} onClick={sendCode}>{wait > 0 ? `Resend code in ${clock(wait)}` : 'Resend code'}</Button>
            <Button variant="ghost" type="button" onClick={cancel}>Cancel</Button>
          </div>
        </form>
      )}
      {!entry && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" disabled={busy || wait > 0} onClick={sendCode}>{wait > 0 ? `Send a new code in ${clock(wait)}` : 'Send a new code'}</Button>
          <Button variant="ghost" onClick={cancel}>Cancel</Button>
        </div>
      )}
    </Frame>
  );
}
