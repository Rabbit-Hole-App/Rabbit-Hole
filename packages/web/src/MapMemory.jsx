import { Layers } from 'lucide-react';
import { Button, cn, Pill } from './ui.jsx';
import { memoryFor, STARTERS, titleOfRecord, WHY } from './map-memory.js';

// The Map's work-memory UI (WP6 checkpoint 2): the Layers row, a code node's Why / Questions / Sessions, one
// decision/question/session record, and the onboarding starters. Records exist only as labelled preview fixtures
// (map-memory-data.js); without them every section says what is not recorded. Nothing here has a text input:
// questions go through the Mothership (AgentBar's small:bar-ask), which answers an exact fixture prompt locally.
export const FIXTURE = 'Fixture · UI preview';
export const askBar = (text) => window.dispatchEvent(new CustomEvent('small:bar-ask', { detail: { text } }));
const HEAD = 'pt-4 pb-1 text-xs font-medium text-ink-2';
const ROW = 'w-full cursor-pointer rounded-sm px-1.5 py-1 text-left text-sm hover:bg-hover';
const CHIP = 'cursor-pointer rounded-md border border-line px-2 py-0.5 text-xs hover:bg-hover';
const LAYERS = [['decisions', 'Decisions'], ['questions', 'Questions'], ['sessions', 'Sessions']];
const KIND = { decision: 'Decision', question: 'Question', session: 'Session' };
const strength = (link) => (link?.confidence === 'INFERRED' ? `Inferred · ${link.score}` : 'Recorded');

export function LayersRow({ memory, layers, onToggle }) {
  return <div data-map-layers role="group" aria-label="Layers" className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
    <Layers size={14} className="text-ink-3" aria-hidden="true" />
    <button type="button" aria-pressed="true" disabled className="h-7 rounded-md border border-line bg-active px-2 text-ink">Code</button>
    {LAYERS.map(([key, name]) => {
      const n = memory?.[key].length || 0;
      return <button key={key} type="button" aria-pressed={layers.has(key)} disabled={!n} title={n ? undefined : 'None recorded yet'} onClick={() => onToggle(key)}
        className={cn('h-7 rounded-md border px-2', !n ? 'border-line text-ink-3' : layers.has(key) ? 'cursor-pointer border-accent bg-accent/10 text-ink' : 'cursor-pointer border-line text-ink-2 hover:bg-hover')}>{name}{n ? ` ${n}` : ''}</button>;
    })}
    {memory && <Pill>{FIXTURE}</Pill>}
  </div>;
}

// A selected code node: Why (its decisions), prior Questions, relevant Sessions. Counts are not popularity.
export function MemorySections({ node, memory, onPick }) {
  const m = memory && memoryFor(memory, node.id), link = (r) => r.code.find((c) => c.id === node.id);
  const section = (key, title, list, empty, row) => <section data-memory-section={key} data-count={list.length} aria-label={title}>
    <h3 className={HEAD}>{title}{m ? ` (${list.length})` : ''}</h3>
    {list.length ? <ul>{list.map((r) => <li key={r.id}>{row(r)}</li>)}</ul> : <p className="px-1.5 text-sm text-ink-3">{empty}</p>}
  </section>;
  return <div className="mt-2">
    {m && <Pill className="mt-2">{FIXTURE}</Pill>}
    {section('why', 'Why', m?.decisions || [], 'No recorded project decision explains this code yet.', (d) =>
      <button type="button" className={ROW} onClick={() => onPick(d.id)}>{d.title} <span className="text-xs text-ink-3">{strength(link(d))}</span></button>)}
    <Button size="sm" variant="secondary" className="mt-1.5" onClick={() => askBar(WHY)}>{WHY}</Button>
    {section('questions', 'Questions', m?.questions || [], 'No questions recorded yet.', (q) =>
      <button type="button" className={ROW} onClick={() => askBar(q.question)}>{q.question} {!q.resolved && <span className="text-xs text-ink-3">Not resolved</span>}</button>)}
    {section('sessions', 'Sessions', m?.sessions || [], 'No sessions recorded yet.', (s) =>
      <button type="button" className={ROW} onClick={() => onPick(s.id)}>{s.title} <span className="text-xs text-ink-3">{s.at}</span></button>)}
  </div>;
}

// One record, with its provenance. Code chips select the code (the "take me to the code" action).
export function MemoryEntity({ node, memory, graph, onPick, onCode }) {
  const r = node.record, session = r.session && memory.sessions.find((s) => s.id === r.session);
  const field = (label, value) => value && <div className="pt-3"><p className="text-xs text-ink-3">{label}</p><div className="text-sm">{value}</div></div>;
  const pick = (x) => <button key={x.id} type="button" className={ROW} onClick={() => onPick(x.id)}>{titleOfRecord(x)}</button>;
  return <div data-memory-entity={node.kind}>
    <Pill>{FIXTURE}</Pill>
    <p className="pt-3 text-xs text-ink-3">{KIND[node.kind]}</p>
    <strong className="text-sm">{titleOfRecord(r)}</strong>
    {node.kind === 'decision' && <>
      {field('Rationale', r.rationale)}
      {field('Alternatives considered', r.alternatives.length ? <ul className="list-disc pl-5">{r.alternatives.map((a) => <li key={a}>{a}</li>)}</ul> : null)}
      {field('Recorded by', `${r.who}${r.agent ? ` with ${r.agent}` : ''} · ${r.at}`)}
      {field('Evidence', r.evidence.length ? r.evidence.map((e) => <p key={`${e.path}:${e.line}`} className="font-mono text-xs">{e.path}:{e.line} <span className="font-sans text-ink-3">{e.note}</span></p>) : null)}
    </>}
    {node.kind === 'question' && field('Answer', r.resolved ? r.answer : 'Not resolved yet')}
    {node.kind === 'question' && <Button size="sm" variant="secondary" className="mt-3" onClick={() => askBar(r.question)}>Ask this again</Button>}
    {node.kind === 'session' && <>
      {field('Summary', r.summary)}
      {field('With', `${r.participant}${r.agent ? ` and ${r.agent}` : ''} · ${r.at}`)}
      {field('Decisions', memory.decisions.filter((d) => d.session === r.id).map(pick))}
      {field('Questions', memory.questions.filter((q) => q.session === r.id).map(pick))}
    </>}
    {session && field('Session', pick(session))}
    {field(node.kind === 'session' ? 'Code touched' : 'Code', <div className="flex flex-col gap-1 pt-0.5">{r.code.map((c) => {
      const n = graph.nodes.find((x) => x.id === c.id);
      return n && <span key={c.id} className="flex items-center gap-2"><button type="button" className={CHIP} onClick={() => onCode(n)}>{n.label}</button><span className="text-xs text-ink-3">{strength(c)}</span></span>;
    })}</div>)}
  </div>;
}

// An empty Map conversation: quiet onboarding prompts, sent through the Mothership.
export function Starters() {
  return <div data-map-starters className="flex flex-col items-start gap-1.5">
    <p className="text-xs text-ink-3">New to this codebase? Start with:</p>
    {STARTERS.map((s) => <button key={s} type="button" onClick={() => askBar(s)} className="cursor-pointer rounded-md border border-line px-2.5 py-1 text-left text-sm text-ink-2 hover:bg-hover hover:text-ink">{s}</button>)}
  </div>;
}
