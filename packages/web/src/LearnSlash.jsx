import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, ChevronRight, CircleHelp, Loader2, SquareSlash, X } from 'lucide-react';
import { parseSlash, pickerSections, releaseLine } from './learn-slash.js';
import PaidConfirm from './PaidConfirm.jsx';
import { CommandMark } from './CommandTone.jsx';

// The Learn composer's / picker and its results (docs/features/
// learn-artifact-generation.md). The composer owns the text; this reads it,
// offers commands for a leading /, and runs a sent command through `run`
// (runLearnCommand, bound to this canvas by the page). apiRef gives the
// composer its key handler and send interception.
export default function LearnSlash({ apiRef, input, setInput, target, run, onPrompt, onHelp = null, onFocusBlock = null }) {
  const [active, setActive] = useState(0);
  const [catalog, setCatalog] = useState(false);
  const [notice, setNotice] = useState(null);
  const [proposal, setProposal] = useState(null);
  const [busy, setBusy] = useState(false);
  // A command sent while one runs is held and runs after it, if the composer still shows it (learn-slash.js releaseLine).
  const held = useRef(null);
  // "More learning tools" opens in place: a click, Enter on it, or scrolling
  // to the bottom of the list. It is a way in, not a command.
  const [moreOpen, setMoreOpen] = useState(false);
  const moreHeader = useRef(null);
  const sections = busy ? null : pickerSections(input, { catalog });
  // Keyboard order: every visible command, with the collapsible section's
  // header in its place so Enter can open it.
  const items = sections?.flatMap(section => (section.collapsible ? [{ name: '__more', toggle: true }, ...(moreOpen ? section.items : [])] : section.items)) || [];
  useEffect(() => { setActive(0); if (!input.startsWith('/')) { setCatalog(false); setMoreOpen(false); } }, [input]);

  const choose = name => {
    // Opening by click or Enter brings the new tools into view.
    if (name === '__more') { if (!moreOpen) requestAnimationFrame(() => moreHeader.current?.scrollIntoView({ block: 'start' })); setMoreOpen(open => !open); return; }
    if (name === 'more') { setCatalog(true); setInput('/'); return; }
    setCatalog(false);
    setInput(`/${name} `);
  };
  const exec = async raw => {
    const name = parseSlash(raw)?.name || '';
    setInput(''); setProposal(null); setBusy(true);
    setNotice({ tone: 'busy', text: `Working on /${name}…` });
    let out;
    try { out = await run(raw, target); }
    catch (error) { out = { notice: { tone: 'error', text: error.message } }; }
    setBusy(false);
    if (out.catalog) { setNotice(null); setCatalog(true); setInput('/'); return; }
    if (out.prompt) { setNotice(null); onPrompt(out.prompt); return; }
    if (out.keep) setInput(out.keep);
    setNotice(out.notice || null);
    setProposal(out.proposal || null);
  };
  useEffect(() => {
    if (busy || held.current == null) return;
    const line = releaseLine(held.current, input);
    held.current = null;
    if (line) exec(line);
  }, [busy]); // eslint-disable-line react-hooks/exhaustive-deps
  apiRef.current = {
    onKeyDown: event => {
      if (!items.length) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        setActive(index => (index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length);
      } else if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        choose(items[Math.min(active, items.length - 1)].name);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        setInput(''); setCatalog(false);
      }
    },
    // A sent line that starts with / is a command, never a chat message.
    intercept: raw => { if (busy) { held.current = raw; return true; } exec(raw); return true; },
  };

  const tone = { error: 'text-red-700', question: 'text-ink', done: 'text-ink-2', info: 'text-ink-2', busy: 'text-ink-2' };
  let index = -1;
  return (
    <>
      {(notice || proposal) && (
        // A compact blue status box, as wide as its words; a finished card's notice opens that card.
        <div data-slash-result role="status" className="mb-1.5 flex w-fit max-w-full items-start gap-2 rounded-lg border border-[#2383e2]/30 bg-[#2383e2]/[0.07] px-3 py-2 text-sm">
          {notice?.tone === 'busy' && <Loader2 size={15} className="mt-0.5 shrink-0 animate-spin text-accent" />}
          {notice?.tone === 'question' && <CircleHelp size={15} className="mt-0.5 shrink-0 text-accent" />}
          <div className="min-w-0 flex-1">
            {notice && (notice.blockId && onFocusBlock
              ? <button type="button" data-slash-open={notice.blockId} title="Go to the card" onClick={() => onFocusBlock(notice.blockId)}
                  className="inline-flex cursor-pointer items-center gap-1 text-left font-medium text-accent hover:underline">{notice.text}<ArrowUpRight size={14} className="shrink-0" /></button>
              : <p className={tone[notice.tone] || 'text-ink-2'}>{notice.text}</p>)}
            {proposal && <PaidConfirm message={proposal.message}
              onCancel={() => setProposal(null)}
              onGenerate={() => { proposal.generate(); setProposal(null); setNotice({ tone: 'done', text: 'Generating on the canvas.' }); }} />}
          </div>
          {!busy && <button type="button" aria-label="Dismiss" onClick={() => { setNotice(null); setProposal(null); }} className="shrink-0 rounded p-0.5 text-ink-3 hover:bg-hover hover:text-ink"><X size={12} /></button>}
        </div>
      )}
      {sections && (
        <div role="listbox" aria-label="Commands" data-slash-picker className="absolute bottom-full left-0 z-30 mb-1 max-h-80 w-80 overflow-y-auto rounded-xl border border-line bg-white p-1 shadow-pop"
          onScroll={event => { const box = event.currentTarget; if (!moreOpen && box.scrollTop + box.clientHeight >= box.scrollHeight - 4) setMoreOpen(true); }}>
          {/* The full Slash commands view (View > Slash commands), one click from the palette. */}
          {onHelp && <div className="sticky top-0 z-10 -mb-7 flex justify-end"><button type="button" aria-label="Open Slash commands" title="Open Slash commands" data-slash-help onMouseDown={event => event.preventDefault()} onClick={onHelp}
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-ink-3 hover:bg-hover hover:text-ink"><SquareSlash size={15} /></button></div>}
          {items.length ? sections.map((section, sectionIndex) => (
            <div key={section.title || sectionIndex}>
              {sectionIndex > 0 && <div className="mx-2 my-1 border-t border-line" />}
              {section.collapsible ? (() => {
                index += 1;
                const mine = index;
                return (
                  <button ref={moreHeader} type="button" role="option" aria-selected={mine === active} aria-expanded={moreOpen} data-slash-more
                    onMouseEnter={() => setActive(mine)} onMouseDown={event => event.preventDefault()} onClick={() => choose('__more')}
                    className={`flex w-full items-center gap-1.5 rounded-lg px-2 pt-1.5 pb-1 text-left text-[11px] font-semibold tracking-wide text-ink-3 uppercase hover:text-ink ${mine === active ? 'bg-hover' : ''}`}>
                    <ChevronRight size={12} className={`transition-transform ${moreOpen ? 'rotate-90' : ''}`} />{section.title}
                  </button>
                );
              })() : section.title && <p className="px-2 pt-1.5 pb-1 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">{section.title}</p>}
              {(!section.collapsible || moreOpen) && section.items.map(item => {
                index += 1;
                const mine = index;
                return (
                  <button key={item.name} type="button" role="option" aria-selected={mine === active} data-slash-command={item.name}
                    onMouseEnter={() => setActive(mine)} onMouseDown={event => event.preventDefault()} onClick={() => choose(item.name)}
                    className={`flex w-full items-baseline gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${mine === active ? 'bg-hover' : ''}`}>
                    <CommandMark name={item.name} className="text-ink" />
                    <span className="truncate text-xs text-ink-2">{item.desc}</span>
                  </button>
                );
              })}
            </div>
          )) : <p className="px-2 py-1.5 text-xs text-ink-2">No command matches. Type / to see them.</p>}
        </div>
      )}
    </>
  );
}
