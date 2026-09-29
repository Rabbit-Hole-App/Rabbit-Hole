import { useEffect, useRef, useState } from 'react';
import { ChevronRight, CircleHelp, Loader2, X } from 'lucide-react';
import { parseSlash, pickerSections } from './learn-slash.js';
import PaidConfirm from './PaidConfirm.jsx';

// The Learn composer's / picker and its results (docs/features/
// learn-artifact-generation.md). The composer owns the text; this reads it,
// offers commands for a leading /, and runs a sent command through `run`
// (runLearnCommand, bound to this canvas by the page). apiRef gives the
// composer its key handler and send interception.
export default function LearnSlash({ apiRef, input, setInput, target, run, onPrompt }) {
  const [active, setActive] = useState(0);
  const [catalog, setCatalog] = useState(false);
  const [notice, setNotice] = useState(null);
  const [proposal, setProposal] = useState(null);
  const [busy, setBusy] = useState(false);
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
    intercept: raw => { if (busy) return true; exec(raw); return true; },
  };

  const tone = { error: 'text-red-700', question: 'text-ink', done: 'text-ink-2', info: 'text-ink-2', busy: 'text-ink-2' };
  let index = -1;
  return (
    <>
      {(notice || proposal) && (
        <div data-slash-result role="status" className="mb-1.5 flex items-start gap-2 rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs">
          {notice?.tone === 'busy' && <Loader2 size={13} className="mt-px shrink-0 animate-spin text-ink-2" />}
          {notice?.tone === 'question' && <CircleHelp size={13} className="mt-px shrink-0 text-accent" />}
          <div className="min-w-0 flex-1">
            {notice && <p className={tone[notice.tone] || 'text-ink-2'}>{notice.text}</p>}
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
                    <span className="shrink-0 font-medium text-ink">/{item.name}</span>
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
