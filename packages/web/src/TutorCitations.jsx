// Selecting evidence for a codebase Tutor answer (owner brief 2026-10-21 "Selecting evidence"): the bar a line selection shows in
// the code reader or a code card - "lines 42–47", Use in answer, Copy - while a codebase activity is shown. Use in answer adds the
// lines to the answer as one citation (tutor-citations.js); nothing is sent until the learner checks the answer.
import { useEffect, useState } from 'react';
import { Check, Copy, Quote } from 'lucide-react';
import { Button } from './ui.jsx';
import { linesText } from './learn-codebase-goals.js';
import { citeRange, citedFile, useCitations } from './tutor-citations.js';

// range: { repo, commit, path, start, end }; text: the selected lines, for Copy. Shows nothing when this file is not one the
// shown activity cites. onDone: called once the lines are in the answer.
export function CiteActions({ range, text, onDone }) {
  const { target } = useCitations();
  const [note, setNote] = useState(null), [copied, setCopied] = useState(false);
  useEffect(() => { setNote(null); }, [range?.path, range?.start, range?.end]);
  useEffect(() => { if (!copied) return undefined; const timer = setTimeout(() => setCopied(false), 1500); return () => clearTimeout(timer); }, [copied]);
  if (!citedFile(range, target)) return null;
  const copy = async () => { try { await navigator.clipboard.writeText(text || ''); setCopied(true); } catch { /* a refused clipboard copies nothing */ } };
  return <span data-cite-actions className="flex items-center gap-0.5">
    <span data-cite-lines className="px-1.5 font-mono text-[11px] text-ink-2">{linesText(range.start, range.end)}</span>
    <Button size="sm" data-cite-use onClick={() => { const why = citeRange(range); setNote(why); if (!why) { window.getSelection()?.removeAllRanges(); onDone?.(); } }}><Quote size={13} aria-hidden />Use in answer</Button>
    <Button size="sm" data-cite-copy onClick={copy}>{copied ? <><Check size={13} aria-hidden />Copied</> : <><Copy size={13} aria-hidden />Copy</>}</Button>
    {note && <span role="status" data-cite-note className="max-w-60 px-1.5 text-[11px] whitespace-normal text-ink-2">{note}</span>}
  </span>;
}

// A code card's lines (each element carrying data-<lineAttr> with its file line number) made selectable for a citation: a
// selection inside them shows the bar under the lines. source: { repo, commit, path } of the card, or null for a card that is
// not repository code.
export function CitableLines({ source, lineAttr = 'citeLine', className = '', children }) {
  const { target } = useCitations();
  const [range, setRange] = useState(null);
  const on = !!source && !!citedFile({ ...source, start: 1, end: 1 }, target);
  if (!on) return children;
  const read = event => {
    const box = event.currentTarget, selection = window.getSelection();
    if (!selection || selection.isCollapsed || !box.contains(selection.anchorNode) || !box.contains(selection.focusNode)) return;
    const at = selection.getRangeAt(0), key = `[data-${lineAttr.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}]`;
    const row = node => (node.nodeType === 1 ? node : node.parentElement)?.closest(key);
    const a = Number(row(at.startContainer)?.dataset[lineAttr]), b = Number(row(at.endContainer)?.dataset[lineAttr]);
    if (!a || !b) return;
    const end = b > a && at.endOffset === 0 ? b - 1 : b;
    setRange({ ...source, start: Math.min(a, end), end: Math.max(a, end), text: selection.toString() });
  };
  return <div data-citable-lines onPointerDown={event => { event.stopPropagation(); if (!event.target.closest('[data-cite-actions]')) setRange(null); }} onPointerUp={read} onKeyUp={read} className={`relative ${className}`}>
    {children}
    {range && <div role="toolbar" aria-label={`Selected ${linesText(range.start, range.end)}`} className="sticky bottom-0 mt-1 flex w-fit items-center rounded-md bg-white p-1 font-sans whitespace-nowrap shadow-pop select-none">
      <CiteActions range={range} text={range.text} onDone={() => setRange(null)} />
    </div>}
  </div>;
}
