import { useEffect, useRef, useState } from 'react';
import { Ban } from 'lucide-react';
import { api } from '../api.js';
import { displayName } from './comments-api.js';

// The owner's comment settings in the Share dialog (docs/features/canvas-comments.md section 4), each mapped to a server setting:
//   Share tab    link_comments     Hidden / View only / Allow comments for visitors with the share link (owner decision
//                                  2026-10-22; C:/s/spec/embed/permanent-link-note.md section 2, enforced on the server).
//   Share tab    comments_enabled  View only (false) / Allow comments (true), for the people the owner invites.
//   Explore tab  public_mode       Hidden (off) / View only (closed) / Allow comments (open), once published; independent of
//                                  the link's setting; disabled while comments_enabled is false.
// ONE place knows the server's names for the link's state:
const LINK_MODES = ['hidden', 'view', 'allow'];
const linkMode = settings => (LINK_MODES.includes(settings?.link_comments) ? settings.link_comments : 'hidden');
const linkPatch = mode => ({ link_comments: mode });
// The value shown is the pending one while a save is in flight and goes back to the server's last answer when it fails.
export function useCommentSettings(base, published) {
  const [settings, setSettings] = useState(null);
  const [pending, setPending] = useState(null);
  const [error, setError] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const seq = useRef(0);
  useEffect(() => {
    if (!base) return undefined;
    const mine = ++seq.current;
    setSettings(null); setPending(null); setError(null); setBlocks([]);
    api(`${base}/blocks`).then(data => { if (mine === seq.current) setBlocks(data.blocks); }, () => {});
    return () => { seq.current++; };
  }, [base]);
  useEffect(() => {
    if (!base) return undefined;
    let live = true;
    api(base).then(about => { if (live) setSettings({ comments_enabled: about.comments_enabled, public_mode: about.public_mode, link_comments: linkMode(about) }); }, failure => { if (live) setError(failure.message); });
    return () => { live = false; };
  }, [base, published]);
  const save = async patch => {
    const mine = ++seq.current;
    setPending(patch); setError(null);
    try {
      const next = await api(`${base}/comment-settings`, { method: 'PUT', body: JSON.stringify(patch) });
      if (mine === seq.current) setSettings(previous => ({ ...previous, ...patch, ...next, ...(next?.link_comments ? { link_comments: linkMode(next) } : {}) }));
    } catch (failure) { if (mine === seq.current) setError(failure.message); } finally { if (mine === seq.current) setPending(null); }
  };
  const unblock = async id => { try { setBlocks((await api(`${base}/blocks/${id}`, { method: 'DELETE' })).blocks); } catch (failure) { setError(failure.message); } };
  return { on: !!base, ready: !!settings, value: settings && { ...settings, ...pending }, saving: !!pending, error, blocks, save, unblock };
}

// Native radios (arrow keys, one tab stop, a name for each option), laid invisibly over their label so a click hits the radio itself.
export function Choice({ label, options, value, disabled = false, onPick }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-0.5 rounded-lg border border-line p-0.5">
      {options.map(([key, text]) => (
        <label key={String(key)} className={`relative flex-1 rounded-md px-2 py-1 text-center text-xs has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[#2383e2] ${disabled ? 'opacity-40' : 'cursor-pointer'} ${value === key ? 'bg-hover text-ink' : 'text-ink-2 hover:text-ink'}`}>
          <input type="radio" name={label} className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default" checked={value === key} disabled={disabled} onChange={() => onPick(key)} />{text}
        </label>
      ))}
    </div>
  );
}

const SIGN_IN = 'Sign in to post a comment.';
const SHARE = [[false, 'View only'], [true, 'Allow comments']];
const LINK = [['hidden', 'Hidden'], ['view', 'View only'], ['allow', 'Allow comments']];
const LINK_TEXT = { hidden: 'Visitors with the share link see no comments.', view: 'Visitors with the share link see existing comments but cannot post.', allow: 'Signed-in visitors with the share link can comment.' };
const EXPLORE = [['off', 'Hidden'], ['closed', 'View only'], ['open', 'Allow comments']];
const EXPLORE_TEXT = { off: 'The Explore page shows no comments.', closed: 'Existing comments stay visible. No new comments or replies.', open: 'Anyone signed in to Rabbit Hole can comment.' };

function Failure({ cs }) {
  return cs.error ? <p role="alert" className="mt-1 text-xs text-red-700">{cs.error}</p> : null;
}

export function ShareCommentSetting({ cs }) {
  if (!cs.on) return null;
  if (!cs.ready) return <Failure cs={cs} />;
  const allowed = cs.value.comments_enabled;
  const link = linkMode(cs.value);
  return (
    <div data-comment-settings className="border-t border-line py-2.5">
      <div className="mb-1.5 text-sm text-ink">Comments on the share link</div>
      <Choice label="Link comments" options={LINK} value={link} disabled={cs.saving} onPick={mode => cs.save(linkPatch(mode))} />
      <p className="mt-1.5 text-xs text-ink-3">{LINK_TEXT[link]}</p>
      <div className="mt-2.5 mb-1.5 text-sm text-ink">Comments from invited people</div>
      <Choice label="Invited people comments" options={SHARE} value={allowed} disabled={cs.saving} onPick={on => cs.save({ comments_enabled: on })} />
      <p className="mt-1.5 text-xs text-ink-3">{allowed ? 'People you invite can view and comment.' : 'People you invite see existing comments but cannot post. Only you can.'}</p>
      {(allowed || link === 'allow') && <p className="text-xs text-ink-3">{SIGN_IN}</p>}
      {cs.saving && <p role="status" className="text-xs text-ink-3">Saving</p>}
      <Failure cs={cs} />
      {cs.blocks.length > 0 && (
        <div data-comment-blocks className="mt-2.5 border-t border-line pt-2.5">
          <div className="mb-1 flex items-center gap-1.5 text-xs text-ink-2"><Ban size={13} className="shrink-0" />Blocked from commenting</div>
          <ul className="space-y-1">{cs.blocks.map(block => (
            <li key={block.block_id} className="flex items-center gap-2 text-sm text-ink"><span className="min-w-0 flex-1 truncate">{displayName(block.person)}</span>
              <button type="button" data-unblock onClick={() => cs.unblock(block.block_id)} className="h-6 rounded-md border border-line px-2 text-xs text-ink hover:bg-hover">Unblock</button></li>
          ))}</ul>
        </div>
      )}
    </div>
  );
}

export function ExploreCommentSetting({ cs }) {
  if (!cs.on) return null;
  if (!cs.ready) return <Failure cs={cs} />;
  const mode = cs.value.public_mode;
  return (
    <div data-public-comments className="border-t border-line py-2.5">
      <div className="mb-1.5 text-sm text-ink">Comments on Explore</div>
      <Choice label="Public comments" options={EXPLORE} value={mode} disabled={cs.saving || !cs.value.comments_enabled} onPick={value => cs.save({ public_mode: value })} />
      <p className="mt-1.5 text-xs text-ink-3">{EXPLORE_TEXT[mode]}</p>
      {mode === 'open' && <p className="text-xs text-ink-3">{SIGN_IN}</p>}
      {cs.saving && <p role="status" className="text-xs text-ink-3">Saving</p>}
      <Failure cs={cs} />
    </div>
  );
}
