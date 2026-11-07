// The Tutor's Chat entries (BRIEF contract 6; checklist UI.01/UI.03/UI.08): one logical, persisted message per stable client_id, derived
// purely from the polled server view, so a poll or a reload yields the same entries under the same ids and never a duplicate. Each entry is
// saved (chat-persist.js saveTutorEntry) in the roadmap's bound thread with a versioned private record (tutor: { v: 1, kind, seq, ids });
// seq grows with the entry's stage, so the server updates it in place and never regresses it. Actions are resolved against the live state
// at render time (RoadmapTranscript.jsx): a stored entry with no live counterpart keeps its labels, disabled, and can never replay an action.
import { acceptedPlanOf, canProposeNext, chatOf, draftOf, offerOf } from './roadmap-client.js';
import { isUnfinishedRoadmap } from './roadmap-contract.js';
import { STRINGS } from './roadmap-strings.js';

// The client_id the invitation is saved under: one per invitation, so a retried save writes it once (canvases.js saveChatMessage).
export const invitationClientId = invitationId => `roadmap-inv-${String(invitationId).replace(/[^A-Za-z0-9_-]/g, '-')}`.slice(0, 80);
// The client_id of the opening line of a fresh Tutor thread (none bound, or the bound one was deleted): one per roadmap and thread.
export const roadmapThreadClientId = roadmapId => `roadmap-thread-${String(roadmapId).replace(/[^A-Za-z0-9_-]/g, '-')}`.slice(0, 80);
// The invitation's Tutor thread id, derived from the invitation, so every device saves its sentence into the SAME thread (a second device never
// makes its own). A Chat thread id is 'canvaschat-' and a UUID-shaped string (canvases.js CHAT_ID).
export async function invitationThreadId(invitationId) {
  const hex = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`roadmap-invitation:${invitationId}`)))].map(b => b.toString(16).padStart(2, '0')).join('');
  return `canvaschat-${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
// Which thread to record for a roadmap that has none: the one this browser bound before the server kept it (Fix B's local shortcut), else the open
// thread when it holds THIS roadmap's invitation (never an older roadmap's), else null.
export const threadCandidate = ({ legacy = null, openId = null, msgs = [], invitationId = null } = {}) => legacy || (invitationId && openId && msgs.some(m => m.clientId === invitationClientId(invitationId)) ? openId : null);

// Records the Tutor thread of a roadmap that has none bound, SILENTLY: it never opens a thread (only an invitation opens Chat, Fix B), so the learner's
// Chat never jumps. Nothing for an ended or completed roadmap. Tries the candidate, then the invitation's derived thread; if neither is a saved
// thread, makes ONE fresh thread per roadmap per browser session (session remembers it, so a failing bind or a reload never makes another).
// deps: { session: {get(key), set(key, value)}, newId(), saveFresh(threadId) (saves its opening line), bindThread(threadId) (rejects when refused) }.
// -> 'skipped' | 'bound' | 'fresh' | 'kept' (the session's fresh thread was bound again, or nothing more is tried).
export async function ensureTutorThread(rm, { legacy = null, openId = null, msgs = [] } = {}, { session, newId, saveFresh, bindThread }) {
  if (!rm || rm.threadId || ['ended', 'completed'].includes(rm.state)) return 'skipped';
  const tries = [threadCandidate({ legacy, openId, msgs, invitationId: rm.invitationId }), rm.invitationId ? await invitationThreadId(rm.invitationId) : null];
  for (const id of new Set(tries.filter(Boolean))) { try { await bindThread(id); return 'bound'; } catch { /* not a saved thread of this canvas: the next */ } }
  const key = `rh.roadmap.fresh.${rm.id}`, made = session.get(key);
  if (made) { await bindThread(made).catch(() => {}); return 'kept'; }
  const threadId = newId();
  session.set(key, threadId); // before the save: whatever happens next, this session makes no second thread for this roadmap
  await saveFresh(threadId);
  await bindThread(threadId);
  return 'fresh';
}

// Markdown-escaped filename: a file called *notes*.md shows as itself, never as emphasis.
export const mdName = name => String(name || '').replace(/[\\`*_[\]#<>|~]/g, ch => `\\${ch}`);
const cid = text => String(text).replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 80);
export const routeClientId = invitationId => cid(`roadmap-route-${invitationId}`);
export const draftClientId = (roadmapId, version) => cid(`roadmap-draft-${roadmapId}-v${version}`);
export const acceptedClientId = (roadmapId, version) => cid(`roadmap-accepted-${roadmapId}-v${version}`);
export const stepClientId = stepId => cid(`roadmap-step-${stepId}`);
export const doneClientId = roadmapId => cid(`roadmap-done-${roadmapId}`);
export const boundaryClientId = sourceKey => cid(`roadmap-boundary-${sourceKey}`);

// A step's one lifecycle stage (contracts.md steps[].stage, else derived from the view the same way); `accepting` is the client's own
// in-flight acceptance, as the contract says.
const RANK = { proposed: 1, accepting: 2, generating: 3, checking: 4, saving: 5, ready: 9, failed: 9, skipped: 9, cancelled: 9 };
export function stepStage(state, step) {
  const view = state.view, offer = view.proposal?.stepId === step.id ? view.proposal : null;
  if (offer && state.busy.includes(`accept:${offer.id}:${offer.version}`)) return 'accepting';
  if (step.stage && step.stage !== 'planned') return step.stage;
  const r = (view.results || []).filter(x => x.stepId === step.id).at(-1);
  if (r) return r.stage || (r.failure ? 'failed' : r.delivery === 'delivered' || r.delivery === 'removed' ? 'ready' : r.held ? 'checking' : r.generation === 'generated' ? 'saving' : 'generating');
  if (offer && ['pending', 'checking', 'held'].includes(offer.state)) return 'proposed';
  return { cancelled: 'cancelled', skipped: 'skipped', incomplete: 'skipped', delivered: 'ready' }[step.state] || null;
}
const formatName = format => STRINGS.formatName[format] || format || '';
const act = (id, label, run, extra = {}) => ({ id, label, run: { kind: id, ...run }, ...extra });

// -> [{ clientId, kind, seq, content, tutor, actions, draft?, activity? }] for the current state. ctx: invitation (invitationOf); route
// ({ invitationId, choice? }: the occupied-Chat choice, shown before the invitation until a destination wins); boundary ({ key, name }: a
// source dropped during an unfinished roadmap). Every action here is explicit, so none is gated by Ask or Auto-suggest off.
export function entriesOf(state, { invitation = null, route = null, boundary = null } = {}) {
  const out = [], view = state.view, rm = view?.roadmap;
  const push = (clientId, kind, seq, content, tutor = {}, actions = [], extra = {}) => out.push({ clientId, kind, seq, content, tutor: { v: 1, kind, seq, ...tutor, ...(actions.length ? { actions: actions.map(a => a.id) } : {}) }, actions, ...extra });
  const routed = invitation && route?.invitationId === invitation.id;
  if (routed) {
    push(routeClientId(invitation.id), 'route', route.choice ? 2 : 1, STRINGS.routeChoice(mdName(invitation.title)), { invitationId: invitation.id, ...(route.choice ? { choice: route.choice } : {}) },
      [act('route_new', STRINGS.startNewChat, {}, { disabled: !!route.choice, primary: true }), act('route_stay', STRINGS.stayHere, {}, { disabled: !!route.choice })]);
  }
  if (invitation && (!routed || route.choice)) {
    const busy = state.busy.some(g => g.startsWith(`create:${invitation.id}`) || g === `dismiss:${invitation.id}`);
    push(invitationClientId(invitation.id), 'invitation', 1, STRINGS.inviteDrop(mdName(invitation.title)), { invitationId: invitation.id },
      [act('explain_on_canvas', STRINGS.explain, {}, { disabled: busy, primary: true }), act('keep_here', STRINGS.keepHere, {}, { disabled: busy })]);
  }
  if (boundary) push(boundaryClientId(boundary.key), 'boundary', 1, STRINGS.boundary(mdName(boundary.name)), { sourceKey: boundary.key });
  if (!view) return out;
  const name = rm.scope?.source?.name || '', rid = rm.id;
  // Planning, then the draft with its parameters, in ONE entry per draft revision (UI.03); a newer revision is a new entry and the older one
  // stays as history (its actions resolve stale at render).
  const draft = draftOf(view), pending = view.revisionPending === true || rm.state === 'draft';
  if (pending) push(draftClientId(rid, (draft?.version ?? rm.planVersion ?? 0) + 1), 'draft', 1, STRINGS.generatingRoadmap, { roadmapId: rid, stage: 'generating' }, [], { activity: STRINGS.generatingRoadmap });
  else if (draft && ['questioning', 'proposed', 'active', 'paused', 'completed'].includes(rm.state)) {
    const steps = draft.steps || [], depth = draft.settings?.depth || rm.depth;
    const content = [STRINGS.roadmapPrepared(mdName(name)), `**${STRINGS.roadmapDraft}**`, steps.map((s, i) => `${i + 1}. **${s.title}**${s.goal ? ` — ${s.goal}` : ''}${s.format ? ` (${formatName(s.format)})` : ''}`).join('\n')].filter(Boolean).join('\n\n');
    const acceptBusy = state.busy.includes(`plan:${rid}:${draft.version}`);
    push(draftClientId(rid, draft.version), 'draft', 2, content, { roadmapId: rid, planVersion: draft.version, stage: 'draft' },
      [act('accept_roadmap', acceptBusy ? STRINGS.accepting : STRINGS.acceptRoadmap, { planVersion: draft.version }, { disabled: acceptBusy || draft.acceptable === false, primary: true, green: true }), act('edit_roadmap', STRINGS.editRoadmap, { planVersion: draft.version })],
      { draft: { version: draft.version, outcome: draft.outcome, steps, depth, practiceMode: rm.practiceMode || 'explanations', scope: rm.scope, sourceName: name } });
  }
  for (const line of chatOf(state)) {
    if (line.kind === 'question') push(cid(`roadmap-question-${line.id}`), 'question', 1, `${line.label}\n\n${line.text}`, { roadmapId: rid, questionId: line.id }, line.options.map(o => act('answer', o.label, { optionId: o.id }, { key: o.id })));
    else if (line.kind === 'limitation') push(cid(`roadmap-limit-${rid}-${rm.planVersion}`), 'limitation', 1, line.text, { roadmapId: rid }, line.offers.map(o => act('edit_roadmap', o.label, {}, { key: o.kind })));
  }
  // The accepted roadmap's summary: navigation, edit (a new future draft), Propose next step when no offer, End roadmap (UI.02/UI.03/UI.08).
  const accepted = acceptedPlanOf(view);
  if (accepted && rm.acceptedPlanVersion != null) {
    const first = (accepted.steps || view.steps || [])[0]?.title || '';
    const open = isUnfinishedRoadmap(rm.state);
    push(acceptedClientId(rid, rm.acceptedPlanVersion), 'accepted', 1, STRINGS.roadmapReady(first), { roadmapId: rid, planVersion: rm.acceptedPlanVersion }, [
      act('open_toc', STRINGS.openToc, {}, { blue: true }),
      ...(open ? [act('edit_roadmap', STRINGS.editRoadmap, {}, { disabled: pending })] : []),
      ...(open && canProposeNext(state) && !offerOf(state) ? [act('propose_next', STRINGS.proposeNext)] : []),
      ...(open ? [act('end', STRINGS.end)] : []),
    ]);
  }
  // One lifecycle entry per card (UI.04/UI.08): proposed -> accepting -> generating -> checking -> saving -> ready / failed / skipped / cancelled.
  const offer = offerOf(state);
  let earlier = false;
  for (const step of view.steps || []) {
    const stage = stepStage(state, step);
    if (!stage) continue;
    const isOffer = offer?.stepId === step.id, r = (view.results || []).filter(x => x.stepId === step.id).at(-1);
    const title = (isOffer && offer.title) || r?.title || step.title, description = (isOffer && offer.description) || step.goal || '';
    const version = isOffer ? offer.version : r?.proposalVersion || 1;
    const cardId = r?.delivery === 'delivered' ? r.slot?.cardId || null : null;
    const status = stage === 'failed' ? r?.failure?.message || STRINGS.failed : STRINGS.stage[stage];
    const format = formatName(step.format || (isOffer && offer.format));
    const actions = [];
    if (stage === 'proposed' || stage === 'accepting') {
      actions.push(act('accept', earlier ? STRINGS.nextCard : STRINGS.accept, { proposalId: offer?.proposalId, version }, { disabled: !isOffer || !offer.accept, primary: true, green: true }));
      if (offer?.canEdit) actions.push(act('edit_card', STRINGS.editCard, {}, { disabled: !isOffer || stage === 'accepting' }));
      actions.push(act('cancel', STRINGS.cancel, { proposalId: offer?.proposalId, version }, { disabled: !isOffer || stage === 'accepting' }));
      actions.push(act('go_card', STRINGS.goToCard, { stepId: step.id }));
    } else if (stage === 'ready' && cardId) actions.push(act('go_card', STRINGS.goToCard, { cardId }));
    if (['proposed', 'accepting', 'generating', 'checking', 'saving', 'ready'].includes(stage) && step.sourceRef) actions.push(act('go_text', STRINGS.goToText, { stepId: step.id }));
    push(stepClientId(step.id), 'step', RANK[stage] * 20 + Math.min(version, 19), [`**${title}**`, description, [format, status].filter(Boolean).join(' · ')].filter(Boolean).join('\n\n'),
      { roadmapId: rid, stepId: step.id, proposalId: isOffer ? offer.proposalId : null, proposalVersion: version, stage, ...(cardId ? { cardId } : {}) }, actions,
      { activity: ['accepting', 'generating', 'checking', 'saving'].includes(stage) ? status : null });
    earlier = true;
  }
  if (rm.state === 'completed') push(doneClientId(rid), 'done', 1, STRINGS.completed, { roadmapId: rid, state: 'completed' });
  if (rm.state === 'ended') push(doneClientId(rid), 'done', 1, STRINGS.ended, { roadmapId: rid, state: 'ended' });
  return out;
}

// A stored entry's action ids as their labels, for history (always disabled: a stored entry with no live counterpart never acts).
const LABELS = { route_new: STRINGS.startNewChat, route_stay: STRINGS.stayHere, explain_on_canvas: STRINGS.explain, keep_here: STRINGS.keepHere, accept_roadmap: STRINGS.acceptRoadmap,
  edit_roadmap: STRINGS.editRoadmap, open_toc: STRINGS.openToc, propose_next: STRINGS.proposeNext, end: STRINGS.end, accept: STRINGS.accept, edit_card: STRINGS.editCard, cancel: STRINGS.cancel,
  go_card: STRINGS.goToCard, go_text: STRINGS.goToText };
export const historyActions = tutor => [...new Set(tutor?.actions || [])].filter(id => LABELS[id] && !['open_toc', 'go_card', 'go_text'].includes(id)).map(id => ({ id, label: LABELS[id], run: { kind: id }, disabled: true }));

// Edit roadmap (UI.03): the composer's existing edit-target pill (chat-workspace.jsx editing, ContextChips EditTargetPill) aimed at this roadmap
// draft. The unsent draft is stashed on the target and the composer is cleared for the requested change; removing the pill or sending the
// change gives the stashed draft back (restoredDraft). Attachments are never touched. Never a second composer.
export const roadmapEditTarget = ({ roadmapId, planVersion, threadId = null, canvas = null, draft = null }) => ({ command: 'roadmap', proposalId: roadmapId, version: planVersion ?? null,
  messageId: draftClientId(roadmapId, planVersion ?? 0), threadId, canvas, title: STRINGS.roadmapMode, stash: { text: draft?.text || '', command: draft?.command || null } });
export const restoredDraft = target => (target?.stash ? { text: target.stash.text, command: target.stash.command } : null);

// What to save now: entries whose (seq, content) differ from what this tab last saved, so a poll that changed nothing writes nothing.
export const toSave = (entries, saved) => entries.filter(e => saved.get(e.clientId) !== `${e.seq}|${e.content}`);
// The Chat is occupied for a new drop (UI.01): messages, a nonempty unsent draft (text or command), or a conversation still loading or
// failed to load (never mistaken for an empty one).
export const occupied = ({ status, messages = [], draft = null }) => status !== 'ready' || messages.length > 0 || !!(draft?.text?.trim() || draft?.command);
