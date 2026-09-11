import { useState } from 'react';
import { ArrowRight, Check, ChevronRight, Code2, FileText, ListChecks, MessageSquare, Search, Shield, SlidersHorizontal } from 'lucide-react';
import { Button, Input, Tabs, TabsContent, TabsList, TabsTrigger, Tip, cn } from '../ui.jsx';
import Inspector from './Inspector.jsx';
import { decisions, inputs, stages } from './sample-data.js';
import './coaching.css';

const icons = { Session: MessageSquare, Code: Code2, Document: FileText, Operations: SlidersHorizontal, Configuration: Shield, Decisions: ListChecks };
const badge = status => cn('inline-flex rounded-sm px-1.5 py-0.5 text-xs whitespace-nowrap', status === 'Approved' ? 'bg-success/10 text-success' : status === 'Needs review' ? 'bg-warn/10 text-warn' : 'bg-hover text-ink-2');

function InputsView({ items, label, onOpen, selected }) {
  const [query, setQuery] = useState(''), [type, setType] = useState('All types');
  const rows = items.filter(i => (type === 'All types' || i.type === type) && (i.title + i.subtitle).toLowerCase().includes(query.toLowerCase()));
  return <>
    <div className="flex flex-wrap items-center gap-2 py-4"><div className="relative min-w-36 flex-1"><Search size={14} className="absolute top-2.5 left-2 text-ink-2" /><Input aria-label={"Search " + label.toLowerCase()} className="pl-7" placeholder={"Find " + label.toLowerCase() + "…"} value={query} onChange={e => setQuery(e.target.value)} /></div>{label === 'Sources' && <select aria-label="Filter source type" value={type} onChange={e => setType(e.target.value)} className="h-8 rounded-sm border border-line bg-white px-2 text-xs"><option>All types</option>{[...new Set(items.map(item => item.type))].map(t => <option key={t}>{t}</option>)}</select>}</div>
    <div className="min-h-0 flex-1 overflow-auto rounded-sm border border-line">
      <table className="w-full min-w-[570px] border-collapse text-left text-sm"><thead className="sticky top-0 z-10 bg-side text-xs text-ink-2"><tr>{['Name', 'Type', 'Used for', 'Version'].map(h => <th key={h} className="h-8 border-b border-line px-3 font-normal">{h}</th>)}<th className="w-8"><span className="sr-only">Open</span></th></tr></thead><tbody>
        {rows.map(item => { const Icon = icons[item.type]; return <tr key={item.id} aria-selected={selected === item.id} onClick={() => onOpen(item)} className={cn('group cursor-pointer border-b border-line last:border-0 hover:bg-hover/70', selected === item.id && 'bg-accent/5')}>
          <td className="px-3 py-3"><button className="flex w-full items-start gap-2.5 text-left"><Icon size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-ink-2" /><span><span className="block font-medium">{item.title}</span><span className="mt-0.5 block text-xs text-ink-2">{item.subtitle}</span></span></button></td>
          <td className="px-3 text-xs text-ink-2">{item.type}</td><td className="px-3 text-xs text-ink-2">{item.use}</td><td className="whitespace-nowrap px-3 text-xs text-ink-2">{item.version}</td><td className="pr-3"><ChevronRight size={13} className="text-ink-2" /></td>
        </tr>; })}
      </tbody></table>
      {!rows.length && <p className="px-4 py-12 text-center text-sm text-ink-2">No {label.toLowerCase()} match. Try another name or type.</p>}
    </div>
    <div className="flex shrink-0 items-center justify-between gap-2 pt-3 pb-1 text-xs text-ink-2"><span>{rows.length} sample {label.toLowerCase()}</span><span>Click a row to inspect its full contents.</span></div>
  </>;
}

function CaptureView({ onOpen, onReview }) {
  return <div className="min-h-0 flex-1 overflow-y-auto py-5">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-semibold">Build a persistent counter</h3><p className="mt-1 text-xs text-ink-2">Example capture · build-counter.jsonl · Deploy 7</p></div><span className={badge('Approved')}>Ready for review</span></div>
    <ol className="divide-y divide-line rounded-sm border border-line">{stages.map((s, index) => <li key={s.id}><button className="flex w-full items-center gap-3 p-4 text-left hover:bg-hover/60" onClick={() => onOpen({ ...s, type: 'Capture step', subtitle: 'Sample input and output · no model was run' })}><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success/10 text-success"><Check size={13} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{index + 1}. {s.title}</span><span className="mt-1 block text-xs text-ink-2">{s.summary}</span></span><ChevronRight size={14} className="text-ink-2" /></button></li>)}</ol>
    <div className="mt-5 flex items-center justify-between gap-3"><p className="max-w-sm text-xs leading-5 text-ink-2">Open any step to inspect its sample input or output.</p><Button variant="secondary" size="sm" onClick={onReview}>Review decisions <ArrowRight size={13} /></Button></div>
  </div>;
}

function DecisionsView({ onOpen }) {
  const [filter, setFilter] = useState('All decisions');
  const rows = decisions.filter(d => filter === 'All decisions' || d.status === filter);
  return <>
    <div className="flex items-center justify-between gap-3 py-4"><p className="text-xs text-ink-2">Decisions and the evidence behind them</p><select aria-label="Filter decisions" value={filter} onChange={e => setFilter(e.target.value)} className="h-8 rounded-sm border border-line bg-white px-2 text-xs">{['All decisions', 'Draft', 'Approved', 'Needs review'].map(f => <option key={f}>{f}</option>)}</select></div>
    <div className="min-h-0 flex-1 overflow-y-auto"><div className="divide-y divide-line rounded-sm border border-line">{rows.map(d => <button key={d.id} onClick={() => onOpen({ ...d, type: 'Decision', subtitle: 'Sample decision · ' + d.anchor })} className="flex w-full gap-3 p-4 text-left hover:bg-hover/60"><ListChecks size={17} className="mt-0.5 shrink-0 text-ink-2" /><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-medium">{d.title}</span><span className={badge(d.status)}>{d.status}</span></span><span className="mt-2 block text-sm leading-6 text-ink-2">{d.reason || 'No recorded reason. Source changes need review.'}</span><span className="mt-3 block font-mono text-xs text-ink-2">{d.anchor}</span></span><ChevronRight size={14} className="mt-1 shrink-0 text-ink-2" /></button>)}</div></div>
    <p className="pt-3 pb-1 text-xs text-ink-2">{rows.length} sample decisions · Approval and removal are not connected.</p>
  </>;
}

export default function CoachingPanel(props) {
  return import.meta.env.VITE_COACHING_DEV === 'true' ? <CoachingDevPanel {...props} /> : props.children;
}

function CoachingDevPanel({ children, appName }) {
  const [tab, setTab] = useState('chat'), [history, setHistory] = useState([]);
  const selected = history.at(-1);
  const open = item => setHistory([item]);
  const sessions = inputs.filter(item => item.type === 'Session');
  const sources = inputs.filter(item => item.type !== 'Session');
  return <section aria-label="Agent workspace" className="flex min-h-0 min-w-0 flex-1 flex-col">
    <Tabs value={tab} onValueChange={value => { setTab(value); setHistory([]); }} className="flex min-h-0 flex-1 flex-col">
      <TabsList aria-label="Agent views" className="mb-3 shrink-0 gap-4 max-sm:gap-2">
        <TabsTrigger value="chat" aria-label="Chat"><Tip label="Chat" info="Chat with the agent about this app. Your existing conversation and controls are here."><span>Chat</span></Tip></TabsTrigger>
        <TabsTrigger value="sessions" aria-label="Sessions"><Tip label="Sessions" info="Read the builder's full coding-agent conversations, including tool calls and results."><span>Sessions</span></Tip></TabsTrigger>
        <TabsTrigger value="sources" aria-label="Sources"><Tip label="Sources" info="Inspect supporting code, documents, configuration, and operational records."><span>Sources</span></Tip></TabsTrigger>
        <TabsTrigger value="capture" aria-label="Capture"><Tip label="Capture" info="See how inputs become draft decisions, including the input and output of each step."><span>Capture</span></Tip></TabsTrigger>
        <TabsTrigger value="decisions" aria-label="Decisions"><Tip label="Decisions" info="Review what was chosen and why, alternatives, evidence, unknowns, and approval status."><span>Decisions</span></Tip></TabsTrigger>
      </TabsList>
      <TabsContent value="chat" forceMount className="flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">{children}</TabsContent>
      <TabsContent value="sessions" className="coach-ui flex min-h-0 flex-1 flex-col"><p className="text-xs text-ink-2">Sample data · UI only</p><InputsView items={sessions} label="Sessions" onOpen={open} selected={selected?.id} /></TabsContent>
      <TabsContent value="sources" className="coach-ui flex min-h-0 flex-1 flex-col"><p className="text-xs text-ink-2">Sample data · UI only</p><InputsView items={sources} label="Sources" onOpen={open} selected={selected?.id} /></TabsContent>
      <TabsContent value="capture" className="coach-ui flex min-h-0 flex-1 flex-col"><p className="text-xs text-ink-2">Sample data · UI only</p><CaptureView onOpen={open} onReview={() => setTab('decisions')} /></TabsContent>
      <TabsContent value="decisions" className="coach-ui flex min-h-0 flex-1 flex-col"><p className="text-xs text-ink-2">Sample data · UI only</p><DecisionsView onOpen={open} /></TabsContent>
    </Tabs>
    {selected && <Inspector appName={appName} section={tab[0].toUpperCase() + tab.slice(1)} item={selected} onClose={() => setHistory([])} onBack={history.length > 1 ? () => setHistory(h => h.slice(0, -1)) : null} onOpen={item => setHistory(h => [...h, item])} />}
  </section>;
}
