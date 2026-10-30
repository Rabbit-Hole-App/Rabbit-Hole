// The chat transcript (moved out of ask.jsx's AskPanel): one ChatMessage per message, and the cards a message can be.
import { Component, useEffect, useRef, useState } from 'react';
import { ArrowDown, Copy, CornerDownRight, Loader2, Network } from 'lucide-react';
import CommandPill from './CommandPill.jsx';
import { sentCommand } from './command-token.js';
import { typedOf } from './agent/slash.js';
import { api, navigate } from './api.js';
import { EvidencePill, Md } from './Md.jsx';
import { waitingText } from './waiting-text.js';
import AnswerFooter, { cardIdFor, getAnswerAlternative } from './AnswerFooter.jsx';
import { useChatWorkspace } from './chat-workspace.jsx';
import { cn } from './ui.jsx';
import AnswerSuggestions from './AnswerSuggestions.jsx';
import SyllabusMessage from './SyllabusMessage.jsx';
import { ChatOutputs } from './ChatOutputs.jsx';
import GenerationProposalCard from './GenerationProposalCard.jsx';
import { EXPLAIN_STOPPED, jobReviewCopy, PROPOSAL_REFUSED_EVENT, approvesJob, editPath, editTarget, generateProposal, proposalActive, proposalBlock, refinementConflictText, settingsConflict, startAdapter } from './generation-proposal-chat.js';
import { confirmProposal, fetchProposal, problemOf, saveProposal } from './generation-review-client.js';
import { withPrompt } from './card-prompt.js';
import { reportClientError } from './client-telemetry.js';
import { imageGenerationId, imageGenerationOn, imageStatus, retryImageSave, runImageJob } from './generate-image.js';
import { sameFileCard } from './file-to-canvas.js';
import { mergeOutputs, openOutput, outputSink } from './chat-output-refs.js';
import { cardStatus, imageProposalStatus, madeFromVersion, outputForProposal } from './generation-proposal-status.js';
import { responseKind, turnIndex } from './chat-response-kind.js';
import { briefHeading, isBriefCommand } from './material-brief.js';

// UI-15 / MOT-20: an answer's generation proposal, drawn by the shared card under it. Live only as the newest version of its
// proposal that has not made its card yet. A settings change saves the next version over this message (chat-proposal-route.js);
// Generate adds its capability's card (proposalBlock, an adapter per capability) with the exact approved proposal, once (insertCard finds one it already made).
export function ProposalSlot({ m, i, msgs, setMsgs, ops }) {
  const p = m.meta.proposal;
  const chat = useChatWorkspace(); // a reference pill opens its source beside the Chat, as an attached chip does
  const [busy, setBusy] = useState(false), [error, setError] = useState(null), [pressed, setPressed] = useState(false), [released, setReleased] = useState(0);
  const making = useRef(false); // one material Generate in flight, even across two clicks in one frame
  const saved = /^\d+$/.test(String(m.messageId ?? ''));
  // Bug 2 (chat generation UX): the proposal's visual state is its REAL job's, read from the card it made on the canvas (the same block
  // the canvas card and the Chat's watch read), or from the output this turn saved for it after a reload; the local pressed flag only
  // covers the moment between the press and the card landing. A motion proposal's card is on the canvas; an image proposal reports
  // the job's own status and has no card until it is made.
  const turnAt = turnIndex(msgs, i), turn = turnAt >= 0 ? msgs[turnAt] : null;
  const cardKind = proposalBlock(p) ? 'card' : p.command === 'generate-image' ? 'image' : null;
  const output = outputForProposal(turn, p);
  const card = ops?.proposalCard?.(p.proposal_id) ?? (output ? ops?.block?.(output.cardId) ?? null : null);
  const refusedCard = !!card?.proposalRefused;
  const [pressedAt, setPressedAt] = useState(null);
  const made = pressed || !!ops?.proposalMade?.(p.proposal_id) || (!!output && !refusedCard);
  // An Explain brief stopped here (Cancel: the job's own cancel action); a reload asks the server, which refuses its Generate.
  const [stopped, setStopped] = useState(false);
  // Generate is enabled by the command's own start adapter: an output card (Motion) or an existing job (Explain).
  const active = !made && !stopped && !!startAdapter(p, ops) && proposalActive(p, msgs);
  // Edit (conversational editing): this exact revision becomes the Chat's editing target, the composer opens and keeps its draft.
  // Nothing is sent, no model is called, nothing generates. Only where its command revises in chat (editPath); otherwise the card
  // keeps its details form. The Table of contents' conversation never targets a proposal.
  const editing = chat && !chat.tocView ? chat.editing : null, target = editing?.target;
  const targeted = !!target && target.proposalId === p.proposal_id && target.version === p.version;
  const onEdit = editing && active && saved && editPath(p, ops) ? () => { editing.set(editTarget(p, m.messageId, chat.thread?.id ?? null)); chat.panels?.openChat(); chat.composer.focus(); } : null;
  // UI-15.1: each reference's state from the server (changed, deleted, inaccessible, unsupported), read now; a blocked one is said before Generate.
  const [states, setStates] = useState(null), [problem, setProblem] = useState(null);
  const wanted = saved && p.references?.length > 0;
  useEffect(() => {
    if (!wanted) { setStates(null); return undefined; }
    let live = true;
    fetchProposal(api, m.messageId).then(found => { if (live) setStates(found.references); }, () => {});
    return () => { live = false; };
  }, [wanted, m.messageId, p.version]); // eslint-disable-line react-hooks/exhaustive-deps
  // MOT-22: a save names the revision it was made from. Refused because the proposal changed (another tab, a chat refinement or a
  // Generate), it keeps the learner's choice beside the latest (settingsConflict), and the card shows the latest when it is this one.
  const [conflict, setConflict] = useState(null);
  // UI-15.1: one save for every edit (a setting or the details): the next revision, no model call. A refusal keeps the draft: the card
  // says why (stale, used, invalid, references) and a failed save rejects so the card keeps its form open.
  const onSave = async (edit, base = p) => {
    if (!saved) return;
    setBusy(true); setError(null); setConflict(null); setProblem(null);
    try {
      const result = await saveProposal(api, m.messageId, base, edit);
      setMsgs(ms => ms.map((x, j) => (j === i ? { ...x, meta: { ...x.meta, proposal: result.proposal } } : x)));
      // The person's own settings change on the targeted card: the target follows it to the revision they now see.
      if (targeted) editing.set(editTarget(result.proposal, m.messageId, target.threadId));
      setStates(result.references?.length ? result.references : null);
    } catch (failure) {
      const next = edit.settings && Object.keys(edit).length === 1 ? settingsConflict(failure, edit.settings, m.messageId) : null;
      if (next?.here) setMsgs(ms => ms.map((x, j) => (j === i ? { ...x, meta: { ...x.meta, proposal: next.current } } : x)));
      if (next) setConflict(next); else { const why = problemOf(failure); setProblem(why); if (why.kind === 'stale' && why.current && String(why.currentMessageId) === String(m.messageId)) setMsgs(ms => ms.map((x, j) => (j === i ? { ...x, meta: { ...x.meta, proposal: why.current } } : x))); }
      throw failure;
    } finally { setBusy(false); }
  };
  const onSettingsChange = (settings, base = p) => onSave({ settings }, base).catch(() => {});
  // MOT-22: the server refused this proposal's Generate (its card is marked, not counted as made): live again, with the reason.
  useEffect(() => {
    const refused = event => {
      if (event.detail?.proposalId !== p.proposal_id) return;
      setPressed(false); setReleased(n => n + 1); setError(event.detail.message);
      // A stale price: the same settings are signed again with the server's updated quote, which the card then shows for explicit confirmation.
      if (event.detail.code === 'motion_quote_stale') onSave({ settings: p.settings }).catch(() => {});
    };
    window.addEventListener(PROPOSAL_REFUSED_EVENT, refused);
    return () => window.removeEventListener(PROPOSAL_REFUSED_EVENT, refused);
  }, [p.proposal_id, p.version]); // eslint-disable-line react-hooks/exhaustive-deps
  // IMG-01: Generate on an image proposal starts the job and follows it here (generate-image.js); a failed or unknown outcome is said in
  // words and is never sent again. The same press after a reload reaches the same job.
  const [image, setImage] = useState(null), [imageCard, setImageCard] = useState(null);
  const generateImage = () => {
    if (pressed) return;
    setPressed(true); setPressedAt(new Date().toISOString()); setError(null); setImage(null);
    runImageJob({ api, proposal: p, app: p.input.app, ops, onStatus: setImage }).then(job => { if (job.cardId) { setImageCard(job.cardId); ops.locate?.(job.cardId); } }).catch(failure => {
      const why = problemOf(failure);
      if (why.kind !== 'used') setPressed(false);
      // Already made (a reload, another tab): said on the card's status line, not as a job still starting.
      setProblem(why); setImage(why.kind === 'used' ? { tone: 'failed', text: why.message, retry: false } : null); setError(why.kind === 'used' || why.kind === 'references' ? null : why.message);
      // A stale quote (the estimate, the most it can cost or the hold changed since the person confirmed): the same settings are signed again with the server's live quote,
      // the card shows the three new numbers, and the sentence stays until the person presses Generate again to confirm.
      if (failure?.data?.code === 'quote_changed') onSave({ settings: p.settings }).catch(() => {}).then(() => setError(why.message));
    });
  };
  // A reload (or switching back to this thread) finds the image job this proposal already started and shows it again, without a new
  // request: a status read first. A job still working is followed through the job API's reconnect (the same generation id answers
  // with its own job, whatever happened to the proposal since); one that ended is only shown, so a reload never places a card again.
  const resumable = cardKind === 'image' && saved && !pressed && proposalActive(p, msgs) && imageGenerationOn();
  useEffect(() => {
    if (!resumable) return undefined;
    let live = true;
    api(`/api/learn/image-jobs/${imageGenerationId(p)}`).then(({ job }) => {
      if (!live || !job) return;
      setPressed(true); setPressedAt(Number.isFinite(job.createdAt) ? new Date(job.createdAt).toISOString() : null);
      const now = imageStatus(job), ended = ['ready', 'refused', 'cancelled', 'failed', 'unknown'].includes(job.stage);
      setImage(now);
      if (job.stage === 'ready') setImageCard(job.artifact ? ops?.findCard?.(sameFileCard(job.artifact.sourceId, job.artifact.sha256))?.id ?? null : null);
      if (!ended) runImageJob({ api, proposal: p, app: p.input.app, ops, onStatus: setImage }).then(done => { if (done.cardId) setImageCard(done.cardId); }).catch(() => {});
    }, () => {});
    return () => { live = false; };
  }, [resumable, p.proposal_id]); // eslint-disable-line react-hooks/exhaustive-deps
  const onGenerate = () => {
    if (targeted) editing.clear(); // Generate spends this revision: no edit target stays on it
    if (p.command === 'generate-image') { generateImage(); return; }
    // /explain (EXP-T20): its card already waits on the canvas for this job; Generate approves the job's reviewed brief there.
    if (approvesJob(p)) {
      if (pressed || !ops.approveExplain) return;
      setPressed(true); setError(null);
      // One approve per revision (generation-review-client.js): a second press, or this card drawn again, shares the first.
      confirmProposal(p, ops.approveExplain).then(id => { if (id) ops.locate?.(id); }).catch(failure => {
        const why = problemOf(failure);
        // already made (a reload, another tab): the proposal is spent, so it is shown as made rather than pressable again
        if (why.kind !== 'used') setPressed(false);
        setProblem(why); setError(why.kind === 'references' ? null : why.message);
      });
      return;
    }
    // A simple material brief (material-brief.js): the existing generator makes its card from the signed brief, once (the server
    // consumes it; a failure gives it back, so Generate can be pressed again). busy covers the call; made only once the card is in.
    if (startAdapter(p, ops) === 'material') {
      if (pressed || making.current) return;
      making.current = true; setBusy(true); setError(null); setPressedAt(new Date().toISOString());
      ops.generateMaterial(p).then(({ blockId }) => { setPressed(true); if (blockId) { ops.locate?.(blockId); keepOutput(blockId); } })
        .catch(failure => { const why = problemOf(failure); if (why.kind === 'used') setPressed(true); setError(why.message); })
        .finally(() => { making.current = false; setBusy(false); });
      return;
    }
    const id = generateProposal(p, { inFlight: pressed, insertCard: ops.insertCard, wrap: block => withPrompt(block, p.input.request) });
    if (pressed) return; // one press in flight
    setPressed(true); setPressedAt(new Date().toISOString()); setError(null);
    if (id) { ops.locate?.(id); keepOutput(id); }
  };
  // The card this press made becomes an output of the turn that asked for it (chat-output-refs.js outputSink, as a command's cards do):
  // shown under that prompt, saved on its message so a reload finds the job again, and watched with the others (ChatOutputs
  // useGenerationWatch). A turn not saved yet keeps it until its card settles.
  const keepOutput = id => {
    if (turnAt < 0 || !ops) return;
    const here = turnAt;
    outputSink({ messageId: Promise.resolve(/^\d+$/.test(String(turn.messageId ?? '')) ? turn.messageId : null), ops,
      onOutput: kept => setMsgs(ms => ms.map((x, j) => (j === here && x.role === 'user' ? { ...x, outputs: mergeOutputs(x.outputs, [kept]) } : x))) })(id);
  };
  // The status the card draws (bug 2): the job's, never the press's. A superseded version of the proposal draws none.
  const own = madeFromVersion(card || output, p);
  const status = cardKind === 'card' ? (own ? cardStatus({ card, output: refusedCard ? null : output, pressed, loaded: ops?.workspace?.().loaded !== false, noun: 'video' }) : null)
    : cardKind === 'image' ? imageProposalStatus({ image, pressed, cardId: imageCard })
      : stopped ? { phase: 'stopped', label: null, active: false, spinner: false, detail: EXPLAIN_STOPPED, canStop: false, cardId: null } : null;
  // Cancel on an Explain brief: the waiting job's existing cancel action; the canvas card observes it again.
  const explainJob = approvesJob(p);
  const onCancel = explainJob && ops?.cancelExplain ? async () => {
    setBusy(true); setError(null);
    // A stopped brief is no longer an Edit target (the server refuses its refine), so the composer stops naming it.
    try { await ops.cancelExplain(p); setStopped(true); if (targeted) editing.clear(); } catch (failure) { setError(problemOf(failure).message); } finally { setBusy(false); }
  } : null;
  const goToCard = status?.cardId ? async () => {
    setError(null);
    const result = await openOutput(output && output.cardId === status.cardId ? output : { cardId: status.cardId }, ops);
    if (result.problem) setError(result.problem);
  } : null;
  return (
    <div className="mt-2">
      {/* A motion or image proposal draws its job's status on the card itself (status), so it no longer reads Added to the canvas. */}
      <GenerationProposalCard proposal={p} active={active} made={cardKind ? false : made} released={released} busy={busy || !saved} states={states} problem={problem?.kind === 'references' ? { message: problem.message } : null}
        {...(explainJob ? { ...jobReviewCopy(p), onCancel } : isBriefCommand(p.command) ? { eyebrow: briefHeading(p.command) } : {})}
        status={status} startedAt={output?.startedAt || pressedAt} noun={cardKind === 'image' ? 'image' : 'video'} onGoToCard={goToCard}
        onStop={status?.canStop && ops?.stopGeneration ? () => ops.stopGeneration(status.cardId) : null} onStopFailed={setError}
        onEdit={onEdit} targeted={targeted} onGenerate={onGenerate} onSave={onSave} onOpenReference={ref => chat?.openSource?.({ sourceId: ref.sourceId, kind: ref.kind, name: ref.label, version: ref.revision, range: ref.range })} />
      {error && <p role="alert" className="mt-1 text-xs text-danger">{error}</p>}
      {image?.retry && <p data-image-job-status={image.tone} className="mt-1 text-xs text-ink-2"><button type="button" data-image-retry-save onClick={() => retryImageSave(api, `img-${p.proposal_id}`).catch(() => {})} className="rounded border border-line px-2 py-0.5 text-ink hover:bg-hover">Try saving again</button></p>}
      {problem?.kind === 'invalid' && problem.errors?.length > 0 && <ul role="alert" data-proposal-save-errors className="mt-1 text-xs text-danger">{problem.errors.map((e, k) => <li key={k}>{e.message}</li>)}</ul>}
      {conflict && (
        <div role="alert" data-proposal-settings-conflict className="mt-1 flex flex-wrap items-center gap-2 text-xs text-danger">
          <span>{conflict.message}</span>
          {conflict.here && conflict.retryable && <button type="button" data-proposal-keep-mine onClick={() => onSettingsChange(conflict.draft, conflict.current)} className="rounded border border-line px-2 py-0.5 text-ink hover:bg-hover">Use mine</button>}
        </div>
      )}
      {m.meta?.proposalConflict && <p data-proposal-conflict className="mt-1 text-xs text-ink-2">{refinementConflictText(m.meta.proposalConflict)}</p>}
    </div>
  );
}

// Phase 2 proposal card: what will happen with the exact inputs; nothing runs
// until Run posts the approval. Change hands the args back to the input box.
const TOOL_LABEL = {
  run: 'Run', run_again: 'Run again', pause_schedule: 'Pause schedule',
  resume_schedule: 'Resume schedule', share: 'Share', unshare: 'Unshare',
};

function ProposalCard({ proposal, onDone, onChange }) {
  const [busy, setBusy] = useState(false);
  const approve = async () => {
    setBusy(true);
    try {
      const d = await api('/api/ask/approve', { method: 'POST', body: JSON.stringify({ proposal_id: proposal.id }) });
      // a started run becomes a live result card in the chat
      onDone(d.runId ? { runId: d.runId } : `✓ ${TOOL_LABEL[proposal.tool] || proposal.tool} executed`);
    } catch (e) {
      onDone(`✗ ${e.message}`);
    }
  };
  return (
    <div className="max-w-[440px] rounded-md border border-line p-3">
      <div className="pb-1 text-sm font-medium">{TOOL_LABEL[proposal.tool] || proposal.tool}?</div>
      <pre className="overflow-x-auto rounded-sm bg-code p-2 font-mono text-xs whitespace-pre-wrap text-ink-2">{JSON.stringify(proposal.args, null, 2)}</pre>
      <div className="flex gap-2 pt-2">
        <button
          disabled={busy}
          onClick={approve}
          className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-sm bg-primary-fill px-2.5 text-[13px] font-medium text-white hover:bg-primary-fill-hover disabled:opacity-50"
        >
          {busy && <Loader2 size={12} className="animate-spin" />} Run
        </button>
        <button
          onClick={() => onChange(`${TOOL_LABEL[proposal.tool] || proposal.tool} with ${JSON.stringify(proposal.args)} but `)}
          className="h-7 cursor-pointer rounded-sm px-2.5 text-[13px] text-ink-2 hover:bg-hover hover:text-ink"
        >
          Change
        </button>
        <button onClick={() => onDone('(proposal dismissed)')} className="h-7 cursor-pointer rounded-sm px-2.5 text-[13px] text-ink-2 hover:bg-hover hover:text-ink">
          Cancel
        </button>
      </div>
    </div>
  );
}

// After an approved run: live result right in the chat - status, log tail,
// outputs with the same inline previews as the run peek.
export function RunResultCard({ runId, app }) {
  const [meta, setMeta] = useState(null);
  const [lines, setLines] = useState([]);
  const [outs, setOuts] = useState(null);
  const cursor = useRef(-1);
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const d = await api(`/api/runs/${runId}?after=${cursor.current}`);
        if (stop) return;
        cursor.current = d.cursor;
        setMeta(d);
        if (d.lines.length) setLines((l) => [...l, ...d.lines]);
        if (d.status === 'running') setTimeout(() => !stop && tick(), 1500);
        else api(`/api/runs/${runId}/outputs`).then((o) => !stop && setOuts(o.outputs)).catch(() => setOuts([]));
      } catch { if (!stop) setTimeout(() => !stop && tick(), 3000); }
    };
    tick();
    return () => { stop = true; };
  }, [runId]);
  const runUrl = app?.name ? `/apps/${app.name}/runs/${runId}` : null;
  return (
    <div className="max-w-[520px] rounded-md border border-line p-3 text-sm">
      <div className="flex items-center gap-2 pb-1.5">
        {meta?.status === 'running' && <Loader2 size={13} className="animate-spin text-ink-3" />}
        <span className="font-medium">Run {runId.replace(/^r-/, '').slice(0, 7)}</span>
        <span className="text-ink-2">{meta?.status || 'starting'}</span>
        {runUrl && (
          <button className="ml-auto cursor-pointer text-xs text-accent hover:underline" onClick={() => window.history.pushState(null, '', runUrl) || window.dispatchEvent(new PopStateEvent('popstate'))}>
            open
          </button>
        )}
      </div>
      {lines.length > 0 && (
        <pre className="no-scrollbar max-h-40 overflow-y-auto rounded-sm bg-code p-2 font-mono text-xs whitespace-pre-wrap text-ink-2">{lines.slice(-15).join('\n')}</pre>
      )}
      {outs && outs.length > 0 && (
        <div className="pt-2">
          {outs.map((o) => <OutputRow key={o.name} runId={runId} name={o.name} size={o.size} />)}
        </div>
      )}
      {outs && !outs.length && meta?.status !== 'running' && <div className="pt-1 text-xs text-ink-3">no outputs</div>}
    </div>
  );
}

// compact copy of the run peek's output renderer (kept local - run.jsx imports us)
function OutputRow({ runId, name, size }) {
  const url = `/api/runs/${runId}/outputs/${encodeURIComponent(name)}`;
  const isImg = /\.(jpe?g|png|gif|webp)$/i.test(name) && size < 2 * 1024 * 1024;
  const isText = /\.(json|csv|txt)$/i.test(name) && size < 4096;
  const [text, setText] = useState(null);
  useEffect(() => { if (isText) fetch(url).then((r) => r.text()).then(setText).catch(() => {}); }, [url, isText]);
  return (
    <div className="pb-1.5">
      <a href={url} download={name} className="text-xs text-ink-2 hover:text-ink">{name}</a>
      {isImg && <img src={url} alt={name} className="mt-1 max-h-[180px] max-w-full rounded-sm border border-line" />}
      {isText && text != null && <pre className="no-scrollbar mt-1 max-h-32 overflow-y-auto rounded-sm bg-code p-2 font-mono text-xs whitespace-pre-wrap text-ink-2">{text}</pre>}
    </div>
  );
}

// A Learn answer that throws while drawing (a malformed record from the server or a test double) falls back to its plain
// text: main.jsx swaps the whole page for its crash screen on any uncaught error, so one answer never takes the page down.
export class AnswerBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { console.error('[chat answer]', error); reportClientError('render_failed', error, { artifact: 'chat_answer' }); }
  render() { return this.state.failed ? <div data-answer className="min-w-0 whitespace-pre-wrap text-sm">{String(this.props.text ?? '')}</div> : this.props.children; }
}

// The contract's message status (CONTRACT A2). Today's client keeps a progress stage in m.status while streaming, so
// anything else is done unless it is the reply still arriving.
const answerStatus = (m, arriving) => (['streaming', 'done', 'stopped', 'error'].includes(m.status) ? m.status : arriving ? 'streaming' : 'done');

// One message. Everything it reads from AskPanel comes in as a prop.
export function ChatMessage({ m, i, msgs, sheetMode, busy, learnChat, privateChat, fileApp, appName, onGraph, onAddToCanvas, onRegenerate = null, setMsgs, setInput, inputRef, setFilePeek, setRunPeek, threadId, prepare, insertNotebook, hasCard = null, toContents = null, outputOps = null }) {
  // Add as card: insertChat is idempotent on the card id, so a click on Added locates the card (and puts it back if the
  // learner deleted it) instead of adding a second one.
  const addAsCard = card => {
    onAddToCanvas({ ...card, question: [...msgs.slice(0, i)].reverse().find(item => item.role === 'user')?.content || '' });
    setMsgs(ms => ms.map((x, j) => (j === i ? { ...x, added: true } : x)));
  };
  // Bugs 1 and 3: a slash command's response, and one that makes something on the canvas, uses the generation and card workflow - it gets no
  // Explore next, no Add as card (the generated output is reached by its own card, Go to card) and no generic Regenerate (a command
  // turn re-sent as plain words would answer in prose, skipping the command's own confirmation). Ordinary answers keep all three.
  const kind = responseKind(m, msgs[turnIndex(msgs, i)] ?? null);
  return (
    <div key={i} className={cn('py-1.5', m.role === 'step' && 'flex justify-end', m.role === 'user' && 'flex flex-col items-end')}>
      {m.role === 'step' ? (
        // A chosen next step (sendStep): the hook the learner clicked, drawn as a choice - never as their own words.
        <div data-step-chip title="A next step you chose" className="inline-flex max-w-[85%] items-start gap-1.5 rounded-lg border border-[#b42318]/25 bg-[#b42318]/[0.04] px-3 py-1.5 text-sm text-ink">
          <CornerDownRight size={14} className="mt-0.5 shrink-0 text-[#b42318]/70" /><span className="min-w-0">{m.content}</span>
        </div>
      ) : m.role === 'user' ? (<>
        <div data-user-turn className="max-w-[85%] rounded-lg bg-hover px-3 py-1.5 text-sm">
          {m.canvasImage && <img src={m.canvasImage} alt="Canvas with the question’s target marked" className="mb-2 max-h-32 w-44 rounded border border-line bg-white object-contain" />}
          {m.passage && <blockquote className="mb-2 max-h-24 overflow-auto border-l-2 border-accent/40 pl-2 text-xs text-ink-2">{m.passage}</blockquote>}
          <SentText m={m} />
        </div>
        {/* What this prompt made on the canvas (UI changes brief 5): a thumbnail or a compact card link each. */}
        <ChatOutputs outputs={m.outputs} ops={outputOps} />
      </>) : m.role === 'proposal' ? (
        <ProposalCard
          proposal={m.proposal}
          onDone={(r) => setMsgs((ms) => ms.map((x, j) => (j === i ? (r?.runId ? { role: 'run', runId: r.runId } : { role: 'assistant', content: r }) : x)))}
          onChange={(text) => { setMsgs((ms) => ms.filter((_, j) => j !== i)); setInput(text); inputRef.current?.focus(); }}
        />
      ) : m.role === 'run' ? (
        <RunResultCard runId={m.runId} app={fileApp ? { name: fileApp } : null} />
      ) : m.content?.startsWith('✗ ') ? (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">
          <span className="min-w-0 flex-1 break-words">{m.content}</span>
          <button type="button" aria-label="Copy error" title="Copy error" onClick={() => navigator.clipboard.writeText(m.content)} className="shrink-0 rounded p-1 hover:bg-danger/10"><Copy size={14} /></button>
        </div>
      ) : m.content ? (
        <>{learnChat ? (
          // A Learn answer reads as a document at the pane's width, no colored box (owner brief section 9); the footer is
          // its one utility row (section 10). data-answer-body is what Copy puts on the clipboard as HTML.
          <AnswerBoundary key={m.messageId ?? i} text={m.content}>
          <div data-answer className="group/answer min-w-0">
            <div data-answer-body><Md doc text={m.content} onRun={id => { setFilePeek(null); setRunPeek(id); }} onFile={fileApp ? (path, line, lineEnd) => { setRunPeek(null); setFilePeek({ path, line, lineEnd }); } : null} /></div>
            {/* A Tutor syllabus (contract B6): an editable list under its answer; edits save to this message (chat-syllabus-route.js)
                once it has its server id. */}
            {m.meta?.proposal?.proposal_id && <ProposalSlot m={m} i={i} msgs={msgs} setMsgs={setMsgs} ops={outputOps} />}
            {m.kind === 'syllabus' && Array.isArray(m.meta?.syllabus?.topics) && <SyllabusMessage syllabus={m.meta.syllabus} toContents={toContents} saveSyllabus={/^\d+$/.test(String(m.messageId ?? '')) ? async topics => (await api(`/api/learn/chat/messages/${m.messageId}/syllabus`, { method: 'PUT', body: JSON.stringify({ topics }) })).syllabus : null} />}
            <AnswerFooter key={m.messageId ?? i} message={{ ...m, status: answerStatus(m, busy && i === msgs.length - 1) }} latest={!msgs.slice(i + 1).some(x => x.role === 'assistant')}
              onAddAsCard={kind.ordinary && onAddToCanvas && addAsCard} onLocateCard={kind.ordinary && onAddToCanvas && (id => addAsCard({ id, answer: m.content, sources: m.meta?.contextRefs ?? null }))} cardExists={() => !!m.added || !!hasCard?.(cardIdFor(m))}
              onRegenerate={kind.ordinary ? onRegenerate : null} onSelectAlternative={async id => { const alt = await getAnswerAlternative(id); setMsgs(ms => ms.map((x, j) => (j === i ? { ...x, ...alt, status: 'done', added: false } : x))); }} />
            {prepare && kind.ordinary && <AnswerSuggestions message={m} latest={i === msgs.length - 1} threadId={threadId} prepare={prepare} insertNotebook={insertNotebook} />}
          </div>
          </AnswerBoundary>
        ) : <Md text={m.content} onRun={id => { if (privateChat) navigate(`/apps/${encodeURIComponent(appName)}/runs/${encodeURIComponent(id)}`); else { setFilePeek(null); setRunPeek(id); } }} onFile={!privateChat && fileApp ? (path, ln, lnEnd) => { setRunPeek(null); setFilePeek({ path, line: ln, lineEnd: lnEnd }); } : null} />}
        {m.graph&&onGraph&&<div className="mt-2"><EvidencePill icon={Network} type="button" onClick={()=>onGraph(m.graph)} title={m.graph.title}>Show on graph</EvidencePill></div>}
</>
      ) : (
        <span className="flex items-center gap-2 text-xs text-ink-2"><Loader2 size={14} className="animate-spin text-ink-3" /><span className="shimmer">{waitingText(m.stage ?? m.status)}</span></span>
      )}
    </div>
  );
}

// follow: useFollowLatest's { atBottom, jump } for the scroll box this list sits in (chat-scroll.js).
// The Chat workspace (chat-workspace.jsx, contract A6) supplies the composer's prepare, regenerate, the open thread and the
// canvas operations; it is null outside a Learn canvas. Without it (the old sheet) Explore next and generation actions put
// their words in the composer through setInput - a command as its typed /line, which Send runs through the slash path -
// and Regenerate stays hidden.
export function ChatMessages({ follow = null, ...given }) {
  const chat = useChatWorkspace();
  const ops = chat?.canvasOps;
  const typeIn = given.setInput && (({ text = '', command = null }) => {
    const line = command ? `/${typedOf(command)} ${text}`.trim() : text;
    given.setInput(current => (current.trim() ? `${current}

${line}` : line));
    given.inputRef?.current?.focus();
  });
  const props = { ...given,
    prepare: chat?.composer?.prepare ?? given.prepare ?? typeIn, onRegenerate: chat?.regenerate ?? given.onRegenerate ?? null,
    threadId: chat?.thread?.id ?? given.threadId ?? null, insertNotebook: ops?.insertNotebook ?? given.insertNotebook,
    onAddToCanvas: ops ? (card => ops.insertChat(card)) : given.onAddToCanvas, hasCard: ops?.hasBlock ?? null, outputOps: ops ?? null };
  const { msgs, sheetMode, busy } = props;
  const atBottom = !follow || follow.atBottom;
  // A message that lands while the reader is scrolled up stays new until they are back at the bottom.
  const [seen, setSeen] = useState(msgs.length);
  useEffect(() => { if (atBottom) setSeen(msgs.length); }, [atBottom, msgs.length]);
  return (
    <>
      {msgs.map((m, i) => (sheetMode && m.card) ? null : <ChatMessage key={i} {...props} m={m} i={i} />)}
      {!atBottom && (busy || msgs.length > seen) && (
        <div className="pointer-events-none sticky bottom-2 z-10 flex h-0 justify-center">
          <button type="button" data-jump-latest onClick={follow.jump} className="pointer-events-auto flex h-7 -translate-y-full cursor-pointer items-center gap-1.5 rounded-full border border-line bg-white px-3 text-xs text-ink-2 shadow-pop hover:text-ink"><ArrowDown size={13} />Jump to latest</button>
        </div>
      )}
    </>
  );
}

// A sent message's command (UI-16, owner 2026-10-21): the composer's pill, read-only (no x, no action), inline before the
// words as typed. Display only: the stored text and command are never rewritten.
function SentText({ m }) {
  const { command, text } = sentCommand(m);
  if (!command) return m.content;
  return <span className="whitespace-pre-wrap break-words"><CommandPill name={command} className="mr-1.5 h-5 rounded-md px-1.5 align-[-3px] text-xs" />{text}</span>;
}
