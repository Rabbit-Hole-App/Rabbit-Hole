import { MathText } from './MathText.jsx';
import { validateEquationResult } from './inline-equation-result.js';
import { equationTransaction } from './inline-equation-apply.js';
import { validateExtraction, withExtraction } from './inline-extraction.js';
import { editableImage } from './inline-image-plan.js';
import { notebookEditor } from './notebook-inline-client.js';
import { freezeNativeTools } from './inline-native-plan.js';
import { freezeInlineTools, validateInlinePlan } from './inline-tool-plan.js';
import PaidConfirm from './PaidConfirm.jsx';
import { CadPreview, cadCanMutate } from './CadCard.jsx';
import { cadRunning, cadStage } from './cad-client.js';
import { Md, Code } from './Md.jsx';
import { cardEditSelectionReason } from './inline-card-edit.js';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, Check, ChevronDown, CircleHelp, Loader2, RotateCcw, Square, X } from 'lucide-react';
import { composerKey } from './composer-keys.js';
import { buildContext, buildCreationContext, clippedOf, contextShape, regionSummary, staleness, unionBox } from './inline-ai-context.js';
import { inlineProvenance, cardId, cardTx, describeChange, editTx, explainConnects, explainTx, FACING, freeSpot, noteSize, placeNote, validateEdit, wordDiff } from './inline-ai-apply.js';
import { createInlineSession, routeColumn, stageTimings } from './inline-ai-session.js';
import { layoutDiagram, toCanvasObjects, validateDiagram } from './inline-diagram.js';
import { placeResult, regionStyle } from './inline-placement.js';
import { PROMPT_MAX, routeLabel, selectionSummary } from './inline-ai-route.js';
import { ctrlkCommands, filterCommands, pick, pickerQuery, showsPill, submission, switchMode, unsupportedText } from './inline-ai-command.js';
import { descFor } from './agent/slash.js';
import CommandPill from './CommandPill.jsx';
import { CommandMark } from './CommandTone.jsx';
import { FILE_EDIT_LOCKED, fileEditLocked } from './file-chat-ref.js';

// The inline AI editor (docs/features/inline-ai-editor.md): a compact popover by the frozen selection, with Edit and
// Explain pills, the prompt, a context indicator, the streamed preview and Accept / Reject. Everything it shows before
// Accept lives here and in its overlay - never in the board, its autosave or its undo history. The canvas hands it a
// small adapter (board(), apply(tx), boxes, view) and owns nothing of a request.

// The composer (owner brief 2026-10-13): about 420 px wide, a prompt that grows to 180 px, then scrolls.
const W = 420, GAP = 12, EDGE = 8, PROMPT_H = 180, RESERVE = 300;
// The character count shows only near the limit.
const NEAR = Math.round(PROMPT_MAX * 0.9);
const MODES = [['edit', 'Edit selection'], ['explain', 'Explain selection']];
const LABEL = { shape: 'Shape', line: 'Line', text: 'Text', sticky: 'Note', equation: 'Equation', section: 'Divider', card: 'Card', chat: 'Chat', connection: 'Connector' };
// Why each supporting object is in the context, as its line in the details says it.
const RELATION = { connected: 'connected', sibling: 'sibling', diagram: 'same diagram', inferred: 'drawn arrow', group: 'same group', heading: 'heading or section',
  label: 'label', flow: 'text before or after', discussion: 'discussion', mentions: 'shares its terms', annotation: 'earlier note' };
const short = (text, n = 48) => { const one = String(text || '').replace(/\s+/g, ' ').trim(); return one.length > n ? `${one.slice(0, n - 1)}…` : one; };
const busy = status => status === 'routing' || status === 'generating' || status === 'streaming';

// What the target indicator says: the selected words, one object by its words, or how many.
export function targetLabel(target, board) {
  if (target.creation) return 'New content at the insertion point';
  if (target.range) return `“${short(target.range.text, 40)}”`;
  if (target.ids.length > 1) return target.wholeGroup ? `Group · ${target.ids.length} objects` : `${target.ids.length} objects`;
  const id = target.ids[0];
  const entity = [...(board.shapes || []), ...(board.items || []), ...(board.blocks || []), ...(board.links || [])].find(entry => entry.id === id);
  const words = entity && short(entity.text ?? entity.label ?? entity.title ?? '', 32);
  return words ? `“${words}”` : 'Selection';
}
// The A3 split labels: what kind of selection, board and output a request was.
const selectionKind = (target, board) => {
  if (target.range) return 'range';
  if (target.ids.length > 1) return target.groupId ? 'group' : 'mixed';
  const id = target.ids[0];
  const item = (board.items || []).find(entry => entry.id === id);
  if (item) return item.mode === 'code' ? 'code' : 'text';
  const block = (board.blocks || []).find(entry => entry.id === id);
  if (block) return block.type === 'file' && block.kind === 'image' ? 'image' : block.type === 'snippet' ? 'code' : 'card';
  return (board.links || []).some(entry => entry.id === id) ? 'connection' : 'shape';
};

// initialMode: 'edit' | 'explain' from the opener (the selection action bar's Quick Edit); else Edit for selected words,
// Explain for objects.
// Structured cards use the shared Markdown renderer, not serialized storage JSON. Native text edits keep their diff.
export function CardEditPreview({ fields, proposedOnly = false }) {
  const content = (value, code) => code ? <Code lang="text" lines={value.split('\n')} /> : <Md text={value} />;
  return <div data-card-edit-preview className="space-y-3 text-left text-sm">
    {fields.map(field => <section key={field.key} data-card-edit-field={field.key}>
      <p className="mb-1 text-xs font-semibold text-ink-2">{field.label}</p>
      {!proposedOnly && field.before && (field.before !== field.after || field.previousLabel !== field.label) && <details className="mb-1 text-ink-2"><summary className="cursor-pointer text-xs">Previous {field.previousLabel || field.label}</summary>{content(field.before, field.code)}</details>}
      {field.after ? <div data-card-edit-after>{content(field.after, field.code)}</div> : <p className="text-xs text-ink-2">Removed</p>}
    </section>)}
  </div>;
}
export default function InlineAiEditor({ target, canvas, config, view, readOnly = false, opened = null, cold = false, initialMode = null, onClose }) {
  // A creation (nothing selected) is always Explain: Edit changes a selection, and there is none (creation §1).
  // A file card with no semantic editing path (file-chat-ref.js fileEditLocked) is Explain only: Edit is never offered for it.
  const cadTarget = !target.creation && target.ids?.length === 1 && canvas.board?.().blocks?.find(block => block.id === target.ids[0] && block.type === 'cad' && block.revisionId && !block.locked && cadCanMutate(block,readOnly));
  const [cadPending,setCadPending] = useState(false), [cadError,setCadError] = useState(''), [cadJob,setCadJob] = useState(null);
  const [cadConfirmation,setCadConfirmation] = useState(null);
  const cadSubmitting=useRef(false);
  const cadLive=useRef(true);
  useEffect(()=>()=>{cadLive.current=false;},[]);
  useEffect(()=>{
    if(!cadJob?.id || !cadRunning(cadJob.state))return;
    let live=true,timer;
    const read=async()=>{try{const result=await config.cadRead(cadJob.id);if(!live)return;setCadJob(result.job);if(cadRunning(result.job.state))timer=setTimeout(read,2500);}catch(problem){if(live)setCadError(problem.message);}};
    timer=setTimeout(read,1500);return()=>{live=false;clearTimeout(timer);};
  },[cadJob?.id,cadJob?.state]);
  const cadAccept=async(action)=>{setCadPending(true);setCadError('');try{await config.cadAction(cadJob.id,action,action==='accept'?{expectedRevisionId:cadJob.baseRevisionId}:{});if(cadLive.current)onClose();}catch(problem){if(cadLive.current)setCadError(problem.message);}finally{if(cadLive.current)setCadPending(false);}};
  const notebookTarget=target.notebook&&target.ids?.length===1&&target.notebook.id===target.ids[0];
  const imageTarget = !!config.prepareImage && !readOnly && !target.creation && target.ids?.length===1 && !canvas.locked?.(target.ids[0]) && canvas.board?.().blocks?.find(block=>block.id===target.ids[0]&&editableImage(block));
  const cardEditReason = !imageTarget && !notebookTarget && !cadTarget && !target.creation && cardEditSelectionReason(target.ids || [], canvas.board?.() || {});
  const fileLocked = !imageTarget && !cadTarget && !target.creation && fileEditLocked(target.ids || [], canvas.board?.());
  const [mode, setMode] = useState(target.creation || fileLocked || cardEditReason ? 'explain' : ['edit', 'explain'].includes(initialMode) ? initialMode : target.range ? 'edit' : 'explain');
  const [prompt, setPrompt] = useState('');
  // A / command (Release B, contract B4): the one picked or typed, as its registry name; prompt is then its words. /explain
  // is the Explain mode itself and has no pill; it is still sent. The picker opens while the line is a leading /word.
  const [command, setCommand] = useState(null);
  const [pickerShut, setPickerShut] = useState(false);
  const [active, setActive] = useState(0);
  const [refused, setRefused] = useState(null);
  const [selectionOnly, setSelectionOnly] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [built, setPrepared] = useState(null);
  // The popover shows only a context built for the scope on screen. A Selection only change re-renders at once, and the
  // context for the new scope comes a task later, so until then it reads Preparing context, never the old scope's Supporting
  // entries beside the selection-only note (fast-e2e 38625249408 on Linux).
  const prepared = built?.only === selectionOnly ? built : null;
  const [state, setState] = useState({ status: 'idle' });
  const [equationLatex,setEquationLatex]=useState('');
  const [imageRevision,setImageRevision]=useState(null), [imageError,setImageError]=useState('');
  const imageAccess=useRef(null);imageAccess.current={readOnly,imageTarget,config};
  useEffect(()=>{
    const preview=state.preview,descriptor=preview?.imageTransform;
    setImageRevision(null);setImageError('');
    if(!descriptor)return;
    let live=true,revision;const controller=new AbortController();
    if(!config.prepareImage){setImageError('Image editing is unavailable in this canvas.');return;}
    const original=preview.frozen.toolSnapshot.objects[descriptor.id];
    const current=()=>({block:board().blocks.find(block=>block.id===descriptor.id),scope:imageAccess.current.config.imageScope?.(),readOnly:imageAccess.current.readOnly,locked:!imageAccess.current.imageTarget||canvas.locked?.(descriptor.id)});
    config.prepareImage({block:original,scope:config.imageScope?.(),operation:descriptor.operation,signal:controller.signal,current}).then(value=>{revision=value;if(live)setImageRevision({requestId:preview.requestId,value});else value.dispose();},error=>{if(live)setImageError(error.message||'The image could not be prepared.');});
    return()=>{live=false;controller.abort();revision?.dispose();};
  },[state.preview?.requestId]);
  useEffect(()=>{if(state.preview?.kind==='equation')setEquationLatex(state.preview.latex);},[state.preview?.requestId,state.preview?.latex]);
  // A7: each candidate's placement, by request id - computed once, before its ghost shows, and the one Accept applies.
  const [placements, setPlacements] = useState({});
  const [moved, setMoved] = useState(null); // the request whose spot was taken: its new place is shown, Accept again
  const box = useRef(null), field = useRef(null);
  const openMs = useRef(null);
  const rows = useRef([]);
  const board = canvas.board;
  // One session per opened editor: its requests, their late results and their metrics end with it.
  const session = useMemo(() => createInlineSession({
    transport: config.transport, boardKey: canvas.boardKey, enabled: config.enabled, motion: config.motion,
    flushMs: config.flushMs ?? 50,
    validate: (result, plan, request) => validateResult(result, request.frozen),
    onChange: setState,
    onMetrics: entry => {
      const split = { selection: selectionKind(target, board()), board: canvas.objectCount() > 200 ? 'large' : 'small', output: entry.capability === 'edit' ? 'edit' : entry.capability === 'note' ? 'text' : entry.capability === 'shapes' ? 'diagram' : ['motion', 'animate', 'video', '3d'].includes(entry.capability) ? 'media' : 'card' };
      const first = !rows.current.length || rows.current[0].request_id === entry.requestId;
      rows.current = rows.current.filter(row => row.request_id !== entry.requestId);
      rows.current.push({
        request_id: entry.requestId, route: routeColumn(entry),
        capability: entry.capability || null, outcome: entry.outcome || 'closed', streaming: !!entry.streaming, mocked: !!config.mocked,
        metrics: { stages: { ...(first && openMs.current != null ? { open: openMs.current } : {}), ...(entry.prep ? { prep: entry.prep.ms } : {}), ...Object.fromEntries(Object.entries(stageTimings(entry)).filter(([, value]) => value != null)) },
          counts: { ...entry.counts, ...(entry.context ? { objects: entry.context.objects, chars: entry.context.chars, omitted: entry.context.omitted } : {}), ...(entry.tokens ? { inputTokens: entry.tokens.input, outputTokens: entry.tokens.output } : {}) },
          prepCache: entry.prep?.cacheHit ? 'hit' : 'miss', open: cold ? 'cold' : 'repeat', ...split },
      });
      canvas.telemetry?.(rows.current);
    },
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  // A result checked against the board as it is now (inline-ai-apply.js): the preview it becomes, or why not.
  function validateResult(result, frozen) {
    let extraction;
    if(result.extraction){
      if(!['equation','diagram'].includes(result.kind)||!frozen.extractionScope||frozen.equationItem)return{ok:false,errors:['Image interpretation is not available for this result or canvas yet.']};
      const checked=validateExtraction(result.extraction,{block:frozen.extractionImage,ids:frozen.ids});
      if(!checked.ok)return{ok:false,errors:[checked.error]};
      extraction=checked.extraction;
    }
    if(result.kind==='equation'){const {kind,extraction:receipt,...input}=result,checked=validateEquationResult(input);return checked.ok&&checked.result.kind==='equation'?{ok:true,preview:{...checked.result,...(extraction?{extraction}:{})}}:{ok:false,errors:[checked.error||'Invalid equation.']};}
    if (result.kind === 'note') return { ok: true, preview: { text: result.text } };
    if(result.kind==='annotations'){
      const checked=validateInlinePlan(result.plan,frozen.toolSnapshot,board(),canvas.layout(),{mode:'explain',requestId:frozen.requestId,readOnly});
      return checked.ok?{ok:true,preview:{summary:result.summary,changes:checked.changes.map(describeChange),additions:checked.additions,removals:checked.removals,limitations:checked.limitations,raw:result}}:checked;
    }
    if (result.kind === 'edit') {
      const checked = validateEdit(result, frozen, {...board(),boxes:canvas.layout()});
      return checked.ok ? { ok: true, preview: { summary: result.summary, changes: checked.changes.map(describeChange), additions:checked.additions||[],removals:checked.removals||[],limitations:checked.limitations||[],imageTransform:checked.imageTransform, raw: result } } : checked;
    }
    // A native diagram: checked again here (a schema is a request, not a guarantee); laid out and placed once, below.
    if (result.kind === 'diagram') { const checked = validateDiagram(result.spec); return checked.ok ? { ok: true, preview: { spec: checked.spec, ...(extraction?{extraction}:{}) } } : { ok: false, errors: checked.errors.slice(0, 1) }; }
    if (result.kind === 'card' || result.kind === 'proposal') return { ok: true, preview: { block: result.block, primitive: result.primitive, message: result.message, describe: canvas.describe(result.block) } };
    return { ok: false, errors: ['That result is not something the canvas can show.'] };
  }

  // A1: context prepared while the learner writes - local work only, scheduled off the input path; refreshed at submit.
  // request: the learner's words, at submit - what the context is chosen for, with the selection (owner 2026-10-13).
  const prepare = (only = selectionOnly, request = '', intent = mode, notebookScope=target.notebook) => {
    const started = performance.now(), misses = canvas.cache.stats.misses;
    const live = { ...board(), boxes: canvas.layout() };
    // A creation reads the region around its anchor; its look (style) travels apart from its subject (creation §4).
    const context = target.creation
      ? buildCreationContext(live, target.anchor, { cache: canvas.cache, boardKey: canvas.boardKey, describeCard: canvas.describe, request, extras: config.extras?.() || {}, style: regionStyle(live, target.anchor) })
      : buildContext(live, target, { cache: canvas.cache, boardKey: canvas.boardKey, describeCard: canvas.describe, selectionOnly: only, request, extras: config.extras?.() || {} });
    if(!target.creation&&!target.range){const native=freezeNativeTools(live,target.ids,live.boxes);if(native)context.nativeTools=native;}
    if(!target.creation&&!target.range){const tools=freezeInlineTools(live,target.ids,live.boxes,{mode:intent,notebook:notebookScope?Object.fromEntries(['id','notebookId','path','revision','cellIds'].map(key=>[key,notebookScope[key]])):null});if(tools)context.toolSnapshot=tools;}
    return { context, ms: Math.round((performance.now() - started) * 10) / 10, cacheHit: canvas.cache.stats.misses === misses, only };
  };
  // config.prepareOnOpen false is the A3 baseline (context built only at Send), for the benchmark's comparison.
  useEffect(() => {
    if (config.prepareOnOpen === false) { canvas.cache.reset(); return undefined; }
    const timer = setTimeout(() => { const made = prepare(); setPrepared(made); }, 0);
    return () => clearTimeout(timer);
  }, [selectionOnly]); // eslint-disable-line react-hooks/exhaustive-deps
  // The prompt grows with its words up to PROMPT_H, then scrolls inside.
  useLayoutEffect(() => {
    const node = field.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${Math.min(node.scrollHeight, PROMPT_H)}px`;
  }, [prompt]);
  useLayoutEffect(() => {
    field.current?.focus({ preventScroll: true });
    if (opened != null) openMs.current = Math.round((performance.now() - opened) * 10) / 10;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => session.dispose('closed'), [session]);
  // A window or visual-viewport resize (a phone's keyboard opening) re-places the popover inside what is left.
  const [, setViewport] = useState(0);
  useEffect(() => {
    const moved = () => setViewport(n => n + 1);
    window.addEventListener('resize', moved);
    window.visualViewport?.addEventListener('resize', moved);
    return () => { window.removeEventListener('resize', moved); window.visualViewport?.removeEventListener('resize', moved); };
  }, []);
  // The popover's wheel and pointer stay its own: the canvas below never pans, zooms or selects through it.
  useEffect(() => {
    const node = box.current;
    if (!node) return undefined;
    const stop = event => event.stopPropagation();
    node.addEventListener('wheel', stop);
    return () => node.removeEventListener('wheel', stop);
  }, []);

  const submit = (text, how = mode) => {
    if (readOnly || busy(state.status)) return;
    session.submit({
      mode: how, prompt: text,
      prepare: () => {
        const build=scope=>{
        // An open text editor's words are saved first, so what the model reads and the fingerprint Accept checks come
        // from the same saved text - never from words captured when the editor opened.
        canvas.flushEdits?.();
        const made = prepare(selectionOnly, text, how,scope);
        setPrepared(made);
        // The request the check decides and generation gets: the selection's ids or its exact words, and the context.
        const request = target.creation ? { kind: 'creation', anchor: { x: target.anchor.x, y: target.anchor.y }, region: regionSummary(made.context), context: made.context }
          : target.range ? { kind: 'selection', textRange: { id: target.range.id, from: target.range.from, to: target.range.to }, context: made.context }
          : { kind: 'selection', targetIds: target.ids, context: made.context };
        return { error: how === 'edit' ? (notebookTarget?(!made.context.toolSnapshot?'The selected notebook exceeds the complete-cell context budget.':null):imageTarget?(!made.context.toolSnapshot?'Image tools are unavailable for this selection.':null):cardEditSelectionReason(target.ids || [], board())) || (clippedOf(made.context).length && !target.range ? 'The selection exceeds the complete-content edit budget. Select less content before editing.' : null) : null, request, context: made.context, frozen: { ...target, ...(how==='edit'&&target.ids?.length===1&&board().items?.find(item=>item.id===target.ids[0]&&item.kind==='equation')?{equationItem:structuredClone(board().items.find(item=>item.id===target.ids[0]))}:{}), extractionImage:how==='explain'&&made.context.image?.id?structuredClone(board().blocks.find(block=>block.id===made.context.image.id)):null, extractionScope:how==='explain'?structuredClone(config.imageScope?.()||null):null, nativeTools:made.context.nativeTools, toolSnapshot:made.context.toolSnapshot, prints: made.context.prints, clipped: clippedOf(made.context), words: text }, summary: selectionSummary(made.context), prints: made.context.prints, selectionOnly, shape: contextShape(made.context), prepMs: prepared?.ms ?? made.ms, cacheHit: made.cacheHit };
      };
        if(notebookTarget)return notebookEditor(target.ids[0]).capture().then(scope=>{if(JSON.stringify(scope.cellIds)!==JSON.stringify(target.notebook.cellIds))throw new Error('The selected cells changed. Close this preview and select the cells again.');canvas.syncNotebook(scope);return build(scope);});
        return build(null);
      },
    });
  };
  // The / commands (inline-ai-command.js): the registry's Ctrl+K list for this canvas, filtered as the line is typed.
  const offered = useMemo(() => ctrlkCommands({ enabled: config.enabled ?? null, sources: !!config.openSearch, motionDev: true }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const query = command || readOnly ? null : pickerQuery(prompt);
  const pickerOpen = query !== null && !pickerShut;
  const matches = pickerOpen ? filterCommands(offered, query) : [];
  const focusField = () => field.current?.focus({ preventScroll: true });
  const typing = value => { setCadConfirmation(null); setPrompt(value); setActive(0); setRefused(null); if (pickerQuery(value) === null) setPickerShut(false); };
  // Picked: the command and its mode (a generation command selects Explain); the line is then its words.
  const choose = entry => { const next = pick({ mode, text: '' }, entry); setMode(next.mode); setCommand(next.command); setPrompt(next.text); setRefused(null); focusField(); };
  const changeMode = value => { const next = switchMode({ command, text: prompt }, value); setMode(next.mode); setCommand(next.command); };
  // A source search opens the shared finder with its query: no model, nothing sent. config.openSearch has the shape of B3's
  // openSourceFinder({ source, query, origin }) -> Promise<{ added }> (the page binds the one opener Chat uses), settling
  // when the finder closes: the draft, the selection and the context stay until then; an add clears the line; either way
  // focus comes back here.
  const openFinder = ({ source, query: words }) => Promise.resolve(config.openSearch({ source, query: words, origin: { returnFocus: focusField } })).then(out => {
    if (out?.added) { setCommand(null); setPrompt(''); }
    focusField();
  });
  // One Send: a typed command resolves through the registry exactly as a picked one, so both submit the same request.
  const send = async () => {
    if(readOnly || cadPending || cadJob)return;
    if (mode === 'edit' && fileLocked) { setRefused(FILE_EDIT_LOCKED); return; }
    const out = submission({ mode, command, text: prompt });
    // A source search where no finder can open (an embed without one) is said like any command Ctrl+K lacks here.
    if (out.unsupported || (out.source && !config.openSearch)) { setRefused(out.unsupported || out.source.source); return; }
    if (out.source) { openFinder(out.source); return; }
    if (out.mode !== mode) setMode(out.mode);
    if(out.command==='cad' || (out.mode==='edit' && cadTarget)) {
      if(!out.text.trim()){setCadError('What would you like to create or change?');return;}
      setCadError('');
      if(!config.cad){setCadError('CAD generation is not available on this canvas.');return;}
      const made=prepare(selectionOnly,out.text);
      setCadConfirmation({text:out.text, editing:!!(out.mode==='edit' && cadTarget), options:{context:made.context,...(out.mode==='edit' && cadTarget ? {cardId:cadTarget.id,baseRevisionId:cadTarget.revisionId} : {})}});
      return;
    }
    submit(out.prompt, out.mode);
  };
  const generateCad = async () => {
    if(!cadConfirmation || cadSubmitting.current || readOnly)return;
    const request=cadConfirmation;cadSubmitting.current=true;setCadConfirmation(null);setCadPending(true);setCadError('');
    try {
      const result=await config.cad(request.text,request.options);
      if(cadLive.current){if(request.editing)setCadJob(result.job);else onClose();}
    } catch(problem){if(cadLive.current)setCadError(problem.message);}
    finally{cadSubmitting.current=false;if(cadLive.current)setCadPending(false);}
  };
  // What Send would send, for the limit and the Send button.
  const outgoing = command ? `/${command}${prompt.trim() ? ` ${prompt.trim()}` : ''}` : prompt;
  // A connector has no box of its own: it stands at the midpoint between the two objects it joins.
  const boxOfTarget = id => {
    const own = canvas.boxOf(id);
    if (own) return own;
    const link = (board().links || []).find(entry => entry.id === id);
    const a = link && canvas.boxOf(link.from), b = link && canvas.boxOf(link.to);
    return a && b ? { x: (a.x + a.w / 2 + b.x + b.w / 2) / 2 - 1, y: (a.y + a.h / 2 + b.y + b.h / 2) / 2 - 1, w: 2, h: 2 } : null;
  };
  // A note's room while it streams: the prompt's longest note (400 characters), so streamed words never move it (A7).
  const reserved = () => noteSize('word '.repeat(80), canvas.measureNote);
  // One placement: the one placer (placeNote) over every kind of object on the board, beside the target; the camera
  // pans to it when the only free spot is off-screen.
  // A creation's composer stands at its anchor, where the result wants to go: there the composer, with all the room it may
  // grow into, is in the way too, so the result never lands under it where its ghost could not be seen. A selection's
  // composer is placed clear of the selection already, and the result goes beside the selection.
  const obstaclesNow = ids => [...canvas.obstacles(ids), ...(target.creation ? [{ x: (place.left - view.x) / view.z, y: (place.top - view.y) / view.z, w: place.width / view.z, h: height / view.z }] : [])];
  const placeFor = size => {
    // A creation: the whole result near the anchor (inline-placement.js placeResult), never beside a selection it lacks.
    if (target.creation) {
      const spot = placeResult({ x: 0, y: 0, ...size }, target.anchor, obstaclesNow([]), canvas.visibleWorld());
      if (spot.offscreen) canvas.reveal?.({ x: spot.x, y: spot.y, ...size });
      return { x: spot.x, y: spot.y, side: spot.side, offscreen: spot.offscreen, size, target: { x: target.anchor.x - 1, y: target.anchor.y - 1, w: 2, h: 2 } };
    }
    const targetBox = unionBox(target.ids.map(boxOfTarget));
    if (!targetBox) return null;
    const spot = placeNote(targetBox, size, obstaclesNow(target.ids), canvas.visibleWorld());
    if (spot.offscreen) canvas.reveal?.({ x: spot.x, y: spot.y, ...size });
    return { ...spot, size, target: targetBox };
  };
  const keep = (id, placement) => setPlacements(previous => ({ ...previous, [id]: placement }));
  // Where a result goes: the selection's middle, or a creation's insertion anchor.
  const anchorPoint = () => { const box = unionBox(target.ids.map(boxOfTarget)); return target.anchor || (box && { x: box.x + box.w / 2, y: box.y + box.h / 2 }); };
  const placeDiagram = spec => {
    const at = anchorPoint();
    if (!at) return null;
    const style = regionStyle(board(), at), layout = layoutDiagram(spec, style);
    const spot = placeResult(layout.bounds, at, obstaclesNow(target.ids), canvas.visibleWorld());
    if (spot.offscreen) canvas.reveal?.({ x: spot.x, y: spot.y, w: layout.bounds.w, h: layout.bounds.h });
    return { kind: 'diagram', style, layout, x: spot.x, y: spot.y, dx: spot.dx, dy: spot.dy, offscreen: spot.offscreen, size: { w: layout.bounds.w, h: layout.bounds.h }, final: true };
  };
  useEffect(() => {
    // Streaming: the room is reserved once, before the first words show.
    if (state.status === 'streaming' && state.stream?.text && state.requestId && !placements[state.requestId]) { const room = placeFor(reserved()); if (room) keep(state.requestId, room); }
    // The finished note: it keeps its streamed place when it fits the room; a note placed for the first time (no stream)
    // or one longer than the room is placed once, now, before Accept is offered.
    const preview = state.preview;
    if (preview?.kind === 'note' && !placements[preview.requestId]?.final) {
      const final = noteSize(preview.text, canvas.measureNote), had = placements[preview.requestId];
      const fresh = had && final.h <= had.size.h && final.w <= had.size.w ? { ...had, size: final } : placeFor(final);
      // No target box (the selection is gone): no ghost; Accept then refuses it as stale.
      keep(preview.requestId, fresh ? { ...fresh, final: true } : { final: true });
    }
    // A diagram: the region's style, a deterministic layout, then one free spot near the anchor for the whole result
    // (inline-placement.js); nothing on the board moves. Off-screen, the camera goes to where it will land.
    if (preview?.kind === 'diagram' && !placements[preview.requestId]) { const spot = placeDiagram(preview.spec); keep(preview.requestId, spot || { final: true }); }
  }, [state.status, state.preview, state.requestId, !!state.stream?.text]); // eslint-disable-line react-hooks/exhaustive-deps

  // A7 card ghost: drawn once invisibly at the end of the column to learn its real size (waiting until its size holds
  // for two frames, up to a second), then placed once beside the selection and shown pale there.
  const isCard = preview => preview && (preview.kind === 'card' || preview.kind === 'proposal');
  const ghostBlock = preview => ({ ...preview.block, id: cardId(preview.requestId) });
  useEffect(() => {
    const preview = state.preview;
    if (!isCard(preview) || !['preview', 'proposal'].includes(state.status) || !canvas.cardGhost) { canvas.cardGhost?.clear(); return undefined; }
    const known = placements[preview.requestId];
    if (known?.size) { canvas.cardGhost.show(ghostBlock(preview), { dx: known.dx, dy: known.dy }); return undefined; }
    let alive = true, last = null, frames = 0;
    canvas.cardGhost.show(ghostBlock(preview), { hidden: true });
    const settle = () => {
      if (!alive) return;
      const box = canvas.cardGhost.measure();
      frames += 1;
      const steady = box && last && Math.abs(box.w - last.w) < 0.5 && Math.abs(box.h - last.h) < 0.5;
      if (!steady && frames < 60) { last = box; requestAnimationFrame(settle); return; }
      if (!box) { canvas.cardGhost.clear(); return; }
      const size = { w: box.w, h: box.h }, spot = placeFor(size);
      if (!spot) { canvas.cardGhost.clear(); return; }
      const placed = { ...spot, final: true, dx: spot.x - box.x, dy: spot.y - box.y };
      keep(preview.requestId, placed);
      canvas.cardGhost.show(ghostBlock(preview), { dx: placed.dx, dy: placed.dy });
    };
    requestAnimationFrame(settle);
    return () => { alive = false; };
  }, [state.status, state.preview]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => canvas.cardGhost?.clear(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const accept = async () => {
    // A7: the spot the ghost shows must still be free. If something now takes it, the note is placed again and its new
    // ghost shown; Accept is pressed again. It never lands somewhere the learner did not see.
    const shown = (state.preview?.kind === 'note' || state.preview?.kind === 'diagram' || isCard(state.preview)) && placements[state.preview.requestId];
    if (shown?.size && !freeSpot({ x: shown.x, y: shown.y, ...shown.size }, canvas.obstacles(target.ids), unionBox(target.ids.map(boxOfTarget)))) {
      const again = state.preview.kind === 'diagram' ? placeDiagram(state.preview.spec) : placeFor(shown.size);
      if (again) {
        // A card's offset is from its slot at the end of the column: the slot is where its ghost is drawn less its offset.
        const drawn = isCard(state.preview) && canvas.cardGhost.measure();
        const slot = drawn ? { x: drawn.x - shown.dx, y: drawn.y - shown.dy } : null;
        keep(state.preview.requestId, { ...again, final: true, ...(slot ? { dx: again.x - slot.x, dy: again.y - slot.y } : {}) });
        setMoved(state.preview.requestId);
        return;
      }
    }
    setMoved(null);
    const out = await session.accept(async preview => {
      const notebook=preview.frozen.toolSnapshot?.notebook;
      if(notebook){const current=await notebookEditor(notebook.id).capture();if(!cadLive.current)return{stale:{gone:true,text:'This editor closed.'}};canvas.syncNotebook(current);if(current.revision!==notebook.revision||JSON.stringify(current.cellIds)!==JSON.stringify(notebook.cellIds))return{stale:{content:true,text:'The notebook or selected cells changed.'}};}
      let appliedNotebook=null;
      canvas.flushEdits?.();
      const now = board();
      const frozen = preview.frozen;
      // A creation has no selection to go stale; what it read around its anchor is checked below instead.
      const check = target.creation ? { gone: [], content: false, relations: false } : staleness(frozen, now, canvas.cache, canvas.boardKey, canvas.describe);
      if (check.gone.length) return { stale: { gone: check.gone, text: 'The selection was deleted while this was being made.' } };
      if (check.content) return { stale: { content: true, text: 'The selection changed while this was being made.' } };
      if (check.relations && preview.kind !== 'edit') return { stale: { relations: true, text: 'Its connections changed since this was written.' } };
      // A creation read what was around its anchor: when that changed (words, links, the region's material), the result
      // may be outdated - say so and offer to regenerate; a pan or a zoom never does (creation §9).
      if (target.creation) {
        const live = { ...now, boxes: canvas.layout() };
        const fresh = buildCreationContext(live, target.anchor, { cache: canvas.cache, boardKey: canvas.boardKey, describeCard: canvas.describe, request: frozen.words || '', extras: config.extras?.() || {} });
        if (fresh.prints.context !== frozen.prints?.context) return { stale: { content: true, text: 'What is around it changed while this was being made.' } };
      }
      let tx;
      if (preview.kind === 'note') {
        const spot = placements[preview.requestId];
        if (!spot?.size) return { error: 'There is no place on the canvas beside the selection for this note.' };
        tx = explainTx({ requestId: preview.requestId, text: preview.text, frozen, board: now, boxes: { target: spot.target }, size: spot.size, place: spot, route: preview.route });
      } else if(preview.kind==='equation'){
        const candidate={kind:'equation',latex:equationLatex,...(preview.label?{label:preview.label}:{}),...(preview.assumptions?{assumptions:preview.assumptions}:{})};
        const point=target.creation?target.anchor:placeFor({w:420,h:90});
        const made=equationTransaction(candidate,{item:frozen.equationItem?now.items.find(item=>item.id===frozen.equationItem.id):null,frozen:frozen.equationItem,point,requestId:preview.requestId,readOnly,taken:now.items.map(item=>item.id)});
        if(!made.ok)return{error:made.error};tx=made.tx;
      } else if (preview.kind === 'diagram') {
        const spot = placements[preview.requestId];
        if (!spot?.layout) return { error: 'There is no place on the canvas for this diagram.' };
        const taken = new Set(['shapes', 'items', 'links', 'blocks', 'groups'].flatMap(list => (now[list] || []).map(entry => entry.id)));
        tx = toCanvasObjects(preview.spec, spot.layout, { requestId: preview.requestId, at: { x: spot.x, y: spot.y }, style: spot.style, taken });
      } else if (preview.kind === 'edit'||preview.kind==='annotations') {
        const again = preview.kind==='annotations'?validateInlinePlan(preview.raw.plan,frozen.toolSnapshot,now,canvas.layout(),{mode:'explain',requestId:preview.requestId,readOnly}):validateEdit(preview.raw, frozen, {...now,boxes:canvas.layout()});
        if (!again.ok) return { stale: { content: true, text: again.errors[0] || 'The edit no longer fits the selection.' } };
        tx = {...editTx({ requestId: preview.requestId, changes: again.changes,additions:again.additions,removals:again.removals }),kind:preview.kind};
        if(again.imageTransform){
          if(imageRevision?.requestId!==preview.requestId)return{error:imageError||'Wait for the image preview.'};
          const revision=await imageRevision.value.accept();
          if(!cadLive.current||!validateEdit(preview.raw,frozen,{...board(),boxes:canvas.layout()}).ok)return{stale:{content:true,text:'The image changed while accepting.'}};
          tx={...editTx({requestId:preview.requestId,changes:[{id:again.imageTransform.id,list:'blocks',field:'imageRevision',before:revision.before,after:revision.after}]}),retainedSources:revision.retainedSource?[revision.retainedSource]:[]};
        }
        if(notebook){const step=preview.raw.plan.steps[0];appliedNotebook=await notebookEditor(notebook.id).apply({path:notebook.path,expectedRevision:notebook.revision,cellIds:notebook.cellIds,edits:step.input.edits,splits:step.input.splits,requestId:preview.requestId});}
      } else {
        const block = preview.kind === 'proposal' ? { ...preview.block, confirmedStart: true } : preview.block;
        // The ghost's spot, from the slot the card will take at the end of the column (where its ghost is drawn now).
        const spot = placements[preview.requestId], drawn = spot?.size && canvas.cardGhost?.measure();
        const place = drawn ? { side: spot.side, dx: spot.x - (drawn.x - spot.dx), dy: spot.y - (drawn.y - spot.dy) } : null;
        tx = cardTx({ requestId: preview.requestId, block, frozen, board: now, route: preview.route, place });
      }
      if(preview.extraction){
        if(!config.verifyExtraction)return{error:'Image interpretation is unavailable in this canvas.'};
        const image=frozen.extractionImage;
        const current=()=>({block:board().blocks.find(block=>block.id===image.id),scope:imageAccess.current.config.imageScope?.(),readOnly:imageAccess.current.readOnly,locked:canvas.locked?.(image.id)});
        const verified=await config.verifyExtraction({extraction:preview.extraction,before:image,ids:frozen.ids,scope:frozen.extractionScope,current});
        const fresh=staleness(frozen,board(),canvas.cache,canvas.boardKey,canvas.describe);
        if(!cadLive.current||fresh.gone.length||fresh.content||fresh.relations)return{stale:{content:true,text:'The selection changed while accepting the interpretation.'}};
        tx=withExtraction(tx,{...verified,provenance:inlineProvenance({requestId:preview.requestId,mode:'explain',route:preview.route,frozen})});
      }
      const stillCurrent=!notebook||validateEdit(preview.raw,frozen,{...board(),boxes:canvas.layout()}).ok;
      const applied=cadLive.current&&stillCurrent&&canvas.apply(tx, preview.requestId, id => session.persisted(id));
      if(!applied&&appliedNotebook)await notebookEditor(notebook.id).restore({path:notebook.path,expectedRevision:appliedNotebook.revision,ipynb:JSON.parse(notebook.revision)});
      return applied ? { ok: true } : { stale: { gone: true, text: 'This canvas closed.' } };
    });
    if (out?.ok) onClose(true);
  };
  const reject = () => { session.reject(); onClose(true); };
  const close = () => { session.dispose('closed'); onClose(true); };

  const keyDown = event => {
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation();
      // An open mode menu or Context popover closes first, focus back on its control; then the editor.
      if (modeOpen) { setModeOpen(false); box.current?.querySelector('[data-inline-mode-toggle]')?.focus(); return; }
      if (contextOpen) { setContextOpen(false); box.current?.querySelector('[data-inline-context]')?.focus(); return; }
      close();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && cadJob?.awaitingAccept && !cadPending && !readOnly) { event.preventDefault(); cadAccept('accept'); return; }
    // Ctrl/Cmd+Enter accepts a preview; a paid proposal starts only from its own Generate button.
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && state.status === 'preview' && state.preview?.kind !== 'proposal') { event.preventDefault(); accept(); }
  };
  const fieldKey = event => {
    // The open picker owns Up, Down, Enter, Tab and Esc; Esc closes the list, never the editor.
    if (pickerOpen && !event.nativeEvent.isComposing) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (matches.length) setActive(index => (index + (event.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length);
        return;
      }
      if ((event.key === 'Enter' || event.key === 'Tab') && !event.shiftKey && !event.ctrlKey && !event.metaKey && matches.length) { event.preventDefault(); choose(matches[Math.min(active, matches.length - 1)]); return; }
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setPickerShut(true); return; }
    }
    const what = composerKey(event.nativeEvent);
    if (what !== 'send' || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    // Always require text (owner 2026-10-14): an empty prompt never sends, with or without a selection, like the Send button.
    if (state.status === 'proposal' || !outgoing.trim()) return;
    send();
  };

  // Where the popover goes: beside the target, never over it, inside the canvas surface (§10).
  const surface = canvas.surfaceSize();
  const targetScreen = (() => {
    // A creation is placed by its insertion anchor, as a selection is by its box.
    const world = target.creation ? { x: target.anchor.x - 1, y: target.anchor.y - 1, w: 2, h: 2 } : unionBox(target.ids.map(boxOfTarget));
    if (!world) return null;
    return { x: world.x * view.z + view.x, y: world.y * view.z + view.y, w: world.w * view.z, h: world.h * view.z };
  })();
  // Placed for the room it may grow into (RESERVE), so a streamed preview never moves it: a spot above the target is held
  // by its bottom edge and grows up, any other by its top edge and grows down.
  const [height, setHeight] = useState(RESERVE);
  const [actual, setActual] = useState(110);
  useLayoutEffect(() => {
    const now = box.current?.offsetHeight || 0;
    if (Math.max(RESERVE, now) > height + 2) setHeight(Math.max(RESERVE, now));
    if (now && Math.abs(now - actual) > 2) setActual(now);
  });
  // Clamped to the surface, never over the target, the style panel or the bottom strip (minimap, zoom, composer, hooks):
  // the first spot clear of all of them, else the one that covers least (a phone-sized canvas).
  const place = (() => {
    const width = Math.min(W, surface.w - EDGE * 2);
    const clamp = (left, top) => ({ left: Math.max(EDGE, Math.min(left, surface.w - width - EDGE)), top: Math.max(EDGE, Math.min(top, surface.h - height - EDGE)) });
    if (!targetScreen) return { ...clamp(EDGE, EDGE), width };
    const t = targetScreen, chrome = canvas.chromeRects();
    const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    const tries = [[t.x, t.y + t.h + GAP], [t.x, t.y - GAP - height, true], [t.x + t.w + GAP, t.y], [t.x - GAP - width, t.y], [t.x + t.w - width, t.y + t.h + GAP], [t.x + t.w - width, t.y - GAP - height, true], [t.x + t.w + GAP, t.y + t.h - height], [t.x - GAP - width, t.y + t.h - height]].map(([left, top, up]) => ({ ...clamp(left, top), up: !!up }));
    const cost = spot => { const box = { x: spot.left, y: spot.top, w: width, h: height }; return overlap(box, t) * 4 + chrome.reduce((sum, rect) => sum + overlap(box, rect), 0); };
    return { ...tries.reduce((best, spot) => (cost(spot) < cost(best) ? spot : best)), width };
  })();

  // The mode menu and the Context popover open away from the target, where there is room for them.
  const shellTop = place.up ? place.top + height - actual : place.top;
  const roomBelow = surface.h - (shellTop + actual), roomAbove = shellTop;
  const popBelow = place.up ? roomAbove < 270 && roomBelow > roomAbove : roomBelow >= 270 || roomBelow > roomAbove;
  const preview = state.preview;
  const status = state.status;
  const streamText = state.stream?.text;
  const omittedTotal = prepared ? Object.values(prepared.context.omitted).reduce((sum, n) => sum + n, 0) : 0;
  // Point 8 (owner 2026-10-13), in the Context popover: the targets apart from the supporting material, what it was chosen
  // from and what the limits left out - never a reading of the whole canvas.
  const considered = prepared?.context.considered ?? 0;
  const writing = status === 'streaming' || (busy(status) && !preview);
  const equationChecked=preview?.kind==='equation'?validateEquationResult({latex:equationLatex}):null;
  const acceptable = (status === 'preview' || status === 'proposal') && preview && !state.accepted && (!equationChecked||equationChecked.ok) && (!preview.imageTransform || imageRevision?.requestId===preview.requestId);
  const z = view.z;
  return (
    <>
      {/* The overlay: the frozen target's outline and the ghost of what Accept adds (A7). Never in the board, the undo
          history, the thumbnail (data-thumbnail-hide) or an export; only the ghost itself takes the pointer, so nothing
          under it is clicked by mistake. */}
      <div data-inline-ai-overlay data-thumbnail-hide aria-hidden="true" className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
        {/* The target is purple while the editor is open (owner 2026-10-13): its own canvas selection marks take --color-ai;
            every other selection stays blue. */}
        <style data-inline-target-color>{`${[...target.ids.flatMap(id => ['shape-id', 'item-id', 'block-id', 'link-for'].map(key => `[data-${key}="${CSS.escape(id)}"]`)),
          ...(target.groupId && target.wholeGroup ? [`[data-group-box="${CSS.escape(target.groupId)}"]`] : [])].join(',')}{--color-select:var(--color-ai)}`}</style>
        {/* A creation's insertion anchor: a subtle mark where the result will go near (creation §3); never saved. */}
        {target.creation && <div data-inline-anchor className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ai bg-white/80 dark:bg-[#202020]/80"
          style={{ left: target.anchor.x * z + view.x, top: target.anchor.y * z + view.y }} />}
        {target.ids.map(id => canvas.boxOf(id)).filter(Boolean).map((world, index) => (
          <div key={index} data-inline-target className="absolute rounded-md outline-2 outline-offset-4 outline-dashed outline-ai"
            style={{ left: world.x * z + view.x, top: world.y * z + view.y, width: world.w * z, height: world.h * z }} />
        ))}
        {(() => {
          // A7: the note Accept would add, pale, at exactly its placement and size, above everything; its connector along
          // the path Accept will draw. While it streams, the words fill the room reserved for them.
          const id = status === 'streaming' ? state.requestId : preview?.kind === 'note' ? preview.requestId : null;
          const g = id && placements[id];
          const text = status === 'streaming' ? streamText : preview?.kind === 'note' ? preview.text : null;
          if (!g?.size || !text) return null;
          const left = g.x * z + view.x, top = g.y * z + view.y, w = g.size.w * z, h = g.size.h * z;
          const port = (box, side) => ({ x: side === 'left' ? box.x : side === 'right' ? box.x + box.w : box.x + box.w / 2, y: side === 'top' ? box.y : side === 'bottom' ? box.y + box.h : box.y + box.h / 2 });
          const [fromSide, toSide] = FACING[g.side] || FACING.right;
          const from = port({ x: left, y: top, w, h }, fromSide);
          const t = g.target, to = port({ x: t.x * z + view.x, y: t.y * z + view.y, w: t.w * z, h: t.h * z }, toSide);
          return (
            <>
              {explainConnects(target.ids, board()) && <svg data-inline-ghost-link className="absolute inset-0 h-full w-full overflow-visible opacity-50"><line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#6b7280" strokeWidth={2 * z} strokeDasharray="6 5" /></svg>}
              <div data-inline-ghost data-ghost-kind="note" onPointerDown={event => event.stopPropagation()}
                className="pointer-events-auto absolute overflow-hidden rounded-[14px] border-2 border-dashed border-[#6b7280] bg-white/90 px-2 py-1.5 text-ink opacity-50 dark:bg-[#202020]/90"
                style={{ left, top, width: w, height: h, fontSize: 14 * z, lineHeight: 1.25 }}>
                {text}{status === 'streaming' && <span className="ml-0.5 inline-block h-[1em] w-[2px] animate-pulse bg-ink-3 align-middle" />}
              </div>
            </>
          );
        })()}
        {(() => {
          // A7: the card ghost (drawn by the canvas at the end of its column, offset here) is framed and covered at its spot,
          // which is free, so the pointer there reaches only the ghost; its connector along the path Accept will draw.
          const g = isCard(preview) && placements[preview.requestId];
          if (!g?.size || !['preview', 'proposal'].includes(status)) return null;
          const left = g.x * z + view.x, top = g.y * z + view.y, w = g.size.w * z, h = g.size.h * z;
          const port = (box, side) => ({ x: side === 'left' ? box.x : side === 'right' ? box.x + box.w : box.x + box.w / 2, y: side === 'top' ? box.y : side === 'bottom' ? box.y + box.h : box.y + box.h / 2 });
          const [fromSide, toSide] = FACING[g.side] || FACING.right;
          const from = port({ x: left, y: top, w, h }, fromSide), t = g.target, to = port({ x: t.x * z + view.x, y: t.y * z + view.y, w: t.w * z, h: t.h * z }, toSide);
          return (
            <>
              {explainConnects(target.ids, board()) && <svg data-inline-ghost-link className="absolute inset-0 h-full w-full overflow-visible opacity-50"><line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#6b7280" strokeWidth={2 * z} strokeDasharray="6 5" /></svg>}
              <div data-inline-ghost data-ghost-kind="card" onPointerDown={event => event.stopPropagation()} className="pointer-events-auto absolute rounded-xl border-2 border-dashed border-[#6b7280]/70"
                style={{ left, top, width: w, height: h }} />
            </>
          );
        })()}
        {(() => {
          // A diagram's ghost: its shapes and connectors, pale, exactly where Accept puts them, above everything.
          const g = preview?.kind === 'diagram' && placements[preview.requestId];
          if (!g?.layout || status !== 'preview') return null;
          const at = id => { const node = g.layout.nodes.find(entry => entry.id === id); return node && { x: (g.x + node.x) * z + view.x, y: (g.y + node.y) * z + view.y, w: node.w * z, h: node.h * z }; };
          const label = new Map(preview.spec.shapes.map(shape => [shape.id, shape.label]));
          return (
            <div data-inline-ghost data-ghost-kind="diagram" onPointerDown={event => event.stopPropagation()} className="pointer-events-auto absolute opacity-60"
              style={{ left: g.x * z + view.x, top: g.y * z + view.y, width: g.size.w * z, height: g.size.h * z }}>
              <svg className="absolute overflow-visible" style={{ left: -(g.x * z + view.x), top: -(g.y * z + view.y), width: 1, height: 1 }}>
                {preview.spec.connectors.map((link, i) => { const a = at(link.from), b = at(link.to); return a && b && <line key={i} x1={a.x + a.w / 2} y1={a.y + a.h / 2} x2={b.x + b.w / 2} y2={b.y + b.h / 2} stroke="#6b7280" strokeWidth={1.5 * z} strokeDasharray="6 4" />; })}
              </svg>
              {g.layout.nodes.map(node => { const box = at(node.id); return box && (
                <div key={node.id} className="absolute flex items-center justify-center rounded-md border-2 border-dashed border-[#6b7280] bg-white/90 px-1 text-center text-ink dark:bg-[#202020]/90"
                  style={{ left: box.x - (g.x * z + view.x), top: box.y - (g.y * z + view.y), width: box.w, height: box.h, fontSize: 12 * z }}>{label.get(node.id)}</div>
              ); })}
            </div>
          );
        })()}
        {['edit','annotations'].includes(preview?.kind)&&status==='preview'&&((preview.additions?.length||0)+(preview.removals?.length||0)>0)&&(()=>{
          const additions=preview.additions||[],shapes=additions.filter(entry=>entry.list==='shapes');
          const boxOf=id=>{const shape=shapes.find(entry=>entry.id===id)?.after;return shape?{x:Math.min(shape.x1,shape.x2),y:Math.min(shape.y1,shape.y2),w:Math.abs(shape.x2-shape.x1),h:Math.abs(shape.y2-shape.y1)}:canvas.boxOf(id);};
          return <svg data-inline-structural-preview className="absolute overflow-visible opacity-70" style={{left:0,top:0,width:1,height:1,pointerEvents:'none'}}><g transform={`translate(${view.x} ${view.y}) scale(${z})`}>
            {shapes.map(entry=><g key={entry.id}>{canvas.renderNativeShape?.(entry.after)}</g>)}
            {additions.filter(entry=>entry.list==='links').map(entry=>{const a=boxOf(entry.after.from),b=boxOf(entry.after.to);return a&&b&&<line key={entry.id} x1={a.x+a.w/2} y1={a.y+a.h/2} x2={b.x+b.w/2} y2={b.y+b.h/2} stroke="#6b7280" strokeWidth={2} strokeDasharray="6 4"/>;})}
            {(preview.removals||[]).map(entry=>{const at=canvas.boxOf(entry.id);return at&&<rect key={entry.id} x={at.x} y={at.y} width={at.w} height={at.h} fill="#b4231820" stroke="#b42318" strokeDasharray="6 4"/>;})}
          </g></svg>;
        })()}
        {/* A7: an edit, pale, in place over each object it changes - removed words struck through, added words marked, a
            style change shown on the new text. While it streams, the new words so far. The object is untouched until Accept. */}
        {(() => {
          const place = id => { const world = canvas.boxOf(id); return world && { left: world.x * z + view.x, top: world.y * z + view.y, minWidth: world.w * z, minHeight: world.h * z }; };
          // Over its own object, so it lets clicks through: the learner can still open and edit those words.
          const frame = 'absolute rounded-md border border-dashed border-ai bg-white/95 px-1 text-ink opacity-60 dark:bg-[#202020]/95';
          if (status === 'streaming' && state.stream?.edits) return Object.entries(state.stream.edits).map(([id, text]) => {
            const at = place(id);
            return at && <div key={id} data-inline-ghost data-ghost-kind="edit" data-ghost-for={id} className={frame} style={{ ...at, fontSize: 14 * z }}>{text}</div>;
          });
          if (!['edit','annotations'].includes(preview?.kind) || status === 'streaming') return null;
          return (preview.changes || []).map(change => {
            const at = place(change.id);
            if (!at) return null;
            if(change.native&&change.list==='blocks'&&change.bounds)return <div key={change.id} data-inline-native-preview data-ghost-for={change.id} className={`${frame} overflow-hidden p-2`} style={{left:change.bounds.x*z+view.x,top:change.bounds.y*z+view.y,width:change.bounds.w*z,height:change.bounds.h*z,fontSize:12*z}}><span>{change.appearance.title||change.appearance.type||'Card'}</span><p>Layout preview: {Math.round(change.bounds.w)} x {Math.round(change.bounds.h)}</p></div>;
            if(change.native&&change.list==='shapes'&&canvas.renderNativeShape)return <svg key={change.id} data-inline-native-preview data-ghost-for={change.id} className="absolute overflow-visible opacity-75" style={{left:0,top:0,width:1,height:1,pointerEvents:'none'}}><g transform={`translate(${view.x} ${view.y}) scale(${z})`}>{canvas.renderNativeShape(change.appearance)}</g></svg>;
            if(change.native){const proposed=change.bounds;return <div key={change.id} data-inline-native-preview data-ghost-for={change.id} className={frame} style={{...at,left:Number.isFinite(proposed.x)?proposed.x*z+view.x:at.left,top:Number.isFinite(proposed.y)?proposed.y*z+view.y:at.top,color:change.appearance.textColor,background:change.appearance.fill||undefined}}>{change.after||'Proposed style'}</div>;}
            if (change.structured) return <div key={change.id} data-inline-ghost data-ghost-kind="edit" data-ghost-for={change.id} data-card-edit-ghost className="absolute overflow-hidden rounded-md border border-dashed border-ai bg-white p-3 text-ink shadow-sm dark:bg-[#202020]" style={{ left: at.left, top: at.top, width: at.minWidth, height: at.minHeight }}>
              <p className="mb-2 text-xs font-semibold text-ink-2">Proposed revision</p>
              <CardEditPreview fields={change.fields} proposedOnly />
            </div>;
            const styled = Object.fromEntries((change.style || []).map(([key, , after]) => [key, after]));
            const look = { fontSize: (styled.fontSize || 14) * z, fontWeight: styled.bold ? 700 : undefined, fontStyle: styled.italic ? 'italic' : undefined, textDecoration: styled.underline ? 'underline' : undefined, color: styled.textColor || undefined };
            return (
              <div key={change.id} data-inline-ghost data-ghost-kind="edit" data-ghost-for={change.id} className={frame} style={{ ...at, ...look }}>
                {wordDiff(change.before, change.after).map((part, index) => (part.kind === 'same' ? <span key={index}>{part.t}</span>
                  : part.kind === 'del' ? <del key={index} data-ghost-del className="text-[#b42318]">{part.t}</del>
                    : <ins key={index} data-ghost-add className="bg-[#dcfce7] text-[#067647] no-underline">{part.t}</ins>))}
              </div>
            );
          });
        })()}
      </div>
      {/* The composer (owner brief 2026-10-13): one surface - the prompt, then a thin row of Context, the mode and Send along
          its bottom edge; output appears beneath the prompt only when there is some. */}
      <div ref={box} role="dialog" aria-label="Quick Edit" aria-modal="false" data-inline-ai data-keep-focus data-status={status} data-inline-command={command || undefined}
        onPointerDown={event => { event.stopPropagation(); if (!event.target.closest('[data-inline-mode-menu],[data-inline-mode-toggle]')) setModeOpen(false); if (!event.target.closest('[data-inline-context-popover],[data-inline-context]')) setContextOpen(false); if (pickerOpen && !event.target.closest('[data-inline-picker],[data-inline-prompt]')) setPickerShut(true); }}
        onDoubleClick={event => event.stopPropagation()} onContextMenu={event => event.stopPropagation()} onKeyDown={keyDown}
        style={{ left: place.left, width: place.width, ...(place.up ? { bottom: surface.h - place.top - height } : { top: place.top }) }}
        className="absolute z-40 flex flex-col rounded-xl border border-line bg-white p-3 text-sm text-ink shadow-[0_2px_12px_rgba(15,15,15,0.08)]">
        {/* What the request is about, for screen readers: the canvas keeps the selection highlighted; no header repeats it. */}
        <span data-inline-target-label className="sr-only">{targetLabel(target, board())}</span>
        <button type="button" data-inline-close aria-label="Close" title="Close (Esc)" onClick={close}
          className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-md text-ink-3 outline-none hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-ai"><X size={14} /></button>
        {/* The chosen command (CommandPill, shared with Chat): removing it keeps the words, the selection and the context. */}
        {showsPill(command) && <div className="mb-1.5 flex pr-7"><CommandPill name={command} disabled={busy(status)} onRemove={() => { setCommand(null); focusField(); }}
          className="h-6 gap-0.5 rounded-md pr-0.5 pl-1.5 text-xs" removeClassName="h-5 w-5" /></div>}
        <textarea ref={field} rows={2} value={prompt} onChange={event => typing(event.target.value)} onKeyDown={fieldKey} data-inline-prompt
          aria-activedescendant={pickerOpen && matches.length ? `inline-command-${matches[Math.min(active, matches.length - 1)].name}` : undefined}
          aria-label={preview ? 'Refine the request' : mode === 'edit' ? 'What would you like to change?' : 'What would you like to understand?'}
          placeholder={target.creation ? 'What would you like to add or understand?' : mode === 'edit' ? 'What would you like to change?' : 'What would you like to understand?'}
          disabled={readOnly} style={{ maxHeight: PROMPT_H }}
          className="min-h-11 w-full resize-none overflow-y-auto border-0 bg-transparent p-0 pr-7 text-sm leading-5 outline-none placeholder:text-ink-3" />
        {readOnly && <p data-inline-readonly className="mt-1 text-xs text-ink-2">This canvas is view-only, so Edit and Explain can't add to it.</p>}
        {/* Output, beneath the prompt, only when there is some; a short status only while nothing has arrived. */}
        {state.notice && <p data-inline-notice className="mt-2 text-xs text-ink-2">{state.notice}</p>}
        {moved && moved === preview?.requestId && <p data-inline-moved role="status" className="mt-2 text-xs text-ink-2">Something is where this was going, so it has a new place on the canvas. Check it, then Accept again.</p>}
        {busy(status) && !streamText && !state.stream?.edits && <p data-inline-stage role="status" className="mt-2 flex min-w-0 items-center gap-1.5 text-xs text-ink-2"><Loader2 size={12} className="shrink-0 animate-spin" /><span className="truncate">{state.stage}{preview ? ' (your last preview stays until this one is ready)' : ''}</span></p>}
        {(writing && streamText) || (preview?.kind === 'note' && status !== 'streaming') ? (
          // While words stream in, the box keeps one height and scrolls: the composer never grows per chunk.
          <div data-inline-preview="note" data-scroll className={`mt-2 overflow-y-auto rounded-lg bg-hover/60 px-2 py-1.5 text-sm leading-5 whitespace-pre-wrap ${status === 'streaming' ? 'h-40' : 'max-h-40'}`}>
            {status === 'streaming' || !preview ? streamText : preview.text}
            <p className="mt-1 text-[11px] text-ink-3">{status === 'streaming' ? 'Writing… (not on the canvas until you accept)' : target.creation ? 'Adds an editable note at the insertion point.' : `Adds an editable note${target.ids.length === 1 ? ' with an arrow' : ''} beside the selection.`}</p>
          </div>
        ) : null}
        {preview?.extraction&&<div data-inline-extraction className="mt-2 rounded-lg border border-line p-2 text-xs">
          <p className="font-medium">Image interpretation</p>
          <p>Check this result against the original image. Recognition is not verified, even when no uncertainty is reported.</p>
          {preview.extraction.uncertainties.map((item,index)=><p key={index} className="mt-1"><strong>{item.location}:</strong> {item.message}</p>)}
          <p className="mt-1 text-ink-3">Uses the selected image revision. Accept adds a separate editable result and retains the original.</p>
        </div>}
        {preview?.kind==='equation'&&<div data-inline-preview="equation" className="mt-2 space-y-2 rounded-lg border border-line p-2">
          {preview.label&&<p className="text-xs font-medium">{preview.label}</p>}
          <div data-equation-preview className="max-h-44 overflow-auto" style={{fontSize:24}}>{equationChecked?.ok?<MathText expression={equationLatex} display/>:<p role="alert" className="text-xs">{equationChecked?.error}</p>}</div>
          <textarea data-inline-equation-latex aria-label="Equation LaTeX" value={equationLatex} onChange={event=>setEquationLatex(event.target.value)} className="w-full rounded border border-line p-1 font-mono text-xs"/>
          {preview.assumptions?.map((text,index)=><p key={index} className="text-xs text-ink-2">Assumption: {text}</p>)}
          <p className="text-[11px] text-ink-3">{preview.frozen.equationItem?'Replaces this equation after acceptance.':'Adds a native editable equation; selected content stays unchanged.'} Rendering does not verify the mathematics.</p>
        </div>}
        {(state.stream?.edits && busy(status)) && (
          <div data-inline-preview="edit-stream" data-scroll className="mt-2 h-40 overflow-y-auto rounded-lg bg-hover/60 px-2 py-1.5 text-xs">
            {Object.entries(state.stream.edits).map(([id, text]) => <pre key={id} className="whitespace-pre-wrap font-mono text-[12px] text-[#1a7f37]">{text}</pre>)}
            <p className="mt-1 text-[11px] text-ink-3">Writing… (checked before you can accept)</p>
          </div>
        )}
        {['edit','annotations'].includes(preview?.kind) && !busy(status) && (
          <div data-inline-preview={preview.kind} data-scroll className="mt-2 max-h-48 overflow-y-auto rounded-lg bg-hover/60 px-2 py-1.5 text-xs">
            {preview.summary && <p className="mb-1 text-ink-2">{preview.summary}</p>}
            {(preview.additions||[]).map(entry=><p key={entry.id} data-inline-addition={entry.id} className="text-[#1a7f37]">Add {entry.list==='links'?'connector':'shape'}: {entry.after.text||entry.after.label||`${entry.after.from} → ${entry.after.to}`}</p>)}
            {(preview.removals||[]).map(entry=><p key={entry.id} data-inline-removal={entry.id} className="text-[#b42318]">Remove {entry.list==='links'?'connector':'shape'}: {entry.before.text||entry.before.label||entry.id}</p>)}
            {(preview.limitations||[]).map(text=><p key={text} className="text-ink-2">{text}</p>)}
            {preview.changes.map(change => (
              <div key={change.id} data-inline-change={change.id} className="mb-1.5">
                {change.structured ? <CardEditPreview fields={change.fields} /> : change.before !== change.after && <>
                  <pre data-before className="whitespace-pre-wrap font-mono text-[12px] text-[#b42318] line-through decoration-[#b42318]/50">{change.before}</pre>
                  <pre data-after className="whitespace-pre-wrap font-mono text-[12px] text-[#1a7f37]">{change.after}</pre>
                </>}
                {change.notice && <p className="text-ink-2">{change.notice}</p>}
                {change.style.map(([key, from, to]) => <p key={key} className="text-ink-2">{key === 'fontSize' ? 'Font size' : key === 'level' ? 'Level' : key}: {String(from ?? 'default')} → {String(to ?? 'default')}</p>)}
              </div>
            ))}
            {target.range && <p className="text-[11px] text-ink-3">Only the selected words change; the rest stays as it is.</p>}
          </div>
        )}
        {preview?.imageTransform && !busy(status) && <div data-inline-image-preview className="mt-2 rounded-lg bg-hover/60 p-2 text-xs">
          {imageRevision?.requestId===preview.requestId?<img src={imageRevision.value.previewURL} alt="Proposed image revision" className="max-h-48 w-full object-contain"/>:<p role="status">{imageError||'Preparing image preview...'}</p>}
          <p className="mt-1 text-ink-2">Accept replaces this image with a saved revision. The original remains retained. Cancel may leave an unused stored upload; it never deletes the original.</p>
        </div>}
        {preview?.kind === 'diagram' && !busy(status) && (
          <div data-inline-preview="diagram" data-scroll className="mt-2 max-h-40 overflow-y-auto rounded-lg bg-hover/60 px-2 py-1.5 text-xs">
            <p className="font-medium text-ink">Diagram: {preview.spec.shapes.length} shapes, {preview.spec.connectors.length} connectors{preview.spec.groups.length ? `, ${preview.spec.groups.length} groups` : ''}</p>
            <p className="mt-0.5 line-clamp-3 text-ink-2">{preview.spec.shapes.map(shape => shape.label).join(' · ')}</p>
            <p className="mt-1 text-[11px] text-ink-3">{placements[preview.requestId]?.offscreen ? 'Shown where it lands; ' : ''}Adds editable shapes and arrows to the canvas when you accept.</p>
          </div>
        )}
        {(preview?.kind === 'card' || preview?.kind === 'proposal') && !busy(status) && (
          <div data-inline-preview={preview.kind} data-card-type={preview.block?.type} className="mt-2 rounded-lg bg-hover/60 px-2 py-1.5 text-xs">
            <p className="font-medium text-ink">{preview.route ? routeLabel(preview.route) : 'Card'}: {short(preview.block?.title || preview.describe?.title || '', 60)}</p>
            {(() => { const b = preview.block || {}; const words = [b.brief, b.caption, b.body, b.goal, b.operation?.request, typeof b.code === 'string' ? b.code : null].find(value => typeof value === 'string' && value.trim()) || preview.describe?.text; return words ? <p className="mt-0.5 line-clamp-3 text-ink-2">{short(words, 220)}</p> : null; })()}
            <p className="mt-1 text-[11px] text-ink-3">Adds this card ({short(preview.block?.type, 20)}) to the canvas when you {preview.kind === "proposal" ? "generate" : "accept"}.</p>
          </div>
        )}
        {status === 'proposal' && (
          <div data-inline-paid role="group" aria-label="Paid generation" className="mt-2 rounded-lg bg-hover px-2 py-1.5 text-xs text-ink-2">
            <p>{state.proposal?.message || 'This uses paid generation.'} Starting it can cost money even if you later reject or undo the card; undoing is not a refund. Once started, the job runs on its card and can't be cancelled from here.</p>
            <div className="mt-1.5 flex justify-end gap-1.5">
              <button type="button" data-paid-cancel onClick={reject} className="h-7 rounded-lg border border-line bg-white px-2.5 text-ink hover:bg-hover">Cancel</button>
              <button type="button" data-paid-generate onClick={accept} disabled={!acceptable} className="h-7 rounded-lg bg-ink px-2.5 font-medium text-white disabled:opacity-40">Generate</button>
            </div>
          </div>
        )}
        {status === 'clarify' && state.clarify && (
          <div data-inline-clarify className="mt-2 rounded-lg bg-hover px-2 py-1.5 text-xs">
            <p className="flex items-start gap-1 text-ink"><CircleHelp size={13} className="mt-px shrink-0 text-ai" />{state.clarify.question}</p>
            {preview && <button type="button" data-inline-back onClick={() => session.back()} className="mt-1.5 flex items-center gap-1 rounded px-0.5 text-ink-2 hover:text-ink"><RotateCcw size={11} />Back to the preview</button>}
          </div>
        )}
        {status === 'stale' && state.stale && (
          <p data-inline-stale role="alert" className="mt-2 flex items-center gap-1.5 text-xs text-[#b42318]">{state.stale.text} <button type="button" onClick={send} className="inline-flex items-center gap-1 rounded border border-line px-1.5 py-0.5 text-ink hover:bg-hover"><RotateCcw size={11} />Regenerate</button></p>
        )}
        {/* A request the check did not let through: one short message, the prompt kept, nothing on the canvas. */}
        {cadJob && <div data-cad-inline-review className="mt-2 flex flex-col gap-2">
          <p role="status" className="text-xs text-ink-2">{cadJob.awaitingAccept ? 'Proposed CAD revision. Your current model stays unchanged until Accept.' : cadStage(cadJob.state)}{cadJob.error ? `: ${cadJob.error}` : ''}</p>
          {cadJob.awaitingAccept && <div className="flex h-56 flex-col"><CadPreview manifest={cadJob.manifest} active/></div>}
          <div className="flex justify-end gap-1.5"><button type="button" data-inline-reject onClick={()=>cadAccept('cancel')} disabled={cadPending} className="h-6 rounded-md border border-line px-2 text-xs">{cadJob.awaitingAccept ? 'Reject' : 'Cancel job'}</button>
          {cadJob.awaitingAccept && <button type="button" data-inline-accept onClick={()=>cadAccept('accept')} disabled={cadPending || readOnly} className="h-6 rounded-md bg-ink px-2 text-xs text-white">Accept</button>}</div>
          <p className="text-xs text-ink-2">Closing this editor keeps the saved job running. You can review it on the CAD card later.</p>
        </div>}
        {cadConfirmation && <PaidConfirm message="Generate this CAD revision? Bounded generation includes model and executor work." onCancel={()=>setCadConfirmation(null)} onGenerate={generateCad} />}
        {(cadPending || cadError) && <p data-cad-submit-status role="status" className="mt-2 text-xs text-ink-2">{cadPending ? 'Saving the CAD job...' : cadError}</p>}
        {refused && <p data-inline-unsupported={refused} role="status" className="mt-2 text-xs text-ink-2">{unsupportedText(refused)}</p>}
        {state.declined && <p data-inline-decision={state.declined.decision} role="status" className="mt-2 text-xs text-ink-2">{state.declined.message}</p>}
        {state.error && <p data-inline-error role="alert" className="mt-2 flex items-center gap-1.5 text-xs text-[#b42318]">{state.error}
          {state.retry && <button type="button" data-inline-retry onClick={send} className="inline-flex items-center gap-1 rounded border border-line px-1.5 py-0.5 text-ink hover:bg-hover"><RotateCcw size={11} />Try again</button>}</p>}
        {(preview && status !== 'proposal') && (
          <div className="mt-2 flex items-center justify-end gap-1.5">
            <button type="button" data-inline-reject onClick={reject} className="h-6 rounded-md border border-line bg-white px-2 text-xs text-ink outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-ai">Reject</button>
            <button type="button" data-inline-accept onClick={accept} disabled={!acceptable || readOnly} title={busy(status) ? 'Waiting for the new version' : 'Accept (Ctrl Enter)'}
              className="flex h-6 items-center gap-1 rounded-md bg-ink px-2 text-xs font-medium text-white outline-none focus-visible:ring-2 focus-visible:ring-ai disabled:opacity-40"><Check size={12} />Accept</button>
          </div>
        )}
        {/* The count, only near the supported limit or past it: nothing is cut, Send waits and says what to do. */}
        {outgoing.length >= NEAR && <p data-inline-count className={`mt-1 text-right text-[11px] ${outgoing.length > PROMPT_MAX ? 'text-[#b42318]' : 'text-ink-3'}`}>{outgoing.length} / {PROMPT_MAX}{outgoing.length > PROMPT_MAX ? ' - shorten it to send' : ''}</p>}
        <div className="mt-2 flex items-center gap-2">
          <button type="button" data-inline-context aria-haspopup="dialog" aria-expanded={contextOpen} title="What this request includes"
            onClick={() => { setModeOpen(false); setContextOpen(open => !open); }}
            className="rounded-md px-1 py-0.5 text-xs text-ink-2 outline-none hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-ai">Context</button>
          <div className="relative ml-auto flex items-center gap-1.5">
            <button type="button" data-inline-mode-toggle data-inline-mode-current={mode} aria-haspopup="menu" aria-expanded={modeOpen} disabled={busy(status)} title="Quick Edit mode"
              onClick={() => { setContextOpen(false); setModeOpen(open => !open); }}
              className="flex h-7 items-center gap-0.5 rounded-md px-1.5 text-xs text-ink-2 outline-none hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-ai disabled:opacity-40">
              {MODES.find(([value]) => value === mode)[1]}<ChevronDown size={12} />
            </button>
            {modeOpen && (
              <div role="menu" data-inline-mode-menu aria-label="Mode" className={`absolute right-9 z-50 w-44 rounded-lg border border-line bg-white p-1 shadow-[0_2px_12px_rgba(15,15,15,0.12)] ${popBelow ? 'top-full mt-1' : 'bottom-full mb-1'}`}>
                {MODES.map(([value, label]) => (
                  <button key={value} type="button" role="menuitemradio" aria-checked={mode === value} data-inline-mode={value}
                    disabled={(target.creation || fileLocked || cardEditReason) && value === 'edit'} title={value !== 'edit' ? undefined : target.creation ? 'Select something to edit.' : fileLocked ? FILE_EDIT_LOCKED : cardEditReason || undefined}
                    onClick={() => { changeMode(value); setModeOpen(false); focusField(); }}
                    className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-xs text-ink outline-none hover:bg-hover focus-visible:bg-hover disabled:text-ink-3 disabled:hover:bg-transparent">
                    <span className="flex w-3.5 justify-center">{mode === value && <Check size={13} className="text-ai" />}</span>{label}
                  </button>
                ))}
                {target.creation && <p data-inline-edit-disabled className="px-2 pt-0.5 pb-1 text-[11px] text-ink-3">Select something to edit.</p>}
                {cardEditReason && !fileLocked && <p data-inline-edit-disabled className="px-2 pt-0.5 pb-1 text-[11px] text-ink-3">{cardEditReason}</p>}
                {fileLocked && <p data-inline-edit-disabled data-inline-file-locked className="px-2 pt-0.5 pb-1 text-[11px] text-ink-3">{FILE_EDIT_LOCKED}</p>}
              </div>
            )}
            {busy(status) ? (
              // A second press of a double press lands here as detail 2: it never stops the request it just sent.
              <button type="button" data-inline-stop aria-label="Stop" title="Stop" onClick={event => { if (event.detail < 2) session.cancel(); }}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-white outline-none focus-visible:ring-2 focus-visible:ring-ai"><Square size={10} fill="currentColor" /></button>
            ) : (
              <button type="button" data-inline-submit aria-label={preview ? 'Refine' : 'Send'} title={preview ? 'Refine (Enter)' : 'Send (Enter)'}
                disabled={!!cadJob || cadPending || readOnly || status === 'proposal' || !outgoing.trim() || outgoing.length > PROMPT_MAX} onClick={send}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-white outline-none focus-visible:ring-2 focus-visible:ring-ai disabled:bg-hover disabled:text-ink-3"><ArrowUp size={15} /></button>
            )}
          </div>
        </div>
        {/* The / picker: the registry's Ctrl+K commands for this canvas, filtered as the line is typed. Up/Down move,
            Enter or Tab picks, Esc closes the list (never the editor); a click picks too. Focus stays in the prompt. */}
        {pickerOpen && (
          <div role="listbox" aria-label="Commands" data-inline-picker data-scroll
            className={`absolute left-0 z-50 max-h-64 w-72 max-w-full overflow-y-auto rounded-xl border border-line bg-white p-1 text-xs shadow-[0_2px_12px_rgba(15,15,15,0.12)] ${popBelow ? 'top-full mt-1.5' : 'bottom-full mb-1.5'}`}>
            {matches.length ? matches.map((entry, index) => (
              <button key={entry.name} id={`inline-command-${entry.name}`} type="button" role="option" aria-selected={index === Math.min(active, matches.length - 1)} data-inline-command-option={entry.name}
                onMouseEnter={() => setActive(index)} onMouseDown={event => event.preventDefault()} onClick={() => choose(entry)}
                className={`flex w-full items-baseline gap-2 rounded-lg px-2 py-1.5 text-left ${index === Math.min(active, matches.length - 1) ? 'bg-hover' : ''}`}>
                <CommandMark name={entry.name} className="text-sm text-ink" /><span className="truncate text-ink-2">{descFor(entry, 'ctrlk')}</span>
              </button>
            )) : <p data-inline-picker-none className="px-2 py-1.5 text-ink-2">No Ctrl+K command matches.</p>}
          </div>
        )}
        {/* Point 8: the Context popover - anchored, bounded and scrolling, never part of the composer's own height. */}
        {contextOpen && (
          <div role="dialog" aria-label="Context" data-inline-context-popover data-scroll
            className={`absolute left-0 z-50 max-h-64 w-80 max-w-full overflow-y-auto rounded-xl border border-line bg-white p-2 text-xs text-ink-2 shadow-[0_2px_12px_rgba(15,15,15,0.12)] ${popBelow ? 'top-full mt-1.5' : 'bottom-full mb-1.5'}`}>
            {!prepared ? <p>Preparing context…</p> : (
              <ul data-inline-context-list className="space-y-0.5">
                <li data-inline-context-target className="font-medium text-ai">{target.creation ? 'Adding at the insertion point' : `Selected${mode === 'edit' ? ' · the only thing an edit changes' : ''}`}</li>
                {target.creation && <li data-inline-context-entry="anchor" className="pl-2">{prepared.context.related.length ? 'Nothing selected; read with what is around it.' : 'Empty canvas here: your words and the default look.'}</li>}
                {prepared.context.target.objects.map(entry => <li key={entry.id} data-inline-context-entry="selected" className="truncate pl-2">{LABEL[entry.type] || entry.type}{entry.flattened ? ' (flattened image)' : ''} · {short(target.range && target.range.id === entry.id ? target.range.text : entry.text)}</li>)}
                {!selectionOnly && <li data-inline-context-group="supporting" className="pt-1 font-medium text-ink">Supporting · read-only{prepared.context.related.length ? '' : ': none found'}</li>}
                {prepared.context.related.map(entry => <li key={entry.id} data-inline-context-entry="supporting" className="truncate pl-2">{RELATION[entry.relation] || entry.relation} · {LABEL[entry.type] || entry.type} · {short(entry.text)}</li>)}
                {prepared.context.target.group && <li className="truncate pl-2">group “{short(prepared.context.target.group.label || 'untitled', 30)}”</li>}
                {prepared.context.metadata.conversation?.length > 0 && <li className="pl-2">{prepared.context.metadata.conversation.length} available conversation turns (bounded)</li>}
                {prepared.context.metadata.sources?.length > 0 && <li className="pl-2">{prepared.context.metadata.sources.length} attached source references (listed, content not read)</li>}
                {prepared.context.metadata.canvasTitle && <li className="truncate pl-2">canvas title “{short(prepared.context.metadata.canvasTitle, 40)}” (background only)</li>}
                {prepared.context.style && <li data-inline-context-style className="truncate pl-2">look to match: {prepared.context.style.from ? `${prepared.context.style.kind} shapes, ${prepared.context.style.route} arrows` : 'the default (nothing drawn nearby)'}</li>}
                <li data-inline-context-group="limits" className="pt-1 font-medium text-ink">Limits</li>
                {selectionOnly ? <li className="pl-2">Surroundings left out (selection only).</li>
                  : <li data-inline-context-scope className="pl-2">{considered > 0 ? `Chosen by relevance from ${considered} other object${considered === 1 ? '' : 's'} on the canvas. The rest were not sent.` : 'Nothing else is on the canvas.'}</li>}
                {omittedTotal > 0 && <li className="pl-2">{omittedTotal} more relevant left out by the limits.</li>}
              </ul>
            )}
            {!target.creation && <label className="mt-2 flex items-center gap-1.5 border-t border-line pt-2 text-ink"><input type="checkbox" data-inline-selection-only checked={selectionOnly} disabled={busy(status) || !!preview} title={preview ? 'This preview was made with this scope. Reject it to change the scope.' : undefined} onChange={event => setSelectionOnly(event.target.checked)} className="h-3 w-3 accent-[var(--color-ai)]" />Selection only</label>}
          </div>
        )}
      </div>
    </>
  );
}
