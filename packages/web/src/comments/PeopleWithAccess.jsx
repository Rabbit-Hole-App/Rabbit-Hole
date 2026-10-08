import { useCallback, useEffect, useState } from 'react';
import { MoreHorizontal, ShieldCheck, UserPlus } from 'lucide-react';
import { api } from '../api.js';
import { CommentAvatar } from './CommentsPanel.jsx';
import { displayName } from './comments-api.js';

// Share → People with access (docs/features/canvas-comments.md section 5, board 6): the owner invites by email; each member
// is a person (never an email of theirs), each pending invitation shows the address the owner typed. No invitation link is
// ever shown or copyable: only the invited address receives it. A failed send says so, with Resend.
const when = seconds => new Date(seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const REASONS = { invalid_email: "isn't an email address", already_member: 'is already a member', already_invited: 'is already invited', limited: 'has had too many invitations for now', members_full: "can't be added: this canvas has 50 people" };

export default function PeopleWithAccess({ base }) {
  const [list, setList] = useState(null);
  const [emails, setEmails] = useState('');
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState([]);
  const [menu, setMenu] = useState(null);
  const load = useCallback(() => api(`${base}/members`).then(setList, error => setNotes([error.message])), [base]);
  useEffect(() => { load(); }, [load]);
  const act = async run => { setBusy(true); setMenu(null); try { await run(); } catch (error) { setNotes([error.data?.retry_after ? "Too many invitations to this address for now. Try again later." : error.message]); } finally { setBusy(false); load(); } };
  const invite = event => {
    event.preventDefault();
    const typed = emails.split(/[\s,;]+/).filter(Boolean);
    if (!typed.length) return;
    act(async () => {
      const made = await api(`${base}/members`, { method: 'POST', body: JSON.stringify({ emails: typed }) });
      setEmails('');
      setNotes([
        ...made.invited.filter(entry => entry.email_status === 'failed').map(() => "An invitation email wasn't sent. Use Resend."),
        ...made.skipped.map(entry => `${entry.email} ${REASONS[entry.reason] || 'was skipped'}.`),
      ]);
    });
  };
  const verbs = list?.comments_enabled === false ? 'They can view.' : 'They can view and comment.';
  return (
    <div data-people-with-access className="mt-3 rounded-lg border border-line p-2.5">
      <div className="mb-2 text-sm text-ink">People with access</div>
      <form onSubmit={invite} className="flex items-center gap-1.5">
        <input aria-label="Add people by email" placeholder="Add people by email" value={emails} onChange={event => setEmails(event.target.value)}
          className="h-8 min-w-0 flex-1 rounded-md border border-line px-2 text-sm outline-none focus:border-line-strong" />
        <button type="submit" data-invite-button disabled={busy || !emails.trim()} className="flex h-8 items-center gap-1 rounded-md bg-[#2383e2] px-2.5 text-xs font-medium text-white hover:bg-[#1f74c9] disabled:opacity-40"><UserPlus size={13} />Invite</button>
      </form>
      <p className="mt-1.5 text-xs text-ink-3">{verbs} They can't edit. They'll confirm this email address before joining.</p>
      {notes.map(text => <p key={text} role="alert" className="mt-1 text-xs text-red-700">{text}</p>)}
      <ul className="mt-2 space-y-1">
        <li className="flex items-center gap-2 text-xs text-ink-2"><span className="flex-1">You</span><span>Owner</span></li>
        {list?.members.map(member => (
          <li key={member.id} data-member-row={member.status} className="flex items-center gap-2">
            {member.status === 'active' ? <CommentAvatar author={member.person} /> : <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-hover text-[11px] text-ink-3">@</span>}
            <div className="min-w-0 flex-1">
              {member.status === 'active' ? <>
                <p className="truncate text-sm text-ink">{displayName(member.person)}{member.person?.name && member.person?.handle ? <span className="text-ink-3"> · @{member.person.handle}</span> : null}</p>
                <p className="flex items-center gap-1 truncate text-[11px] text-ink-3"><ShieldCheck size={11} className="shrink-0" />verified {member.invited_email}</p>
              </> : <>
                <p className="truncate text-sm text-ink">{member.invited_email}</p>
                <p className={`truncate text-[11px] ${member.email_status === 'failed' || member.locked ? 'text-red-700' : 'text-ink-3'}`}>
                  {member.locked ? 'Locked: too many wrong codes · Resend' : member.email_status === 'failed' ? "Email wasn't sent · Resend" : member.expired ? 'Invitation expired · Resend' : `Invited · expires ${when(member.expires_at)}`}
                </p>
              </>}
            </div>
            <span className="shrink-0 text-[11px] text-ink-3">{member.status === 'active' ? (list.comments_enabled ? 'View and comment' : 'View') : ''}</span>
            <span className="relative">
              <button type="button" aria-label={`Actions for ${member.status === 'active' ? displayName(member.person) : member.invited_email}`} aria-expanded={menu === member.id} onClick={() => setMenu(open => (open === member.id ? null : member.id))}
                className="flex h-6 w-6 items-center justify-center rounded text-ink-3 hover:bg-hover hover:text-ink"><MoreHorizontal size={14} /></button>
              {menu === member.id && (
                <span role="menu" className="absolute top-7 right-0 z-10 w-44 rounded-md border border-line bg-white p-1 shadow-pop">
                  {member.status === 'pending' && <button type="button" role="menuitem" data-resend onClick={() => act(() => api(`${base}/members/${member.id}/resend`, { method: 'POST', body: '{}' }))} className="block w-full rounded px-2 py-1 text-left text-xs text-ink hover:bg-hover">Resend invitation</button>}
                  <button type="button" role="menuitem" data-remove onClick={() => act(() => api(`${base}/members/${member.id}`, { method: 'DELETE' }))} className="block w-full rounded px-2 py-1 text-left text-xs text-ink hover:bg-hover">{member.status === 'active' ? 'Remove access' : 'Cancel invitation'}</button>
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
