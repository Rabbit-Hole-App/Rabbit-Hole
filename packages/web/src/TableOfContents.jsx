// The Table of contents tab (R4 redesign, owner decisions 2026-10-15 1A, 2A, 3A, 6A, 7A). The table of contents IS the
// lesson's structure, kept as its own list (owner brief 2026-10-23: adding, applying or editing a section changes the contents
// only, never a canvas object; learn-outline-model.js tocOf), and the learner and the Tutor both author it. It reads as a numbered syllabus - 1, 1.1, 1.1.1 (owner brief 2026-10-16 item 7, mockup reference 4;
// it was "Topic 1") - each section expanding and collapsing its sub-sections, with an optional description under
// each title and a thin guide line through the topic markers. The round controls are checkboxes: completion changes only
// when the learner clicks one, never because a section is visible, open or discussed. Dragging a row moves its entry, its
// sub-sections with it; clicking a title frames its linked canvas heading, if any.
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronRight, GripVertical, Heading1, Heading2, Heading3, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button, toast } from './ui.jsx';
import { api } from './api.js';
import { DESCRIPTION_MAX, evidenceOf, outlineTree, proposalProblem } from './learn-outline-model.js';
import { STATUS_LABEL, fetchProgress } from './learn-progress-client.js';

const SECTION_LEVELS = [[1, 'Section', Heading1], [2, 'Sub-section', Heading2], [3, 'Sub-sub-section', Heading3]];
const LEVEL_NAMES = { 1: 'section', 2: 'sub-section', 3: 'sub-sub-section' };

// outline: outlineFrom entries. canvasApi: the canvas commands (applyOutline, moveSection, toggleSectionDone, removeSection).
// onShow(id): frame that section. proposal: the Tutor's { ops, base, source } (contract C6; a bare ops array from an older
// emitter reads as ops with no base), cleared through onProposal(null). activeId: the section being viewed (the canvas
// decides which). readOnly: a viewer - titles navigate, nothing edits, drags or ticks. className: the scroll container's
// sizing, owned by the page.
// subtitle: the project or repository the contents belong to; goal: the learner's accepted learning goal (LearnPage: the
// structured goal record, never a planning message; draft Task 11, acceptance 52), clamped to two lines, or null for none.
// Both under the heading (owner brief 2026-10-16 item 7).
// Tutor Task 11 (C:/s/spec/tutor-workflow/draft.md "Table of Contents, tutoring, and progress"), all of it this learner's own
// and never written into a heading: plan (learn-outline-model.js outlinePlan: linked, steps, learningNow) or null;
// planRevision, the accepted plan a proposal must still match; evidence { app, board, goalId, revision } reads that goal's
// Progress for the linked headings' badges (no model call); onProgress opens Progress; onResume is Start/Resume of the
// current step (the controls rule is the caller's). Viewing (activeId) and Learning now are separate marks.
export default function TableOfContents({ outline, canvasApi, onShow, proposal, onProposal, activeId = null, readOnly = false, className = '', subtitle = null, goal = null, plan = null, planRevision = null, evidence = null, onProgress = null, onResume = null }) {
  // Which level is being added, the section being edited, the section being dragged, and the heading it lands before
  // (null: the end).
  const [adding, setAdding] = useState(null);
  const [editing, setEditing] = useState(null);
  const [drag, setDrag] = useState(null);
  const [drop, setDrop] = useState(undefined);
  const pressed = useRef(null);
  const [progress, setProgress] = useState(null);
  const [openStep, setOpenStep] = useState(null);
  // The linked goal's Progress, read on open and whenever the learner's saved state moves on (an assessment landed). A failed
  // read shows no badge rather than a wrong one.
  const linkedIds = Object.keys(plan?.linked || {}).join();
  useEffect(() => {
    let live = true;
    setProgress(null);
    if (evidence?.goalId && linkedIds) fetchProgress(api, { app: evidence.app, board: evidence.board }, evidence.goalId).then(view => { if (live) setProgress(view); }, () => {});
    return () => { live = false; };
  }, [evidence?.app, evidence?.board, evidence?.goalId, evidence?.revision, linkedIds]);
  const learning = plan?.learningNow;
  const learningMark = <span data-toc-learning-now className="inline-flex shrink-0 items-center rounded-full bg-accent/10 px-1.5 text-[11px] leading-5 font-medium text-accent">Learning now</span>;
  const resume = onResume && <button type="button" data-toc-resume onClick={onResume} title="Start or resume this activity in Chat" className="shrink-0 rounded px-1 text-[11px] leading-5 font-medium text-ink-2 underline-offset-2 hover:text-ink hover:underline">Resume</button>;
  // The sections whose sub-sections are folded away. The tab stays mounted while hidden, so this survives view switches.
  const [folded, setFolded] = useState(() => new Set());
  const fold = id => setFolded(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const tree = outlineTree(outline);
  const shown = proposal && !readOnly ? (Array.isArray(proposal) ? { ops: proposal, base: null } : proposal) : null;
  const endDrag = () => { setDrag(null); setDrop(undefined); };
  const save = (entry, title, description) => {
    const ops = [];
    if (title && title !== entry.label) ops.push({ op: 'retitle', id: entry.id, text: title });
    if (description !== entry.description) ops.push({ op: 'describe', id: entry.id, description });
    if (ops.length) canvasApi.current?.applyOutline(ops);
    setEditing(null);
  };

  const row = node => {
    const { entry, number, index } = node;
    const topic = entry.level === 1 && number;
    const active = entry.id === activeId;
    return (
      <div data-toc-entry={entry.id} data-level={entry.level} data-done={entry.done || undefined} data-active={active || undefined}
        draggable={!readOnly && editing !== entry.id}
        onPointerDownCapture={event => { pressed.current = event.target; }}
        onDragStart={event => {
          // The circle, the edit and delete buttons and the text being edited never start a drag.
          if (pressed.current?.closest?.('[data-no-drag]')) { event.preventDefault(); return; }
          event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', entry.id); setDrag(entry.id);
        }}
        onDragOver={event => {
          if (!drag) return;
          event.preventDefault();
          event.stopPropagation();
          const box = event.currentTarget.getBoundingClientRect();
          setDrop(event.clientY < box.top + box.height / 2 ? entry.id : outline[index + 1]?.id ?? null);
        }}
        onDrop={event => { event.preventDefault(); event.stopPropagation(); if (drag && drop !== undefined) canvasApi.current?.moveSection(drag, drop); endDrag(); }}
        className={`group relative flex items-start gap-3 rounded-sm ${drag === entry.id ? 'opacity-40' : ''} ${drag && drop === entry.id ? 'shadow-[0_-2px_0_0_var(--color-accent)]' : ''} ${drag && drop === null && index === outline.length - 1 ? 'shadow-[0_2px_0_0_var(--color-accent)]' : ''}`}>
        {!readOnly && <GripVertical size={14} aria-hidden className={`absolute -left-4 ${topic ? 'top-[5px]' : 'top-[3px]'} cursor-grab text-ink-3 opacity-0 group-hover:opacity-100`} />}
        <Circle entry={entry} topic={topic} active={active} readOnly={readOnly} onToggle={() => canvasApi.current?.toggleSectionDone(entry.id)} />
        {number && <span data-toc-number className={`${topic ? 'min-w-[18px] pt-[3px] text-xs' : `${entry.level === 3 ? 'min-w-12' : 'min-w-9'} pt-px text-[13px]`} -mr-1 shrink-0 leading-5 text-ink-2 tabular-nums`}>{number}</span>}
        {editing === entry.id ? <Editor entry={entry} topic={topic} onSave={(title, description) => save(entry, title, description)} onCancel={() => setEditing(null)} /> : (
          <div className="min-w-0 flex-1">
            <button type="button" title={readOnly ? undefined : 'Double-click to edit'} aria-current={active ? 'location' : undefined}
              onClick={() => onShow?.(entry.id)} onDoubleClick={readOnly ? undefined : () => setEditing(entry.id)}
              className={`rounded-sm text-left break-words hover:text-accent ${topic || entry.level === 1 ? 'text-base leading-6 font-semibold' : 'text-sm leading-5 font-medium'} ${active ? 'text-accent' : 'text-ink'}`}>
              {entry.label}
            </button>
            {entry.description && <p className={`mt-1 break-words text-ink-2 ${entry.level === 1 ? 'text-sm leading-normal' : 'text-[13px] leading-normal'}`}>{entry.description}</p>}
            {learning?.headingId === entry.id && <div className="mt-1 flex flex-wrap items-center gap-1">{learningMark}{resume}</div>}
            {/* Named by the criterion, never by the heading: a renamed section cannot relabel what was assessed. */}
            {evidenceOf(plan?.linked[entry.id], progress).map(badge => (
              <button key={badge.criterionId} type="button" data-toc-evidence={badge.status} onClick={() => onProgress?.(badge.criterionId)} title="Your evidence, visible only to you. Open Progress"
                className="mt-1 block text-left text-xs leading-5 text-ink-2 underline-offset-2 hover:text-ink hover:underline">{badge.label}: {STATUS_LABEL[badge.status]?.toLowerCase()}</button>
            ))}
          </div>
        )}
        {!readOnly && editing !== entry.id && (
          <div data-no-drag className="flex shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 max-md:opacity-100">
            <button type="button" aria-label={`Edit ${entry.label}`} title="Edit title and description" onClick={() => setEditing(entry.id)}
              className="flex h-6 w-6 items-center justify-center rounded text-ink-3 hover:bg-hover hover:text-ink"><Pencil size={14} /></button>
            {/* Removes the entry from the contents only; the canvas and any saved learning stay, and Ctrl+Z brings it back. */}
            <button type="button" aria-label={`Remove heading ${entry.label}`} title="Remove from the contents (the canvas stays; Ctrl+Z undoes it)" onClick={() => canvasApi.current?.removeSection(entry.id)}
              className="flex h-6 w-6 items-center justify-center rounded text-ink-3 hover:bg-hover hover:text-red-700"><Trash2 size={14} /></button>
          </div>
        )}
        {node.children.length > 0 && (
          <button type="button" data-no-drag data-toc-fold aria-expanded={!folded.has(entry.id)} aria-label={`${folded.has(entry.id) ? 'Expand' : 'Collapse'} ${entry.label}`}
            onClick={() => fold(entry.id)} className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-ink-3 hover:bg-hover hover:text-ink">
            <ChevronRight size={16} aria-hidden className={folded.has(entry.id) ? '' : 'rotate-90'} /></button>
        )}
      </div>
    );
  };

  // The guide line runs from each topic marker's centre (12px down a 24px row, 12px in) to the next topic's, through
  // the descriptions and sub-sections between them, so it follows whatever height the rows wrap to. It marks
  // hierarchy only: never completion or locking.
  const list = (nodes, depth) => (
    <ol className={depth ? 'mt-3.5 ml-6 space-y-3.5' : 'space-y-7'}>
      {nodes.map((node, at) => (
        <li key={node.entry.id} className={!depth && at < nodes.length - 1 ? 'relative before:absolute before:top-3 before:-bottom-10 before:left-[11.5px] before:w-px before:bg-line' : undefined}>
          {row(node)}
          {node.children.length > 0 && !folded.has(node.entry.id) && list(node.children, depth + 1)}
        </li>
      ))}
    </ol>
  );

  return (
    <div data-toc className={className} onDragEnd={endDrag}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <h2 className="text-base font-semibold text-ink">Table of contents</h2>
        {!readOnly && (
          <div className="flex items-center gap-0.5 text-ink-2">
            <Plus size={15} aria-hidden className="mr-0.5 text-ink-3" />
            {SECTION_LEVELS.map(([level, label, Icon]) => (
              <button key={level} type="button" onClick={() => setAdding(level)} aria-label={`Add a ${label.toLowerCase()}`} title={`Add a ${label.toLowerCase()}`}
                className="flex h-7 w-7 items-center justify-center rounded hover:bg-hover hover:text-ink"><Icon size={17} /></button>
            ))}
          </div>
        )}
      </div>
      {/* shrink-0: overflow-hidden lines in this flex column otherwise collapse to nothing once the contents overflow. */}
      {subtitle && <p data-toc-subtitle className="-mt-2 mb-2 shrink-0 truncate text-xs text-ink-3">{subtitle}</p>}
      {goal && <p data-toc-goal title={goal} className="mb-4 shrink-0 line-clamp-2 text-[13px] leading-normal break-words text-ink-2"><span className="font-medium text-ink">Goal</span> · {goal}</p>}
      {shown && <ProposalCard proposal={shown} outline={outline} planRevision={planRevision} canvasApi={canvasApi} onDone={() => onProposal?.(null)} />}
      {list(tree, 0)}
      {plan?.steps.length > 0 && (
        <section data-toc-plan aria-label="Planned steps" className="mt-7">
          <h3 className="mb-2 text-xs font-medium text-ink-2">Planned steps</h3>
          <ol className="space-y-2.5">
            {plan.steps.map(step => (
              <li key={step.sectionId} data-toc-step={step.sectionId} data-state={step.state} className="text-sm">
                {/* Opening a planned step shows its purpose; it never prepares the lesson. */}
                <button type="button" aria-expanded={openStep === step.sectionId} onClick={() => setOpenStep(id => (id === step.sectionId ? null : step.sectionId))}
                  className="text-left break-words text-ink hover:text-accent"><span className="text-ink-2 tabular-nums">{step.n}.</span> {step.title}</button>
                <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-ink-3">
                  <span>{step.state === 'removed' ? 'Section removed: its cards and your saved work are kept' : 'Planned — material not prepared'}</span>
                  {learning?.sectionId === step.sectionId && <>{learningMark}{resume}</>}
                </div>
                {openStep === step.sectionId && <p data-toc-step-purpose className="mt-1 text-xs leading-normal text-ink-2">{step.purpose}</p>}
              </li>
            ))}
          </ol>
        </section>
      )}
      {adding && (
        <div style={{ paddingLeft: (adding - 1) * 24 + 36 }} className="mt-3 flex items-center gap-2">
          <input autoFocus aria-label={`New ${SECTION_LEVELS[adding - 1][1].toLowerCase()} title`} placeholder={`${SECTION_LEVELS[adding - 1][1]} title`}
            onKeyDown={event => {
              if (event.key === 'Escape') setAdding(null);
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
            onBlur={event => {
              const text = event.currentTarget.value.trim();
              if (text) canvasApi.current?.applyOutline([{ op: 'add', level: adding, text, after: null }]);
              setAdding(null);
            }}
            className="h-8 min-w-0 flex-1 rounded border border-line px-2 text-base outline-none focus:border-ink-3" />
        </div>
      )}
    </div>
  );
}

// The completion control: a real checkbox (its semantics, keyboard and label unchanged), drawn as a 16px circle on a
// 24px hit area - empty and outlined when open, filled with a check when done. The section being viewed gets a ring,
// so "here" never reads as "done".
function Circle({ entry, topic, active, readOnly, onToggle }) {
  return (
    <label data-no-drag className={`relative flex w-6 shrink-0 items-center justify-center ${topic || entry.level === 1 ? 'h-6' : 'h-5'} ${readOnly ? '' : 'cursor-pointer'}`}>
      <input type="checkbox" checked={entry.done} disabled={readOnly} aria-label={`${entry.label} done`} onChange={onToggle}
        className={`peer absolute -inset-y-0.5 inset-x-0 m-0 appearance-none rounded-full ${readOnly ? '' : 'cursor-pointer'}`} />
      <span aria-hidden className={`pointer-events-none flex h-4 w-4 items-center justify-center rounded-full border-[1.5px] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent ${entry.done ? 'border-accent bg-accent text-white' : 'border-ink-3 bg-white'} ${active ? 'ring-[3px] ring-accent/30' : ''}`}>
        {entry.done && <Check size={11} strokeWidth={3} />}
      </span>
    </label>
  );
}

// Title and description in place: Enter or leaving the editor saves, Escape cancels. One applyOutline call, so one
// Ctrl+Z undoes both. An emptied description clears it; an emptied title keeps the old one.
function Editor({ entry, topic, onSave, onCancel }) {
  const form = useRef(null);
  // Closed once: Enter saves and unmounts the editor, and the blur that follows must not save again.
  const closed = useRef(false);
  const commit = () => {
    if (closed.current) return;
    closed.current = true;
    const data = new FormData(form.current);
    onSave(String(data.get('title')).trim(), String(data.get('description')).trim());
  };
  const keys = event => {
    if (event.key === 'Escape') { event.preventDefault(); closed.current = true; onCancel(); }
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); commit(); }
  };
  return (
    <form ref={form} data-no-drag data-toc-editor onSubmit={event => { event.preventDefault(); commit(); }}
      onBlur={event => { if (!form.current?.contains(event.relatedTarget)) commit(); }}
      className="flex min-w-0 flex-1 flex-col gap-1.5">
      <input name="title" autoFocus defaultValue={entry.label} aria-label={`Title of ${entry.label}`} maxLength={200} onKeyDown={keys} onFocus={event => event.currentTarget.select()}
        className={`h-8 min-w-0 rounded border border-line px-1.5 outline-none focus:border-ink-3 ${topic ? 'text-base font-semibold' : 'text-sm font-medium'}`} />
      <textarea name="description" defaultValue={entry.description} aria-label={`Description of ${entry.label}`} placeholder="What this section covers (optional)" maxLength={DESCRIPTION_MAX} rows={2} onKeyDown={keys}
        className="min-w-0 resize-none rounded border border-line px-1.5 py-1 text-[13px] leading-normal text-ink-2 outline-none focus:border-ink-3" />
    </form>
  );
}

// The Tutor proposes; the learner decides. Nothing here has touched the canvas yet, and Apply is one undoable step.
// Each add shows its description and sits under its parent: beneath the add that created it, or beneath a line naming
// the existing heading. A syllabus adoption can run to 96 rows (C7b), so the list scrolls inside the card and Apply and
// Discard stay in view. A proposal made against older headings, or one that no longer fits them, says so and Apply
// changes nothing (contract C7).
function ProposalCard({ proposal, outline, planRevision, canvasApi, onDone }) {
  const [refused, setRefused] = useState(null);
  const ops = Array.isArray(proposal.ops) ? proposal.ops : [];
  const problem = refused || proposalProblem(outline, proposal, planRevision);
  const titles = new Map(outline.map(entry => [entry.id, entry.label]));
  ops.forEach(op => { if (op.op === 'add' && op.key) titles.set(op.key, op.text); });
  const name = id => (titles.has(id) ? `"${titles.get(id)}"` : 'a removed section');
  const children = new Map();
  ops.forEach((op, at) => { if (op?.op === 'add' && op.parent != null) children.set(op.parent, [...(children.get(op.parent) || []), at]); });
  const keys = new Set(ops.filter(op => op?.op === 'add' && op.key != null).map(op => op.key));
  // Each op is drawn once; one whose parent never draws it (a broken proposal) falls back to the top level below.
  const drawn = new Set();
  const line = (op, nested) => (op?.op === 'add' ? <>+ {op.text}{!nested && op.level > 1 ? ` (${LEVEL_NAMES[op.level] || 'section'})` : ''}</>
    : op?.op === 'retitle' ? `Rename ${name(op.id)} to "${op.text}"`
    : op?.op === 'describe' ? `Describe ${name(op.id)}`
    : op?.op === 'set_level' ? `Make ${name(op.id)} a ${LEVEL_NAMES[op.level] || 'section'}`
    : 'An unknown change');
  const nest = list => <ul className="mt-1 ml-1 space-y-1 border-l border-line pl-2.5">{list.map(at => item(at, true))}</ul>;
  const item = (at, nested) => {
    if (drawn.has(at)) return null;
    drawn.add(at);
    const op = ops[at];
    return (
      <li key={at} className="break-words">
        {line(op, nested)}
        {(op?.op === 'add' || op?.op === 'describe') && op.description && <span className="mt-0.5 block pl-3 text-ink-3">{op.description}</span>}
        {op?.op === 'add' && op.key != null && children.has(op.key) && nest(children.get(op.key))}
      </li>
    );
  };
  const rows = [];
  ops.forEach((op, at) => {
    if (op?.op !== 'add' || op.parent == null) { rows.push(item(at, false)); return; }
    if (keys.has(op.parent) || drawn.has(at)) return;
    const group = children.get(op.parent);
    rows.push(<li key={`under-${at}`} className="break-words">Under {name(op.parent)}{nest(group)}</li>);
  });
  ops.forEach((_, at) => { if (!drawn.has(at)) rows.push(item(at, false)); });
  const apply = () => {
    const result = canvasApi.current?.applyOutline(ops, { base: proposal.base, source: proposal.source, planBase: proposal.planBase, plan: planRevision });
    if (!result?.ok) { setRefused(result?.message || 'This proposal cannot be applied.'); return; }
    if (result.skipped) toast(result.applied ? `${result.skipped} of these ${result.skipped === 1 ? 'was' : 'were'} already in the contents.` : 'Everything in this proposal is already in the contents.');
    onDone();
  };
  return (
    <div data-toc-proposal className="mb-4 shrink-0 rounded-lg border border-accent/40 bg-accent/5 p-2">
      <p className="mb-1 text-xs font-medium text-ink">Proposed: {ops.length} change{ops.length === 1 ? '' : 's'}</p>
      <ul data-toc-proposal-list className="mb-2 max-h-72 space-y-1 overflow-y-auto pr-1 text-xs text-ink-2">{rows}</ul>
      {problem && <p role="alert" className="mb-2 text-xs text-danger">{problem}</p>}
      <div className="flex justify-end gap-1">
        <Button size="sm" variant="ghost" onClick={onDone}>Discard</Button>
        <Button size="sm" variant="secondary" onClick={apply}>Apply</Button>
      </div>
    </div>
  );
}
