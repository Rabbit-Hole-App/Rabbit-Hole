import { Layers } from 'lucide-react';
import { Button, cn, Pill } from './ui.jsx';
import { STARTERS, titleOfRecord } from './map-memory.js';
import { askDraft as askBar } from './agent/scope.js';

// The Map's work-memory UI (WP6 checkpoint 2): the Layers row, one decision/question/session record, and the onboarding
// starters (a code node's decisions, questions and sessions show in its inspector, MapInspector.jsx). Records exist only as labelled preview fixtures
// (map-memory-data.js); without them every section says what is not recorded. Nothing here has a text input:
// a starter or a prior question is written into the Mothership's composer, never sent (owner, 2026-10-08); on Send the bar
// answers an exact fixture prompt locally.
export const FIXTURE = 'Fixture · UI preview';
export { askBar };
const ROW = 'w-full cursor-pointer rounded-sm px-1.5 py-1 text-left text-sm hover:bg-hover';
const CHIP = 'cursor-pointer rounded-md border border-line px-2 py-0.5 text-xs hover:bg-hover';
const LAYERS = [['decisions', 'Decisions'], ['questions', 'Questions'], ['sessions', 'Sessions']];
const KIND = { decision: 'Decision', question: 'Question', session: 'Session' };
const strength = (link) => (link?.confidence === 'INFERRED' ? `Inferred · ${link.score}` : 'Recorded');

// The Layers panel (owner brief §3, repo-graph clarification): node types to show, as checkboxes, several at once. Code is
// always on. Decisions, Questions and Sessions are first-class types with no canonical record yet (repository-graph-data-audit.md),
// so they say so and stay off; only the labelled review fixtures (?fixtures=1) can turn them on.
export function LayersRow({ memory, layers, onToggle }) {
  const row = 'flex h-8 items-center gap-2 rounded-sm px-1.5 text-sm';
  return <div data-map-layers role="group" aria-label="Layers">
    <p className="flex items-center gap-2 px-1.5 pt-0.5 pb-1 text-xs font-medium text-ink-2"><Layers size={14} className="text-ink-3" aria-hidden="true" />Layers{memory && <Pill className="ml-auto">{FIXTURE}</Pill>}</p>
    <label className={row}><input type="checkbox" checked readOnly disabled className="accent-ink" />Code</label>
    {LAYERS.map(([key, name]) => {
      const n = memory?.[key].length || 0;
      return <label key={key} className={cn(row, n ? 'cursor-pointer hover:bg-hover' : 'text-ink-3')}>
        <input type="checkbox" checked={layers.has(key)} disabled={!n} onChange={() => onToggle(key)} className="accent-ink" />{name}
        <span className="ml-auto text-xs text-ink-3">{n ? n : 'none recorded yet'}</span></label>;
    })}
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
