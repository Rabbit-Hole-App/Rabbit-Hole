import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowUpRight, Braces, Check, FileCode2, Maximize2, Minimize2, Search, X } from 'lucide-react';
import { Button, IconBtn, Input, Tabs, TabsContent, TabsList, TabsTrigger, ExpandedPageFrame, PeekBreadcrumbs, useSidebarInset, cn } from '../ui.jsx';
import { decisions, inputs } from './sample-data.js';
import { navigate } from '../api.js';
import { colorLine } from '../code.jsx';

export const display = value => typeof value === 'string' ? value : JSON.stringify(value, null, 2);
export function Raw({ value }) {
  return <pre className="whitespace-pre-wrap break-words rounded-sm bg-code p-4 font-mono text-xs leading-6">{display(value)}</pre>;
}

function Conversation({ item, onOpen }) {
  const [query, setQuery] = useState(''), [role, setRole] = useState('All speakers'), [expanded, setExpanded] = useState(false);
  const matches = item.messages.filter(m => (role === 'All speakers' || m.role === role) && display(m).toLowerCase().includes(query.toLowerCase()));
  useEffect(() => {
    if (item.messageId) document.getElementById('sample-' + item.messageId)?.scrollIntoView({ block: 'center' });
  }, [item.messageId]);
  return <>
    <div className="sticky top-0 z-10 space-y-2 border-b border-line bg-white pb-3">
      <div className="flex flex-wrap gap-2">
        <Input aria-label="Search conversation" placeholder="Search the full conversation…" value={query} onChange={e => setQuery(e.target.value)} className="min-w-32 flex-1" />
        <select aria-label="Filter by speaker" className="rounded-sm border border-line bg-white px-2 text-xs" value={role} onChange={e => setRole(e.target.value)}>
          {['All speakers', ...new Set(item.messages.map(m => m.role))].map(r => <option key={r}>{r}</option>)}
        </select>
      </div>
      <div className="flex items-center justify-between text-xs text-ink-2"><span>{matches.length} of {item.messages.length} messages</span><button className="hover:text-ink" onClick={() => setExpanded(!expanded)}>{expanded ? 'Collapse tool details' : 'Expand tool details'}</button></div>
    </div>
    {!matches.length && <p className="py-8 text-sm text-ink-2">No messages match. Clear the search or change the speaker filter.</p>}
    {matches.map(m => <article id={'sample-' + m.id} key={m.id} className={cn('border-b border-line py-5', item.messageId === m.id && 'rounded-sm bg-accent/5 px-3')}>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs"><span className={cn('font-semibold', m.role === 'User' ? 'text-ink' : 'text-ink-2')}>{m.role}</span><span className="text-ink-2">{m.time} · {m.id}</span>{m.evidence && <span className="ml-auto flex items-center gap-1 text-success"><Check size={11} /> Evidence</span>}</div>
      <p className="whitespace-pre-wrap break-words text-sm leading-6">{m.text}</p>
      {m.body && <details open={expanded || !!query} className="mt-3"><summary className="cursor-pointer text-xs text-ink-2 hover:text-ink">Arguments and full result</summary><div className="mt-2"><Raw value={m.body} /></div></details>}
      {m.evidence && <button onClick={() => onOpen({ ...decisions.find(d => d.messageId === m.id), type: 'Decision' })} className="mt-3 flex items-center gap-1 text-xs text-accent">View decision <ArrowUpRight size={12} /></button>}
    </article>)}
  </>;
}

function Source({ item }) {
  const [file, setFile] = useState(item.file || Object.keys(item.files)[0]);
  useEffect(() => { if (item.line) document.getElementById('sample-code-' + item.line)?.scrollIntoView({ block: 'center' }); }, [item.line, file]);
  return <>
    <nav aria-label="Source files" className="mb-4 flex flex-wrap gap-1 border-b border-line pb-3">
      {Object.keys(item.files).map(path => <Button key={path} size="sm" aria-pressed={file === path} className={cn('font-mono text-xs', file === path && 'bg-hover text-ink')} onClick={() => setFile(path)}><FileCode2 size={13} />{path}</Button>)}
    </nav>
    <div className="mb-3 flex justify-between gap-3 text-xs text-ink-2"><span>{file}</span><span>Complete sample file</span></div>
    <pre className="rounded-sm bg-code py-3 font-mono text-xs leading-6">{item.files[file].split('\n').map((line, i) => <div id={'sample-code-' + (i + 1)} key={i} className={cn('flex gap-4 px-3', file === item.file && i + 1 === item.line && 'bg-accent/10')}><span className="w-6 shrink-0 text-right text-ink-2 select-none">{i + 1}</span><span className="min-w-0 whitespace-pre-wrap break-words">{colorLine(line)}</span></div>)}</pre>
  </>;
}

function Decision({ item, onOpen }) {
  return <div className="space-y-6 text-sm leading-6">
    <div className="flex gap-2 text-xs text-ink-2"><span className="rounded-sm bg-hover px-2 py-0.5">{item.status}</span><span className="py-0.5">{item.kind}</span></div>
    <section><h3 className="mb-1 font-semibold">Reason</h3><p>{item.reason || 'No reason was recorded. This is a gap.'}</p></section>
    <section><h3 className="mb-1 font-semibold">Alternatives</h3>{item.alternatives.length ? <ul className="list-disc space-y-1 pl-5">{item.alternatives.map(a => <li key={a}>{a}</li>)}</ul> : <p className="text-ink-2">No alternatives recorded.</p>}</section>
    <section><h3 className="mb-1 font-semibold">Constraints</h3>{item.constraints.length ? item.constraints.map(c => <p key={c}>{c}</p>) : <p className="text-ink-2">No constraints recorded.</p>}</section>
    <section><h3 className="mb-1 font-semibold">When to revisit</h3><p>{item.revisit}</p></section>
    <section><h3 className="mb-2 font-semibold">Evidence</h3><blockquote className="border-l-2 border-line-strong pl-4">{item.evidence}</blockquote><button onClick={() => onOpen({ ...inputs.find(i => i.id === item.sessionId), messageId: item.messageId })} className="mt-3 flex items-center gap-1 text-xs text-accent">Open full conversation · {item.messageId}<ArrowUpRight size={12} /></button></section>
    <section><h3 className="mb-1 font-semibold">Code anchor</h3>{item.file ? <button className="flex items-center gap-1 font-mono text-xs text-accent" onClick={() => onOpen({ ...inputs.find(i => i.id === 'source'), file: item.file, line: item.line })}>{item.anchor}<ArrowUpRight size={12} /></button> : <p className="text-ink-2">{item.anchor} · historical source unavailable in this preview.</p>}</section>
  </div>;
}

export default function Inspector({ item, onClose, onBack, onOpen, appName, section }) {
  const [width, setWidth] = useState(620), [full, setFull] = useState(false);
  const drag = useRef(null), closeRef = useRef(null), fullRef = useRef(false);
  fullRef.current = full;
  const sidebarInset = useSidebarInset();
  const breadcrumbs = [{ label: 'Apps', onClick: () => navigate('/apps') }, ...(appName ? [{ label: appName, onClick: () => navigate('/apps/' + encodeURIComponent(appName)) }] : []), { label: 'Agent' }, { label: section || 'Sources', onClick: onClose }, { label: item.title }];
  useEffect(() => {
    const opener = document.activeElement;
    closeRef.current?.focus();
    const escape = e => { if (e.key === 'Escape') { e.stopPropagation(); if (fullRef.current) setFull(false); else onClose(); } };
    window.addEventListener('keydown', escape);
    return () => { window.removeEventListener('keydown', escape); if (opener?.isConnected) opener.focus(); };
  }, []);
  const resize = value => setWidth(Math.min(window.innerWidth, Math.max(360, value)));
  const contentLabel = item.type === 'Session' ? 'Conversation' : item.type === 'Decision' ? 'Decision' : item.type === 'Answer' ? 'Answer' : 'Contents';
  return createPortal(<aside role="dialog" aria-modal="false" aria-labelledby="coach-inspector-title" style={{ width: full ? 'calc(100vw - ' + sidebarInset + 'px)' : width, maxWidth: 'calc(100vw - ' + sidebarInset + 'px)' }} className={cn('coach-inspector fixed inset-y-0 right-0 z-40 flex max-w-full flex-col bg-white', !full && 'border-l border-line-strong shadow-pop')}>
    {!full && <div role="separator" tabIndex={0} aria-label="Resize inspector" aria-orientation="vertical" aria-valuenow={width} aria-valuemin={360} aria-valuemax={Math.max(360, window.innerWidth)} className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize touch-none hover:bg-accent/15 focus-visible:bg-accent/20 max-sm:hidden"
      onPointerDown={e => { drag.current = { x: e.clientX, width }; e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerMove={e => { if (drag.current) resize(drag.current.width + drag.current.x - e.clientX); }}
      onPointerUp={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
      onKeyDown={e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) { e.preventDefault(); resize(e.key === 'Home' ? 360 : e.key === 'End' ? window.innerWidth : width + (e.key === 'ArrowLeft' ? 32 : -32)); } }} />}
    <ExpandedPageFrame expanded={full}>
    {full && <PeekBreadcrumbs items={breadcrumbs} />}
    <header className={cn('flex h-12 shrink-0 items-center gap-2 border-b border-line', !full && 'px-4')}>
      {onBack && <IconBtn aria-label="Back in inspector" onClick={onBack}><ArrowLeft size={15} /></IconBtn>}
      <span className="text-xs text-ink-2">Inspector</span><span className="rounded-sm bg-hover px-1.5 py-0.5 text-xs text-ink-2">Sample data</span>
      <div className="ml-auto flex gap-1"><IconBtn aria-label={full ? 'Minimize' : 'Open as page'} title={full ? 'Minimize' : 'Open as page'} onClick={() => setFull(!full)}>{full ? <Minimize2 size={14} /> : <Maximize2 size={14} />}</IconBtn><button ref={closeRef} aria-label="Close inspector" className="flex h-7 w-7 items-center justify-center rounded-sm text-ink-2 hover:bg-hover" onClick={onClose}><X size={15} /></button></div>
    </header>
    <div className={cn('shrink-0 pt-5 pb-4', !full && 'px-6')}><p className="mb-2 text-xs text-ink-2">{item.type}</p><h2 id="coach-inspector-title" className="break-words text-lg font-semibold leading-6">{item.title}</h2>{item.subtitle && <p className="mt-2 text-xs text-ink-2">{item.subtitle}</p>}</div>
    <Tabs key={item.id + (item.messageId || '') + (item.file || '')} defaultValue="contents" className="flex min-h-0 flex-1 flex-col">
      <TabsList aria-label="Inspector views" className={cn('shrink-0 gap-5', !full && 'px-6')}><TabsTrigger value="contents">{contentLabel}</TabsTrigger><TabsTrigger value="raw">{item.modelInput ? 'Model input' : 'Original'}</TabsTrigger><TabsTrigger value="details">Details</TabsTrigger></TabsList>
      <TabsContent value="contents" className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain py-4', !full && 'px-6')}>
        {item.messages ? <Conversation item={item} onOpen={onOpen} /> : item.files ? <Source item={item} /> : item.type === 'Decision' ? <Decision item={item} onOpen={onOpen} /> : <Raw value={item.content} />}
      </TabsContent>
      <TabsContent value="raw" className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain py-4', !full && 'px-6')}><div className="mb-3 flex items-center gap-2 text-xs text-ink-2"><Braces size={13} />Complete sample {item.modelInput ? 'model input' : 'content'}</div><Raw value={item.modelInput || item.original || item.files || item.content || item} /></TabsContent>
      <TabsContent value="details" className={cn('min-h-0 flex-1 overflow-y-auto py-4', !full && 'px-6')}><Raw value={{ source: 'Handwritten UI sample', type: item.type, name: item.title, used_for: item.use || 'Inspection', version: item.version || 'Example', messages: item.messages?.length, model_executed: false, saved: false }} /></TabsContent>
    </Tabs>
    </ExpandedPageFrame>
  </aside>, document.body);
}
