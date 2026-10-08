import { useEffect, useState } from 'react';
import { Globe, MessageCircle } from 'lucide-react';
import { api } from '../api.js';
import { Switch } from '../SharePanel.jsx';

// The owner's comment settings in Share (docs/features/canvas-comments.md section 4): "Allow comments" for everyone the
// canvas is shared with, and, once it is published to Explore, Public comments Off / Open / Closed - each saying what
// happens to existing comments. The public setting is disabled while Allow comments is off.
const MODES = [
  ['off', 'Off', 'The published page shows no comments.'],
  ['open', 'Open', 'Anyone signed in to Rabbit Hole can comment.'],
  ['closed', 'Closed', 'Existing comments stay visible. No new comments or replies.'],
];

export default function CommentSettings({ base, published }) {
  const [settings, setSettings] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    let live = true;
    api(base).then(about => { if (live) setSettings({ comments_enabled: about.comments_enabled, public_mode: about.public_mode }); }, failure => { if (live) setError(failure.message); });
    return () => { live = false; };
  }, [base, published]);
  const save = async patch => {
    setBusy(true); setError(null);
    try { setSettings(await api(`${base}/comment-settings`, { method: 'PUT', body: JSON.stringify(patch) })); } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  };
  if (!settings) return error ? <p role="alert" className="mt-2 text-xs text-red-700">{error}</p> : null;
  const enabled = settings.comments_enabled;
  return (
    <div data-comment-settings className="mt-3 rounded-lg border border-line p-2.5">
      <div className="flex items-center gap-2">
        <MessageCircle size={14} className="shrink-0 text-ink-2" />
        <div className="min-w-0 flex-1">
          <div className="text-sm text-ink">Allow comments</div>
          <div className="text-xs text-ink-3">{enabled ? 'People you share this canvas with can comment.' : 'Only you can comment. Existing comments stay visible.'}</div>
        </div>
        <Switch on={enabled} label="Allow comments" disabled={busy} onChange={on => save({ comments_enabled: on })} />
      </div>
      {published && (
        <div data-public-comments className="mt-2.5 border-t border-line pt-2.5">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs text-ink-2"><Globe size={13} className="shrink-0" />Public comments on the published page</div>
          <div role="radiogroup" aria-label="Public comments" className="flex gap-0.5 rounded-lg border border-line p-0.5">
            {MODES.map(([value, label]) => (
              <button key={value} type="button" role="radio" aria-checked={settings.public_mode === value} disabled={busy || !enabled} onClick={() => save({ public_mode: value })}
                className={`flex-1 rounded-md px-2 py-1 text-xs disabled:opacity-40 ${settings.public_mode === value ? 'bg-hover text-ink' : 'text-ink-2 hover:text-ink'}`}>{label}</button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-ink-3">{enabled ? MODES.find(([value]) => value === settings.public_mode)?.[2] : 'Turn on Allow comments to change this.'}</p>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
