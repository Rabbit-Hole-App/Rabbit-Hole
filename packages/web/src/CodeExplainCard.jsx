import { useEffect, useMemo, useRef, useState } from 'react';
import { CornerDownRight, ExternalLink, FileCode, Loader2, MoreHorizontal } from 'lucide-react';
import CardHeader from './CardHeader.jsx';
import CodeLines, { lineRuns } from './CodeLines.jsx';
import TutorDiagram from './tutor-diagrams/TutorDiagram.js';
import { parseTutorDiagram } from './tutor-diagrams/spec.js';
import { CardActionRows } from './CanvasMenu.jsx';
import { toast, useDismissMenu } from './ui.jsx';
import { useChatWorkspace } from './chat-workspace.jsx';
import { useCardSource } from './use-card-source.js';
import { highlightCode } from './code-lang.js';
import { codeLanguage } from './code-language.js';
import { DEPTHS, codeRefsOf, openCode, openDetail, resolveTarget, sentenceOfRange, sentencesOf } from './code-explain.js';
import { askedFrom, highlightRange, onReveal, revealSentence, useLitRange } from './code-explain-link.js';

// The code-explain card (code-explain-card-spec.md sections 1 and 6; data contract control-plane code-explain-contract.js): one question's answer on the code itself. The Notebook / Run /
// Document card shell (CardHeader, the card's three-dot menu on the canvas action rows; the drag strip and corner resize are CanvasNode's, AdaptiveCanvas CodeExplainNode), then the
// primary file at its commit with the answer's ranges highlighted (CodeLines, the code card's lines), the explanation at the learner's depth with each anchored sentence bound to a range,
// the figure when a worked reference hit, and three suggested questions. It is the learner's card: deletable, searchable, shared like any card.
// block: the saved primary (spec 2a). readOnly: a view-only canvas, a copy or a locked card (everything renders; the suggestions are disabled). onSave(patch): a quiet patch on the card
// (the depth). present(cardId): whether a satellite is still on the board; frame(cardId): pan the camera to a card (both the canvas's, AdaptiveCanvas CodeExplainNode).
const action = 'flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-ink-2 hover:bg-hover hover:text-ink disabled:opacity-40';
const stop = event => event.stopPropagation();
const RADIO = 'h-7 rounded-md border px-2.5 text-[13px] focus-visible:outline-2 focus-visible:outline-accent'; // GenerationProposalCard's radio buttons
const MAX_HIGHLIGHTED = 3000; // ponytail: a longer file is drawn without colours (shiki over the whole file); the ranges and dimming are unaffected

export default function CodeExplainCard({ block, readOnly = false, onSave = null, present = () => true, frame = null }) {
  const chat = useChatWorkspace();
  const primary = block.files?.[0], ranges = primary?.ranges || [];
  const [depth, setDepth] = useState(block.depths?.[block.depth] ? block.depth : 'standard'), [whole, setWhole] = useState(false), [menu, setMenu] = useState(false), [flash, setFlash] = useState(null);
  useEffect(() => { if (block.depths?.[block.depth]) setDepth(block.depth); }, [block.depth]); // a canvas undo or redo changes it from outside
  const lit = useLitRange(block.id), litHere = ranges.some(range => range.id === lit) ? lit : null;
  // The primary's file, read the way a code card reads its own (use-card-source.js: by repository and commit, owner-checked), so it is the same read a satellite and the Files reader share.
  // ponytail: a share-link viewer's read goes by the link and this card's id (use-card-source.js linkRead), which the server answers only for repo-code cards, so the primary's code pane says
  // "Repository content unavailable" there until the server treats a codeExplain card as a repository card (repository-cards.js); the prose, depth switch and anchors still render.
  const source = useMemo(() => ({ id: block.id, type: 'repo-code', source: { kind: 'repository', repo: block.repo, commit: block.commit, path: primary?.path } }), [block.id, block.repo, block.commit, primary?.path]);
  const { status, lines, retry } = useCardSource(source);
  const [runs, setRuns] = useState(null);
  useEffect(() => {
    let active = true;
    setRuns(null);
    if (status === 'ready' && lines.length <= MAX_HIGHLIGHTED) highlightCode(lines.map(line => line.text).join('\n'), codeLanguage(primary?.path)).then(next => { if (active) setRuns(lineRuns(next)); });
    return () => { active = false; };
  }, [status, lines, primary?.path]);

  const sentences = useMemo(() => sentencesOf(block, depth), [block, depth]);
  const body = useRef(null);
  const choose = id => { setDepth(id); if (!readOnly && id !== block.depth) onSave?.({ depth: id }); };
  // A pressed range scrolls the prose to its sentence (and marks it for a moment); this card and a satellite both say so through code-explain-link.js.
  useEffect(() => onReveal((owner, rangeId) => {
    if (owner !== block.id) return;
    const index = sentenceOfRange(block, depth, rangeId), box = body.current, row = index >= 0 && box?.querySelector(`[data-sentence="${index}"]`);
    if (!row) return;
    const a = box.getBoundingClientRect(), b = row.getBoundingClientRect(), scale = box.offsetHeight ? a.height / box.offsetHeight : 1;
    box.scrollTop += (b.top - a.top) / scale - 8;
    setFlash(index);
  }), [block, depth]);
  useEffect(() => { if (flash == null) return undefined; const timer = setTimeout(() => setFlash(null), 1400); return () => clearTimeout(timer); }, [flash]);

  const files = target => openCode(openDetail(block, target ?? { path: primary.path, start: ranges[0]?.start, end: ranges[0]?.end }));
  const follow = targets => {
    const t = resolveTarget(block, targets[0], present);
    if (!t) return;
    highlightRange(block.id, t.id);
    if (t.place === 'card') frame?.(t.cardId);
    else if (t.place === 'link') files(t);
  };
  // A suggestion: the question goes to the chat with this card's code as context and gets its own answer (and, if it is about the code, its own card beside this one). This card is unchanged.
  const ask = async question => {
    if (!chat?.ask) return;
    codeRefsOf(block).forEach(ref => chat.addToChat(ref));
    askedFrom(block.id, question);
    if ((await chat.ask({ prompt: question })) === false) { askedFrom(null); toast('The question was not sent. Try again in a moment.'); }
  };
  // The figure slot exists only for a figure the existing diagram renderer can draw (spec: null means no slot, never an empty one).
  const figure = useMemo(() => { try { return block.figure ? parseTutorDiagram(block.figure.spec) && block.figure : null; } catch { return null; } }, [block.figure]);
  const trace = depth === 'detailed' ? block.depths?.detailed?.trace : null;
  useDismissMenu(menu, () => setMenu(false), '[data-card-menu], [aria-label="More code explanation actions"]');

  return (
    <div data-code-explain-card data-code-colors="" data-depth={depth} className="flex min-h-0 min-w-0 flex-1 flex-col">
      <CardHeader block={block} className="relative px-4 pb-2" meta={`${block.repo} @ ${String(block.commit).slice(0, 7)}`} trailing={<>
        <button type="button" data-code-explain-open className={action} title="Open these lines in Files at this commit" onPointerDown={stop} onClick={() => files(null)}><ExternalLink size={14} aria-hidden />Open in Files</button>
        <button type="button" aria-label="More code explanation actions" className={action} onPointerDown={stop} onClick={() => setMenu(open => !open)}><MoreHorizontal size={14} /></button>
        {menu && (
          <div role="menu" aria-label="Code explanation actions" data-card-menu className="absolute top-8 right-3 z-30 w-60 rounded-lg border border-line bg-white p-1 shadow-md" onPointerDown={stop}>
            <CardActionRows id={block.id} groups={['type', 'primary', 'clipboard', 'lock', 'delete']} onDone={() => setMenu(false)} />
          </div>
        )}
      </>} />
      <div ref={body} data-scroll data-code-explain-body className="pointer-events-auto min-h-0 flex-1 overflow-y-auto rounded-b-xl border-t border-line">
        <section data-code-explain-code aria-label="Code" className="border-b border-line">
          <div className="flex items-center gap-2 px-4 py-1.5">
            <FileCode size={14} aria-hidden className="shrink-0 text-ink-3" />
            <span data-code-explain-path className="min-w-0 flex-1 truncate font-mono text-xs text-ink-2" title={primary?.path}>{primary?.path}</span>
            <button type="button" data-code-explain-whole aria-pressed={whole} className={action} onClick={() => setWhole(on => !on)}>{whole ? 'Show highlighted lines' : 'Show whole file'}</button>
          </div>
          {status === 'loading' && <p role="status" className="flex items-center gap-1.5 px-4 py-2 text-xs text-ink-2"><Loader2 size={13} className="animate-spin" aria-hidden />Loading the code</p>}
          {status === 'unavailable' && <p data-code-explain-unavailable className="px-4 py-2 text-xs text-ink-2">Repository content unavailable.</p>}
          {status === 'failed' && <div role="alert" className="flex items-center gap-2 px-4 py-2 text-xs text-danger">The code could not be read.<button type="button" className={action} onClick={retry}>Retry</button></div>}
          {status === 'ready' && <CodeLines data-scroll data-code-explain-lines className="max-h-72 overflow-auto px-0 py-2 font-mono text-[12px] leading-5" onPointerDown={stop} lines={lines} runs={runs} ranges={ranges} whole={whole}
            lit={litHere} onRange={id => revealSentence(block.id, id)} />}
        </section>
        <section data-code-explain-explanation aria-label="Explanation" className="px-4 py-3">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
            <span id={`${block.id}-depth`}>Depth</span>
            <div role="radiogroup" aria-labelledby={`${block.id}-depth`} data-code-explain-depth className="inline-flex flex-wrap gap-1">
              {DEPTHS.map(([id, label]) => <button key={id} type="button" role="radio" aria-checked={id === depth} data-depth-option={id} onClick={() => id !== depth && choose(id)}
                className={`${RADIO} ${id === depth ? 'border-accent bg-accent font-medium text-white' : 'border-line bg-surface text-ink hover:bg-hover'}`}>{label}</button>)}
            </div>
          </div>
          <p data-code-explain-prose className="text-sm leading-6 text-ink">
            {sentences.map(sentence => {
              const anchored = sentence.targets.length > 0, opens = sentence.targets.map(id => resolveTarget(block, id, present)).filter(target => target?.place === 'link');
              return <span key={sentence.index}>
                <span data-sentence={sentence.index} {...(anchored ? { 'data-anchor': sentence.targets.join(' '), role: 'button', tabIndex: 0 } : {})}
                  className={anchored ? `rounded-sm underline decoration-dotted decoration-ink-3 underline-offset-2 hover:bg-accent/10 focus-visible:bg-accent/10 ${flash === sentence.index ? 'bg-accent/15' : ''}` : flash === sentence.index ? 'bg-accent/15' : undefined}
                  {...(anchored ? { onPointerEnter: () => highlightRange(block.id, sentence.targets[0]), onPointerLeave: () => highlightRange(block.id, null), onFocus: () => highlightRange(block.id, sentence.targets[0]), onBlur: () => highlightRange(block.id, null),
                    onClick: () => follow(sentence.targets), onKeyDown: event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); follow(sentence.targets); } } } : {})}>{sentence.text}</span>
                {/* A target with no card now (a deleted satellite, or a file the answer only mentioned): its file:line, opening Files (spec 2d). */}
                {opens.map(target => <button key={target.id} type="button" data-anchor-link={target.id} title="Open these lines in Files" className="mx-0.5 font-mono text-xs text-accent hover:underline" onClick={() => files(target)}>{target.path}:{target.start}{target.end > target.start ? `-${target.end}` : ''}</button>)}
                {' '}
              </span>;
            })}
          </p>
          {trace && <div data-code-explain-trace className="mt-3 rounded-md bg-code p-2 font-mono text-xs text-ink">
            <p className="font-sans text-xs font-medium text-ink-2">Trace</p>
            <p className="mt-1">Input: {trace.input}</p>
            <ol className="mt-1 list-decimal pl-5">{trace.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
          </div>}
          {figure && <div data-code-explain-figure={figure.referenceId} className="mt-3 min-w-0"><TutorDiagram spec={figure.spec} fallback={null} /></div>}
        </section>
        <section data-code-explain-suggestions aria-label="Suggestions" className="flex flex-col gap-0.5 border-t border-line px-3 py-2">
          <h4 className="px-1.5 text-xs font-medium text-ink-3">Suggestions</h4>
          {(block.suggestions || []).map(question => (
            <button key={question} type="button" data-code-explain-suggestion disabled={readOnly || !chat?.ask} onClick={() => ask(question)}
              className="flex items-start gap-1.5 rounded-md px-1.5 py-1 text-left text-sm text-ink-2 hover:bg-hover hover:text-ink disabled:opacity-50">
              <CornerDownRight size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-3" />
              <span className="min-w-0">{question}</span>
            </button>
          ))}
        </section>
      </div>
    </div>
  );
}
