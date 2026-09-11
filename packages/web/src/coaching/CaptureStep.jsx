import { ArrowUpRight, Check, CircleHelp, FileCode2, MessageSquare } from 'lucide-react';
import { Button, cn } from '../ui.jsx';
import { decisions, inputs } from './sample-data.js';
import SourcePreview from './SourcePreview.jsx';

function CaptureInputs({ content, onOpen }) {
  const session = inputs.find(i => i.id === 'session-build');
  return <>
    <section className="overflow-hidden rounded-md border border-line">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-side px-4 py-3"><MessageSquare size={15} className="text-ink-2" /><h3 className="font-semibold">Conversation</h3><span className="ml-auto text-xs text-ink-2">{content.messages.length} messages</span></div>
      <div className="p-4"><p className="mb-3 text-xs text-ink-2">{session.subtitle}</p>
        {content.messages.slice(0, 3).map(m => <div key={m.id} className="mb-3 border-l-2 border-line pl-3"><p className="mb-1 text-xs text-ink-2"><span className="font-medium text-ink">{m.role}</span> · {m.id} · {m.time}</p><p className="leading-6">{m.text}</p></div>)}
        <Button size="sm" variant="secondary" onClick={() => onOpen(session)}>Open full conversation <ArrowUpRight size={13} /></Button>
      </div>
    </section>
    <details open className="rounded-md border border-line">
      <summary className="cursor-pointer px-4 py-3 font-semibold">Deployed source <span className="ml-2 text-xs font-normal text-ink-2">{Object.keys(content.source).length} files · Deploy 7</span></summary>
      <div className="border-t border-line p-4"><SourcePreview item={{ files: content.source }} /></div>
    </details>
  </>;
}

function Candidate({ decision, onOpen }) {
  return <article className="rounded-md border border-line p-4">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-2"><span>{decision.kind}</span><span className="rounded-sm bg-hover px-2 py-0.5">{decision.status}</span></div>
    <h3 className="font-semibold leading-6">{decision.title}</h3>
    <p className="mt-2 leading-6 text-ink-2">{decision.reason || 'No reason was recorded. This is a gap.'}</p>
    <div className="mt-4"><h4 className="mb-1 text-xs font-medium text-ink-2">Alternatives considered</h4><p className="leading-6">{decision.alternatives.join(' · ') || 'No alternatives recorded.'}</p></div>
    <div className="mt-4 rounded-sm bg-side p-3"><h4 className="mb-2 text-xs font-medium text-ink-2">Evidence · User · {decision.messageId}</h4><blockquote className="leading-6">“{decision.evidence}”</blockquote><button className="mt-2 flex items-center gap-1 text-xs text-accent" onClick={() => onOpen({ ...inputs.find(i => i.id === decision.sessionId), messageId: decision.messageId })}>Open conversation <ArrowUpRight size={12} /></button></div>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><button className="flex items-center gap-1 font-mono text-xs text-accent" onClick={() => onOpen({ ...inputs.find(i => i.id === 'source'), file: decision.file, line: decision.line })}><FileCode2 size={13} />{decision.anchor}</button><Button size="sm" variant="secondary" onClick={() => onOpen({ ...decision, type: 'Decision' })}>View decision <ArrowUpRight size={13} /></Button></div>
  </article>;
}

export default function CaptureStep({ item, onOpen }) {
  const content = item.content;
  return <div className="capture-content space-y-5 text-sm">
    {item.id === 'read' && <CaptureInputs content={content} onOpen={onOpen} />}
    {item.id === 'normalize' && <>
      <p className="text-xs text-ink-2" title="Speaker labels and message IDs are preserved for tracing decisions back to the conversation.">{content.messages.length} messages preserved</p>
      <section><h3 className="font-semibold">Redaction example</h3><p className="mt-1 text-xs leading-5 text-ink-2">{content.redaction_example.note}</p>
        <div className="capture-comparison mt-3 grid gap-3">
          {[['Before', content.redaction_example.before], ['After', content.redaction_example.after]].map(([label, value]) => <div key={label} className="min-w-0 rounded-md border border-line"><h4 className="border-b border-line bg-side px-3 py-2 text-xs font-medium">{label}</h4><pre className="whitespace-pre-wrap break-words p-3 font-mono text-xs leading-6">API_TOKEN=<mark className={cn('rounded-sm px-1', label === 'Before' ? 'bg-warn/10 text-warn' : 'bg-success/10 text-success')}>{value}</mark></pre></div>)}
        </div>
      </section>
      <details className="rounded-md border border-line"><summary className="cursor-pointer px-4 py-3 font-medium">Normalized messages <span className="ml-2 text-xs font-normal text-ink-2">{content.messages.length} messages</span></summary><div className="divide-y divide-line border-t border-line">{content.messages.map(m => <div key={m.id} className="px-4 py-3"><p className="mb-1 text-xs text-ink-2">{m.role} · {m.id}</p><p className="break-words leading-6">{typeof m.content === 'string' ? m.content : m.content.tool + ' · arguments and results preserved'}</p></div>)}</div></details>
    </>}
    {item.id === 'model' && <>
      <section className="rounded-md border border-line bg-side p-4"><h3 className="mb-2 font-semibold">Extraction instructions</h3><p className="leading-6">{content.prompt}</p></section>
      <div><h3 className="font-semibold">Included context</h3><p className="mt-1 text-xs leading-5 text-ink-2">The session window and deployed files included in this sample prompt.</p></div>
      <CaptureInputs content={content} onOpen={onOpen} />
    </>}
    {item.id === 'response' && <>
      <p className="text-xs text-ink-2">{content.length} candidate decisions · Open the evidence or code to inspect each choice.</p>
      {content.map(decision => <Candidate key={decision.id} decision={decision} onOpen={onOpen} />)}
    </>}
    {item.id === 'validate' && <>
      <dl className="flex flex-wrap gap-x-8 gap-y-3 rounded-md border border-line bg-side p-4">{[[content.candidates, 'Candidates'], [content.valid_anchors, 'Valid anchors'], [content.excluded.length, 'Excluded']].map(([count, label]) => <div key={label}><dt className="text-xs text-ink-2">{label}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{count}</dd></div>)}</dl>
      <section><h3 className="mb-3 font-semibold">Checks</h3><ul className="divide-y divide-line rounded-md border border-line">{content.checks.map(check => <li key={check.title} className="flex items-start gap-3 p-4">{check.status === 'Passed' ? <Check size={16} className="mt-0.5 shrink-0 text-success" /> : <CircleHelp size={16} className="mt-0.5 shrink-0 text-warn" />}<div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-medium">{check.title}</h4><span className={cn('rounded-sm px-2 py-0.5 text-xs', check.status === 'Passed' ? 'bg-success/10 text-success' : 'bg-warn/10 text-warn')}>{check.status}</span></div><p className="mt-1 text-xs leading-5 text-ink-2">{check.detail}</p>{check.decisionId && <button className="mt-2 flex items-center gap-1 text-xs text-accent" onClick={() => onOpen({ ...decisions.find(d => d.id === check.decisionId), type: 'Decision' })}>Inspect decision <ArrowUpRight size={12} /></button>}</div></li>)}</ul></section>
      <p className="text-xs leading-5 text-ink-2">{content.note}</p>
    </>}
  </div>;
}
