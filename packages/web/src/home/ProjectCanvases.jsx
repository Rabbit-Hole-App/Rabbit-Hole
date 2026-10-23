import { useState } from 'react';
import { Compass } from 'lucide-react';
import { MODES, affected, modeLabel, varies } from './project-access.js';

// The Canvases tab of a project's Share window (owner brief 2026-10-22 items 4-5): the actual access of the Main canvas and of
// every canvas in the project, link access and Explore publication shown apart. "Apply to all canvases" is the only way this
// window changes more than one canvas, and it asks first with the number it will change. `result`: the last bulk change's
// { failed } list, shown until the next one.
export default function ProjectCanvases({ rows, loading, publicBlocked, result, pending, onApply, onManage }) {
  const [mode, setMode] = useState('signin');
  const [confirming, setConfirming] = useState(false);
  if (loading) return <p role="status" className="pt-3 text-xs text-ink-3">Loading each canvas</p>;
  const count = affected(rows, mode).length;
  const canvases = rows.filter(r => !r.main).length;
  const different = varies(rows);
  const apply = async () => { setConfirming(false); await onApply(mode); };
  return (
    <div data-project-canvases={different ? 'varies' : 'same'} className="pt-3">
      <p className="text-sm font-medium text-ink">{different ? 'Varies by canvas' : 'Same access on every canvas'}</p>
      <p className="mt-0.5 text-xs text-ink-3">{different ? 'Canvases in this project have different access settings.' : 'The Main canvas and every canvas share the access shown below.'} Link access and Explore publication are separate: publishing a canvas does not change its link.</p>
      <ul className="mt-2 divide-y divide-line rounded-md border border-line">
        {rows.map(row => (
          <li key={row.name} data-project-canvas={row.name} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-2 py-1.5 text-xs">
            <span className="min-w-0 flex-1 truncate text-sm text-ink" title={row.title}>{row.title}</span>
            <span data-canvas-link-access className="text-ink-2">{row.error ? 'Could not load' : row.main ? `Project link: ${modeLabel(row.mode)}` : `Link: ${modeLabel(row.mode)}`}</span>
            {row.published && <span data-canvas-published className="inline-flex items-center gap-1 text-ink-2"><Compass size={12} className="shrink-0" />Published on Explore</span>}
            {!row.main && <button type="button" data-manage-canvas={row.name} onClick={() => onManage(row)} className="h-6 rounded-md px-2 text-xs text-ink-2 hover:bg-hover hover:text-ink">Manage</button>}
          </li>
        ))}
      </ul>
      {result?.failed?.length > 0 && (
        <div role="alert" data-apply-failed className="mt-2 rounded-md border border-line p-2 text-xs text-red-700">
          {result.failed.length} of {result.total} canvases could not be changed, so they keep their previous access:
          <ul className="mt-1 list-disc pl-4">{result.failed.map(item => <li key={item.name}>{item.title}: {item.message}</li>)}</ul>
        </div>
      )}
      {canvases > 0 && (
        <div className="mt-3 border-t border-line pt-3">
          <label htmlFor="apply-all-mode" className="mb-1 block text-sm text-ink">Link access for all canvases</label>
          <select id="apply-all-mode" value={mode} disabled={pending} onChange={event => { setMode(event.target.value); setConfirming(false); }} className="h-8 w-full rounded-md border border-line bg-white px-2 text-sm text-ink disabled:opacity-40">
            {MODES.map(([value, label]) => <option key={value} value={value} disabled={publicBlocked && value === 'public'}>{label}</option>)}
          </select>
          <p className="mt-1 text-xs text-ink-3">The project link above is not changed, and neither is any Explore publication.</p>
          {confirming ? (
            <div role="group" aria-label="Apply to all canvases" className="mt-2">
              <p className="text-xs text-ink-2">Change link access to &ldquo;{modeLabel(mode)}&rdquo; on {count} {count === 1 ? 'canvas' : 'canvases'}? Each of them replaces its own link setting. {mode === 'invited' ? 'Their links stop working for everyone but invited people.' : 'Anyone with a canvas link can open that canvas.'}</p>
              <div className="mt-2 flex gap-2">
                <button type="button" data-confirm-apply disabled={pending} onClick={apply} className="h-7 rounded-md border border-line px-2.5 text-xs text-ink hover:bg-hover disabled:opacity-40">Change {count} {count === 1 ? 'canvas' : 'canvases'}</button>
                <button type="button" disabled={pending} onClick={() => setConfirming(false)} className="h-7 rounded-md px-2.5 text-xs text-ink-2 hover:bg-hover disabled:opacity-40">Cancel</button>
              </div>
            </div>
          ) : (
            <button type="button" data-apply-all disabled={pending || count === 0} onClick={() => setConfirming(true)} className="mt-2 h-8 rounded-md bg-primary-fill px-3 text-xs font-medium text-white hover:bg-primary-fill-hover disabled:opacity-40">Apply to all canvases{count ? ` (${count})` : ''}</button>
          )}
          {pending && <p role="status" className="mt-2 text-xs text-ink-3">Saving</p>}
        </div>
      )}
    </div>
  );
}
