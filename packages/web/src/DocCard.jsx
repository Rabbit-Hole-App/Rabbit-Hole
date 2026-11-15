import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import CardHeader from './CardHeader.jsx';
import { CardActionRows } from './CanvasMenu.jsx';
import CanvasDoc from './CanvasDoc.jsx';
import { unknownDocBlock } from './canvas-doc.js';
import { openRunbookLink } from './learn-runbook.js';

// A BlockNote document as a card (owner decision 2026-11-14, docs/features/blocknote-canvas.md): the Notebook card's shell (CardHeader, its three-dot
// menu on the card's own action rows; the drag strip and corner resize are CanvasNode's, AdaptiveCanvas DocNode) around CanvasDoc's editor, which scrolls inside.
// data-canvas-doc is the marker the canvas's one document carries, so the canvas's keyboard, wheel, focus-keeping press (canvas-doc.js pressKeepsDocFocus) and
// native-menu rules apply to this editor unchanged.
// block.blocks: the native document, read once when the editor is made. onBlocks(blocks): the document after a typing pause, as a quiet patch on the card
// (not a canvas undo step). onLive(blocks | null): the words typed in the pause, so every save path can read them (AdaptiveCanvas docCardLive).
export default function DocCard({ block, readOnly, onBlocks, onLive }) {
  const [menu, setMenu] = useState(false), [epoch, setEpoch] = useState(0);
  const latest = useRef(null), timer = useRef(null), pending = useRef(null);
  latest.current = { onBlocks, onLive };
  // The blocks this editor started from or last reported: a card whose blocks are anything else was changed from outside (a canvas undo or redo).
  const known = useRef(block.blocks);
  const flush = () => {
    clearTimeout(timer.current); timer.current = null;
    const next = pending.current;
    if (!next) return;
    pending.current = null;
    known.current = next;
    latest.current.onBlocks(next);
    latest.current.onLive(null);
  };
  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!block.blocks || block.blocks === known.current) return;
    // The editor reads its blocks once, so changed content gets a new editor; words typed since are the older edit and give way.
    known.current = block.blocks;
    clearTimeout(timer.current); timer.current = null; pending.current = null;
    latest.current.onLive(null);
    setEpoch(value => value + 1);
  }, [block.blocks]);
  const change = next => {
    pending.current = next;
    latest.current.onLive(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 500);
  };
  const action = 'flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-ink-2 hover:bg-hover hover:text-ink disabled:opacity-40';
  const stop = event => event.stopPropagation();
  // The Runbook (a generated card, rehearsal-cards.js) cites the repository as links at its commit: ONE delegated click on the editor turns a click on such a link into Files at those
  // lines (small:open-code, as TutorCodebase.jsx openFiles), and GitHub at that commit when nothing answers. Any other link in any document is left to the editor.
  const source = block.generated?.kind === 'rehearsal' ? block.generated : null;
  const follow = event => {
    const link = source && event.target.closest?.('a[href]');
    if (link && openRunbookLink(link.getAttribute('href'), { app: source.app, repo: source.repo, commit: source.commit })) { event.preventDefault(); event.stopPropagation(); }
  };
  return (
    <>
      <CardHeader block={block} className="relative px-4 pb-2" meta="Document" trailing={<>
        <button type="button" aria-label="More document actions" className={action} onPointerDown={stop} onClick={() => setMenu(open => !open)}><MoreHorizontal size={14} /></button>
        {menu && (
          // The card's own rows from the canvas action registry, run like the right-click menu's (CanvasMenu.jsx), as the Notebook card's.
          <div role="menu" aria-label="Document actions" data-card-menu className="absolute top-8 right-3 z-30 w-60 rounded-lg border border-line bg-white p-1 shadow-md" onPointerDown={stop}>
            <CardActionRows id={block.id} groups={['primary', 'clipboard', 'lock', 'delete']} onDone={() => setMenu(false)} />
          </div>
        )}
      </>} />
      <div data-canvas-doc data-doc-card data-scroll onClickCapture={follow} className="min-h-0 flex-1 overflow-y-auto rounded-b-xl border-t border-line py-2 [&_.bn-editor]:px-3">
        {unknownDocBlock(block.blocks)
          ? <p role="alert" className="px-4 py-2 text-sm text-ink-2">This document holds content this version cannot edit, so it opens read-only here. Nothing in it was changed.</p>
          : <CanvasDoc key={epoch} blocks={block.blocks} editable={!readOnly} onChange={change} />}
      </div>
    </>
  );
}
