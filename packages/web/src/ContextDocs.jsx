// Canvas context documents (docs/features/canvas-context-docs.md): the list the Files panel and the
// composer's Context button both show - Upload Context, then one switch per document for whether the
// agent reads it, and a delete. Switching off keeps the file; the trash removes it.
import { useRef } from 'react';
import { CircleAlert, FileText, Loader2, NotebookText, Trash2, Upload } from 'lucide-react';
import { Tip } from './ui.jsx';
import { ATTACHED_LIMIT, CONTEXT_ACCEPT } from './context-docs.js';

const ABOUT = 'Upload a PDF, .txt or .md file. The agent reads the ones switched on when it answers, makes cards or tutors - they are not added to the canvas.';
const size = bytes => (bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export default function ContextDocs({ context }) {
  const picker = useRef(null);
  const { docs, busy, upload, toggle, remove, on } = context;
  return (
    <div data-context-docs>
      <div className="flex items-center justify-between gap-2 px-2 pt-1.5 pb-1">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-ink-3 uppercase">
          Context <span className="font-normal normal-case tracking-normal">· {on} of {ATTACHED_LIMIT} on</span>
          <span className="inline-flex font-normal normal-case tracking-normal"><Tip label="Context documents" info={ABOUT}><span tabIndex={0} role="img" aria-label={ABOUT} className="inline-flex cursor-help text-ink-3 hover:text-ink"><CircleAlert size={13} /></span></Tip></span>
        </span>
        <input ref={picker} type="file" accept={CONTEXT_ACCEPT} className="hidden" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; upload(file); }} />
        <button type="button" disabled={busy} onClick={() => picker.current?.click()}
          className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-line bg-white px-2 text-xs font-medium text-ink shadow-sm hover:bg-hover disabled:cursor-default disabled:opacity-60">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Upload Context
        </button>
      </div>
      {docs.length ? (
        <ul className="max-h-60 overflow-y-auto">
          {docs.map(doc => {
            const Icon = doc.kind === 'pdf' ? FileText : NotebookText;
            return (
              <li key={doc.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-hover">
                <Icon size={15} className="shrink-0 text-ink-3" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink" title={doc.name}>{doc.name}</span>
                  <span className="block text-[11px] text-ink-3">{doc.kind === 'pdf' ? 'PDF' : 'Text'} · {size(doc.size)}{doc.attached ? '' : ' - the agent ignores it'}</span>
                </span>
                <button type="button" aria-label={`Delete ${doc.name}`} title="Delete" onClick={() => remove(doc.id)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-3 opacity-0 group-hover:opacity-100 hover:bg-white hover:text-red-700 focus-visible:opacity-100 max-md:opacity-100"><Trash2 size={14} /></button>
                <button type="button" role="switch" aria-checked={doc.attached} aria-label={`Agent reads ${doc.name}`} onClick={() => toggle(doc.id, !doc.attached)}
                  className={`flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${doc.attached ? 'bg-accent' : 'bg-line-strong'}`}>
                  <span className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${doc.attached ? 'translate-x-4' : ''}`} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-2 pb-2 text-xs text-ink-3">No documents yet.</p>
      )}
    </div>
  );
}
