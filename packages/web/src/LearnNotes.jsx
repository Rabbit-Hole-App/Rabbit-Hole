import { learnShapeUtils } from './learn-shape-utils.js';
﻿import { useEffect, useRef, useState } from 'react';
import { Tldraw, TldrawImage } from 'tldraw';
import { MousePointer2, Pencil, Type, Highlighter, Eraser, Undo2, NotebookPen, Trash2 } from 'lucide-react';
import { Button, IconBtn, ConfirmDialog } from './ui.jsx';
import { captureNotePage } from './learn-notes.js';
import 'tldraw/tldraw.css';

const licenseKey = import.meta.env.VITE_TLDRAW_LICENSE_KEY;
const noteComponents = { Background: () => <div className="tl-background" style={{ backgroundColor: '#fffbeb' }} /> };

export default function LearnNotes({ saveRef, onChange, records, editing, onSave, onDelete, onResume, onEdit, onReturn, error, loaded }) {
  const editor = useRef(null);
  const description = useRef(null);
  if (description.current?.id !== editing?.id) description.current = { id: editing?.id, text: editing?.description || '' };
  const timer = useRef(null);
  const dispose = useRef(null);
  const latest = useRef({ editing, onSave });
  latest.current = { editing, onSave };
  const [status, setStatus] = useState('Saved');
  const [tool, setTool] = useState('select');
  const generation = useRef(0);
  const deleting = useRef(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const save = async () => {
    clearTimeout(timer.current);
    if (deleting.current || !editor.current || !latest.current.editing) return false;
    const revision = ++generation.current;
    setStatus('Saving...');
    const note = { ...latest.current.editing, description: description.current.text.trim(), snapshot: captureNotePage(editor.current), updatedAt: Date.now() };
    try {
      await latest.current.onSave(note);
      if (revision === generation.current) setStatus('Saved');
      return true;
    } catch {
      if (revision === generation.current) setStatus('Not saved. Retry before leaving.');
      return false;
    }
  };
  useEffect(() => { saveRef.current = save; return () => { saveRef.current = null; }; });
  useEffect(() => () => { save(); clearTimeout(timer.current); dispose.current?.(); }, []);
  useEffect(() => {
    if (!editing || status === 'Saved') return;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [editing, status]);
  const deleteDialog = confirmDelete && <ConfirmDialog title="Delete personal note?" body="This removes your saved annotations for this snapshot. The original lesson slide stays intact." confirmLabel="Delete note" onCancel={() => setConfirmDelete(null)} onConfirm={async () => {
    deleting.current = true; clearTimeout(timer.current);
    try { await onDelete(confirmDelete); setConfirmDelete(null); }
    catch { deleting.current = false; /* Keep the note available for retry. */ }
  }} />;
  if (editing) return <section aria-label="Edit personal note" className="flex min-h-0 flex-1 flex-col gap-3">
    {deleteDialog}
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-medium">{editing.sectionTitle}</h2><p className="text-xs text-ink-2">{editing.lessonTitle} · personal snapshot</p></div><span role="status" className="text-xs text-ink-2">{status}</span></div>
    <label className="text-xs text-ink-2">Description (optional)<input key={editing.id} type="text" maxLength={240} defaultValue={editing.description || ''} placeholder="What is this note about?" className="mt-1 block w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink" onChange={event => { description.current.text = event.target.value; onChange(true); setStatus('Saving...'); clearTimeout(timer.current); timer.current = setTimeout(save, 450); }} /></label>
    <div className="flex flex-wrap items-center gap-1" aria-label="Note tools">{[['select', MousePointer2, 'Select notes'], ['draw', Pencil, 'Pen'], ['text', Type, 'Text'], ['highlight', Highlighter, 'Highlight'], ['eraser', Eraser, 'Eraser']].map(([id, Icon, label]) => <IconBtn key={id} aria-label={label} title={label} aria-pressed={tool === id} className={tool === id ? 'bg-amber-100 text-amber-900 ring-1 ring-amber-300' : ''} onClick={() => { editor.current?.setCurrentTool(id); setTool(id); }}><Icon size={17} /></IconBtn>)}<IconBtn aria-label="Undo note" title="Undo" onClick={() => editor.current?.undo()}><Undo2 size={17} /></IconBtn>    <div className="ml-auto flex flex-wrap justify-end gap-2"><IconBtn aria-label="Delete note" title="Delete note" onClick={() => setConfirmDelete(editing)}><Trash2 size={16} /></IconBtn><Button variant="secondary" onClick={async () => { if (await save()) onReturn(); }}>Save to My notes</Button><Button onClick={async () => { if (await save()) onResume(editing); }}>Save &amp; resume</Button></div></div>
    <div className="flex min-h-0 flex-1 gap-2">
    <div aria-label="Personal note canvas" className="relative min-h-[320px] min-w-0 flex-1 overflow-hidden rounded-lg border border-amber-200 bg-amber-50"><Tldraw shapeUtils={learnShapeUtils} key={editing.id} hideUi components={noteComponents} snapshot={editing.snapshot} licenseKey={licenseKey} onMount={value => {
      dispose.current?.(); deleting.current = false; editor.current = value; setTool('select');
      value.updateInstanceState({ isToolLocked: true });
      value.setCurrentPage(editing.pageId); value.zoomToFit({ inset: 35 }); value.clearHistory();
      setStatus('Saving...'); save();
      dispose.current = value.store.listen(() => { onChange(true); setStatus('Saving...'); clearTimeout(timer.current); timer.current = setTimeout(save, 450); }, { scope: 'document', source: 'user' });
    }} /></div>
      <div className="shrink-0 self-center rounded-lg border border-amber-300 bg-amber-100 p-1"><IconBtn aria-label="Notes mode" title="Notes mode" aria-pressed="true" className="bg-amber-200 text-amber-900"><NotebookPen size={17} strokeWidth={1.5} /></IconBtn></div>
    </div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}

  </section>;
  const groups = Object.groupBy(records, record => `${record.lessonId}:${record.sectionIndex}`);
  return <section aria-label="My notes" className="min-h-0 flex-1 overflow-y-auto pr-1">
    {deleteDialog}
    <h2 className="mb-5 text-lg font-semibold">My notes</h2>
    {error && <p role="alert" className="mb-4 text-sm text-red-700">{error}</p>}
    {!loaded ? <p className="text-sm text-ink-2">Loading notes...</p> : !records.length && <p className="text-sm text-ink-2">Play a lesson to collect its slides. Pause and use the note icon to add your own notes.</p>}
    {Object.values(groups).sort((a, b) => (a[0].courseTitle || '').localeCompare(b[0].courseTitle || '') || (a[0].lessonOrder || 0) - (b[0].lessonOrder || 0) || a[0].sectionIndex - b[0].sectionIndex).map(group => <div key={`${group[0].lessonId}:${group[0].sectionIndex}`} className="mb-8">
      <p className="text-xs text-ink-2">{group[0].courseTitle} · {group[0].lessonTitle}</p><h3 className="mt-1 mb-3 font-medium">Section {group[0].sectionIndex + 1}: {group[0].sectionTitle}</h3>
      <div className="space-y-4">{group.sort((a, b) => (a.kind === 'slide' ? -1 : b.kind === 'slide' ? 1 : a.createdAt - b.createdAt)).map(record => <article key={record.id} className="rounded-lg border border-line p-3">
        <div className="relative h-72 overflow-hidden rounded bg-white"><TldrawImage shapeUtils={learnShapeUtils} snapshot={record.snapshot} pageId={record.pageId} licenseKey={licenseKey} padding={20} /></div>
        <div className="mt-3 flex items-center justify-between gap-2"><span className="min-w-0 break-words text-xs text-ink-2">{record.kind === 'slide' ? 'Completed slide' : record.description || 'Personal notes'}</span><div className="flex gap-2">{record.kind === 'note' && <IconBtn aria-label="Delete note" title="Delete note" onClick={() => setConfirmDelete(record)}><Trash2 size={16} /></IconBtn>}{record.kind === 'note' && <Button size="sm" variant="secondary" onClick={() => onEdit(record)}>Edit notes</Button>}<Button size="sm" variant="secondary" onClick={() => onResume(record, false)}>Return to lesson</Button></div></div>
      </article>)}</div>
    </div>)}
  </section>;
}
