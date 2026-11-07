// The Table of contents tab (R4 redesign, owner decisions 2026-10-15 1A, 2A, 3A, 6A, 7A). The table of contents IS the
// lesson's structure, kept as its own list (owner brief 2026-10-23: adding, applying or editing a section changes the contents
// only, never a canvas object; learn-outline-model.js tocOf), and the learner and the Tutor both author it. It reads as a numbered syllabus - 1, 1.1, 1.1.1 (owner brief 2026-10-16 item 7, mockup reference 4;
// it was "Topic 1") - each section expanding and collapsing its sub-sections, with an optional description under
// each title and a thin guide line through the topic markers. The round controls are checkboxes: completion changes only
// when the learner clicks one, never because a section is visible, open or discussed. Dragging a row moves its entry, its
// sub-sections with it; clicking a title frames its linked canvas heading, if any.
import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, ChevronRight, Ellipsis, GripVertical, Heading1, Heading2, Heading3, Link as AddLinkIcon, Link2, LocateFixed, MessageSquarePlus, Pencil, Plus, TextSelect, Trash2, X } from 'lucide-react';
import { Button, Menu, MenuItem, toast } from './ui.jsx';
import { cardLink } from './canvas-refs-model.js';
import { moveTargets } from './toc-move.js';
import { ancestorsOf, linkedCards } from './toc-links.js';
import { DESCRIPTION_MAX, outlineTree, proposalProblem, withRoadmap } from './learn-outline-model.js';
import { keyLabel } from './shortcuts.js';

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
// roadmap: useRoadmap (UI.02): its accepted steps are rows of this same tree (withRoadmap), in this one scroller, with their description and
// status line; a title navigates to the step's slot or card (roadmap.go), never generates. No roadmap list, parameters, actions or composer here.
// top: legacy slot, still drawn under the heading.
// tocLinks: [[cardId, title, entryIds]] (the canvas's report of which card links to which section, toc-links.js): each row lists its linked cards, and
// onAddLink(entryId) opens the card picker ("Add a link"). flash: { id, key } - a card's link to a section was pressed: unfold, scroll to and highlight that row for a moment.
const doneKey = id => `rh.toc.roadmap-done.${id}`;
// A contents row's Add to chat (owner approved 2026-11-07): its context ref goes to the CONTENTS composer as a pill (onAddToChat), never to the right-hand Chat.
export function addRowToConversation(canvasApi, id, onAddToChat, notify = () => {}) {
  const ref = canvasApi.current?.refForSection?.(id);
  if (ref && onAddToChat) { onAddToChat(ref); return true; }
  notify('Could not add this to the conversation');
  return false;
}
export default function TableOfContents({ outline: own, canvasApi, onAddToChat = null, tocLinks = [], onAddLink = null, flash = null, onShow, proposal, onProposal, activeId = null, readOnly = false, className = '', subtitle = null, goal = null, top = null, roadmap = null }) {
  // A roadmap row's manual done mark is the learner's own, kept per roadmap in this browser; it never means delivered, paid or understood.
  const rid = roadmap?.toc?.roadmapId ?? null;
  const [roadmapDone, setRoadmapDone] = useState(() => new Set());
  useEffect(() => { try { setRoadmapDone(new Set(rid ? JSON.parse(localStorage.getItem(doneKey(rid)) || '[]') : [])); } catch { setRoadmapDone(new Set()); } }, [rid]);
  const toggleRoadmapDone = stepId => setRoadmapDone(previous => { const next = new Set(previous); if (next.has(stepId)) next.delete(stepId); else next.add(stepId); try { localStorage.setItem(doneKey(rid), JSON.stringify([...next])); } catch { /* private mode */ } return next; });
  let outline;
  try { outline = withRoadmap(own, roadmap?.toc, roadmapDone); } catch (error) { console.error('[toc roadmap]', error); outline = own || []; } // a malformed roadmap never hides the ordinary outline
  // Which level is being added, the section being edited, the section being dragged, and the heading it lands before
  // (null: the end).
  const [adding, setAdding] = useState(null);
  const [editing, setEditing] = useState(null);
  const [drag, setDrag] = useState(null);
  const [drop, setDrop] = useState(undefined);
  const [confirming, setConfirming] = useState(null); // the row id whose delete is waiting for Confirm or Cancel (one popover at a time)
  const pressed = useRef(null);
  // The sections whose sub-sections are folded away. The tab stays mounted while hidden, so this survives view switches.
  const [folded, setFolded] = useState(() => new Set());
  const fold = id => setFolded(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const tree = outlineTree(outline);
  const rootRef = useRef(null);
  const [flashed, setFlashed] = useState(null);
  const [moreLinks, setMoreLinks] = useState(() => new Set()); // rows whose linked cards are all shown (else two and +N more)
  useEffect(() => {
    if (!flash) return undefined;
    const parents = ancestorsOf(outline, flash.id);
    if (parents.length) setFolded(previous => { const next = new Set(previous); parents.forEach(id => next.delete(id)); return next; });
    setFlashed(flash.id);
    const calm = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    // Twice a frame: the panel was just switched to this tab, so the row is laid out only after the next paints.
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => rootRef.current?.querySelector(`[data-toc-entry="${CSS.escape(flash.id)}"]`)?.scrollIntoView({ block: 'center', behavior: calm ? 'auto' : 'smooth' })));
    const timer = setTimeout(() => setFlashed(previous => (previous === flash.id ? null : previous)), 1600);
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); };
  }, [flash?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = proposal && !readOnly ? (Array.isArray(proposal) ? { ops: proposal, base: null } : proposal) : null;
  const endDrag = () => { setDrag(null); setDrop(undefined); };
  const save = (entry, title, description) => {
    const ops = [];
    if (title && title !== entry.label) ops.push({ op: 'retitle', id: entry.id, text: title });
    if (description !== entry.description) ops.push({ op: 'describe', id: entry.id, description });
    if (ops.length) canvasApi.current?.applyOutline(ops);
    setEditing(null);
  };

  // The row's overflow menu (one open at a time): Go to source text, Move up / down and Copy link. The first item takes focus when it opens; arrows,
  // Home and End move within it, Escape closes it and gives the focus back to its button; a press outside closes it (ui.jsx Menu).
  const [menuFor, setMenuFor] = useState(null);
  useEffect(() => { if (menuFor !== null) document.querySelector('[data-toc-menu] [role="menuitem"]')?.focus(); }, [menuFor]);
  const menuKeys = id => event => {
    const items = [...event.currentTarget.querySelectorAll('[role="menuitem"]')], at = items.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); items[(at + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus(); }
    else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); items[event.key === 'Home' ? 0 : items.length - 1]?.focus(); }
    else if (event.key === 'Escape') { event.stopPropagation(); setMenuFor(null); document.querySelector(`[data-toc-more="${CSS.escape(id)}"]`)?.focus(); }
  };
  // Copy link: the existing ?card=<id> address of this page (cardParam reads it on the owner and member pages); no card on the canvas, no link.
  const copyLink = async id => {
    setMenuFor(null);
    const blockId = canvasApi.current?.sectionBlockId?.(id);
    if (!blockId) { toast('There is nothing on the canvas to link to', { tone: 'error' }); return; }
    try { await navigator.clipboard.writeText(cardLink(window.location, blockId)); toast('Link copied'); } catch { toast('Could not copy the link', { tone: 'error' }); }
  };

  // A pointer press outside the open delete popover (or on another row's button) cancels it.
  useEffect(() => {
    if (confirming === null) return undefined;
    const away = event => { if (!event.target?.closest?.('[data-toc-confirm],[data-toc-delete]')) setConfirming(null); };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [confirming]);

  // A row's delete asks first, in a small popover beside its button: Cancel keeps everything; Escape or a click elsewhere cancels too.
  const confirmDelete = (entry, { title, body, label, run }) => (
    <div role="alertdialog" aria-label={title} data-toc-confirm className="absolute top-7 right-0 z-30 w-64 rounded-md border border-line bg-white p-3 text-left shadow-md"
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setConfirming(null); } }}>
      <p className="text-[13px] font-medium text-ink">{title}</p>
      <p className="mt-1 text-xs leading-normal text-ink-2">{body}</p>
      <div className="mt-2 flex justify-end gap-2">
        <Button type="button" size="sm" variant="secondary" data-toc-confirm-cancel autoFocus onClick={() => setConfirming(null)}>Cancel</Button>
        <Button type="button" size="sm" variant="danger" data-toc-confirm-delete onClick={() => { setConfirming(null); run(); }}>{label}</Button>
      </div>
    </div>
  );

  const row = node => {
    const { entry, number, index } = node;
    const topic = entry.level === 1 && number;
    const active = entry.id === activeId;
    return (
      <div data-toc-entry={entry.id} data-toc-flash={flashed === entry.id || undefined} data-level={entry.level} data-done={entry.done || undefined} data-active={active || undefined}
        data-roadmap-step={entry.roadmap?.stepId} draggable={!readOnly && !entry.roadmap && editing !== entry.id}
        onPointerDownCapture={event => { pressed.current = event.target; }}
        onDragStart={event => {
          // The circle, the edit and delete buttons and the text being edited never start a drag.
          if (pressed.current?.closest?.('[data-no-drag]')) { event.preventDefault(); return; }
          event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', entry.id); setDrag(entry.id);
        }}
        onDragOver={event => {
          if (!drag || entry.roadmap) return;
          event.preventDefault();
          event.stopPropagation();
          const box = event.currentTarget.getBoundingClientRect();
          setDrop(event.clientY < box.top + box.height / 2 ? entry.id : outline[index + 1]?.id ?? null);
        }}
        onDrop={event => { event.preventDefault(); event.stopPropagation(); if (drag && drop !== undefined) canvasApi.current?.moveSection(drag, drop); endDrag(); }}
        className={`group relative flex items-start gap-3 rounded-sm transition-colors duration-700 motion-reduce:transition-none ${flashed === entry.id ? 'bg-accent/15 ring-1 ring-accent/40' : ''} ${drag === entry.id ? 'opacity-40' : ''} ${drag && drop === entry.id ? 'shadow-[0_-2px_0_0_var(--color-accent)]' : ''} ${drag && drop === null && index === outline.length - 1 ? 'shadow-[0_2px_0_0_var(--color-accent)]' : ''}`}>
        {!readOnly && !entry.roadmap && <GripVertical size={14} aria-hidden className={`absolute -left-4 ${topic ? 'top-[5px]' : 'top-[3px]'} cursor-grab text-ink-3 opacity-0 group-hover:opacity-100`} />}
        <Circle entry={entry} topic={topic} active={active} readOnly={readOnly} onToggle={() => (entry.roadmap ? toggleRoadmapDone(entry.roadmap.stepId) : canvasApi.current?.toggleSectionDone(entry.id))} />
        {number && <span data-toc-number className={`${topic ? 'min-w-[18px] pt-[3px] text-xs' : `${entry.level === 3 ? 'min-w-12' : 'min-w-9'} pt-px text-[13px]`} -mr-1 shrink-0 leading-5 text-ink-2 tabular-nums`}>{number}</span>}
        {editing === entry.id ? <Editor entry={entry} topic={topic} onSave={(title, description) => save(entry, title, description)} onCancel={() => setEditing(null)} /> : (
          <div className="min-w-0 flex-1">
            <button type="button" title={readOnly || entry.roadmap ? undefined : 'Double-click to edit'} aria-current={active ? 'location' : undefined}
              onClick={() => (entry.roadmap ? entry.roadmap.nav && roadmap?.go?.(entry.roadmap.nav) : onShow?.(entry.id))} onDoubleClick={readOnly || entry.roadmap ? undefined : () => setEditing(entry.id)}
              className={`rounded-sm text-left break-words hover:text-accent ${topic || entry.level === 1 ? 'text-base leading-6 font-semibold' : 'text-sm leading-5 font-medium'} ${active ? 'text-accent' : 'text-ink'}`}>
              {entry.label}
            </button>
            {entry.description && <p className={`mt-1 break-words text-ink-2 ${entry.level === 1 ? 'text-sm leading-normal' : 'text-[13px] leading-normal'}`}>{entry.description}</p>}
            {(() => {
              // The cards linked to this section: derived from the cards' own link lists, so a link made on a card shows here and one made here shows on the card.
              const cards = linkedCards(tocLinks, entry.id);
              if (!cards.length) return null;
              const all = moreLinks.has(entry.id), shown = all ? cards : cards.slice(0, 2);
              return (
                <div data-toc-links className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {shown.map(card => (
                    <span key={card.id} data-toc-linked-card={card.id} className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-md border border-line bg-hover/60 py-0.5 pr-0.5 pl-1.5 text-xs text-ink hover:border-line-strong hover:bg-hover">
                      <AddLinkIcon size={12} strokeWidth={1.8} aria-hidden className="shrink-0 text-ink-3" />
                      <button type="button" data-toc-linked-card-open title={`Go to ${card.title}`} onClick={() => canvasApi.current?.focusBlock(card.id)} className="max-w-44 min-w-0 truncate text-left hover:underline">{card.title}</button>
                      {!readOnly && <button type="button" data-toc-unlink aria-label={`Unlink ${card.title}`} title="Remove link" onClick={() => canvasApi.current?.removeTocLink(card.id, entry.id)} className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-ink-3 hover:bg-white hover:text-ink"><X size={12} aria-hidden /></button>}
                    </span>
                  ))}
                  {cards.length > 2 && <button type="button" data-toc-links-more aria-expanded={all} onClick={() => setMoreLinks(previous => { const next = new Set(previous); if (next.has(entry.id)) next.delete(entry.id); else next.add(entry.id); return next; })} className="rounded-md px-1.5 py-0.5 text-xs text-ink-2 hover:bg-hover hover:text-ink">{all ? 'Show fewer' : `+${cards.length - 2} more`}</button>}
                </div>
              );
            })()}
            {entry.roadmap && <div data-roadmap-status className="mt-[5px] text-[11px] leading-4 text-ink-2">{entry.roadmap.status}{entry.roadmap.removed ? ` · ${'Card removed'}` : ''}</div>}
          </div>
        )}
        {editing !== entry.id && (() => {
          // Hover actions (always shown on touch, and while one has focus): Go to card (a roadmap row whose card or pending slot is on the canvas), Edit and Delete.
          const nav = entry.roadmap?.nav, goes = nav && (nav.kind === 'card' || nav.kind === 'proposal');
          const cardId = nav?.kind === 'card' ? nav.cardId : null;
          const deletesCard = entry.roadmap && cardId && !entry.roadmap.removed && !readOnly;
          const deletesHeading = !entry.roadmap && !readOnly;
          const linksCard = !entry.roadmap && !readOnly && !!onAddLink; // "Add a link": a card, by its title, linked to this section
          // Add to chat: the heading's block, or a roadmap row's delivered card (a planned step with no card has nothing to add).
          const addId = entry.roadmap ? cardId : entry.id;
          // Overflow menu: Go to source text (a step with a source), Move up / down (a manual heading with a sibling that way), Copy link (a block to point at).
          const source = entry.roadmap?.source;
          const moves = !entry.roadmap && !readOnly ? moveTargets(own, entry.id) : { up: null, down: null };
          const linkId = entry.roadmap ? cardId : entry.id;
          const hasMenu = !!source || !!moves.up || !!moves.down || !!linkId;
          if (!goes && !deletesCard && !deletesHeading && !addId && !hasMenu && !linksCard) return null;
          const open = confirming === entry.id, menuOpen = menuFor === entry.id;
          const icon = "flex h-6 w-6 items-center justify-center rounded text-ink-3 hover:bg-hover hover:text-ink";
          return (
            <div data-no-drag data-toc-actions className="relative flex shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 max-md:opacity-100" style={open || menuOpen ? { opacity: 1 } : undefined}>
              {addId && <button type="button" data-toc-add-to-chat aria-label={"Add " + entry.label + " to chat"} title="Add to chat (the contents conversation)" onClick={() => addRowToConversation(canvasApi, addId, onAddToChat, message => toast(message, { tone: 'error' }))} className={icon}><MessageSquarePlus size={14} /></button>}
              {linksCard && <button type="button" data-toc-add-link aria-label={"Add a link to " + entry.label} title="Add a link (a card)" onClick={() => onAddLink(entry.id)} className={icon}><AddLinkIcon size={14} /></button>}
              {goes && <button type="button" data-toc-go-card aria-label={"Go to card for " + entry.label} title="Go to card" onClick={() => roadmap?.go?.(nav)} className={icon}><LocateFixed size={14} /></button>}
              {deletesHeading && <button type="button" aria-label={"Edit " + entry.label} title="Edit title and description" onClick={() => setEditing(entry.id)} className={icon}><Pencil size={14} /></button>}
              {(deletesHeading || deletesCard) && <button type="button" data-toc-delete aria-label={(deletesCard ? "Delete card " : "Remove heading ") + entry.label} aria-haspopup="dialog" aria-expanded={open} title={deletesCard ? "Delete this card from the canvas" : "Remove from the contents"} onClick={() => setConfirming(open ? null : entry.id)}
                className="flex h-6 w-6 items-center justify-center rounded text-ink-3 hover:bg-hover hover:text-red-700"><Trash2 size={14} /></button>}
              {hasMenu && <button type="button" data-toc-more={entry.id} aria-label={"More actions for " + entry.label} aria-haspopup="menu" aria-expanded={menuOpen} title="More actions"
                onClick={() => setMenuFor(menuOpen ? null : entry.id)} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setMenuFor(entry.id); } }} className={icon}><Ellipsis size={14} /></button>}
              {hasMenu && (
                <Menu open={menuOpen} onClose={() => setMenuFor(null)} className="top-7 right-0 w-48">
                  <div role="menu" aria-label={"Actions for " + entry.label} data-toc-menu onKeyDown={menuKeys(entry.id)}>
                    {source && <MenuItem role="menuitem" icon={TextSelect} data-toc-go-source onClick={() => { setMenuFor(null); roadmap?.go?.(source); }}>Go to source text</MenuItem>}
                    {moves.up && <MenuItem role="menuitem" icon={ArrowUp} data-toc-move-up onClick={() => { setMenuFor(null); canvasApi.current?.moveSection(entry.id, moves.up.before); }}>Move up</MenuItem>}
                    {moves.down && <MenuItem role="menuitem" icon={ArrowDown} data-toc-move-down onClick={() => { setMenuFor(null); canvasApi.current?.moveSection(entry.id, moves.down.before); }}>Move down</MenuItem>}
                    {linkId && <MenuItem role="menuitem" icon={Link2} data-toc-copy-link onClick={() => copyLink(linkId)}>Copy link</MenuItem>}
                  </div>
                </Menu>
              )}
              {open && (deletesCard
                ? confirmDelete(entry, { title: "Delete this card?", body: "It is removed from the canvas only. The roadmap step stays, and " + keyLabel('Mod+Z') + " brings the card back.", label: "Delete", run: () => canvasApi.current?.removeBlock(cardId) })
                : confirmDelete(entry, { title: "Remove this heading?", body: "It leaves the contents only; the canvas stays, and " + keyLabel('Mod+Z') + " brings it back.", label: "Remove", run: () => canvasApi.current?.removeSection(entry.id) }))}
            </div>
          );
        })()}
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
    <div ref={rootRef} data-toc className={className} onDragEnd={endDrag}>
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
      {top}
      {shown && <ProposalCard proposal={shown} outline={outline} canvasApi={canvasApi} onDone={() => onProposal?.(null)} />}
      {list(tree, 0)}
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
function ProposalCard({ proposal, outline, canvasApi, onDone }) {
  const [refused, setRefused] = useState(null);
  const ops = Array.isArray(proposal.ops) ? proposal.ops : [];
  const problem = refused || proposalProblem(outline, proposal);
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
    const result = canvasApi.current?.applyOutline(ops, { base: proposal.base, source: proposal.source });
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
