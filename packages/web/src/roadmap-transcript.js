// The Tutor's Chat entries (BRIEF contract 6; checklist UI.01/UI.03/UI.08): one logical, persisted message per stable client_id, derived
// purely from the polled server view, so a poll or a reload yields the same entries under the same ids and never a duplicate. Each entry is
// saved (chat-persist.js saveTutorEntry) in the roadmap's bound thread with a versioned private record (tutor: { v: 1, kind, seq, ids });
// seq grows with the entry's stage, so the server updates it in place and never regresses it. Actions are resolved against the live state
// at render time (RoadmapTranscript.jsx): a stored entry with no live counterpart keeps its labels, disabled, and can never replay an action.
import { acceptedPlanOf, canStartCourse, chatOf, draftOf } from './roadmap-client.js';
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
// The occupied-Chat route record rebuilt from the thread's saved route message, for a browser that no longer holds its own record (reload on another device, cleared
// storage): { threadId, choice? } or null. A decided 'new' is not rebuilt (its invitation went to another thread, which carries its own entry).
export function routeFromSaved(msgs, invitationId, threadId) {
  const found = threadId && (msgs || []).find(m => m?.meta?.tutor?.kind === 'route' && m.meta.tutor.invitationId === invitationId);
  if (!found || found.meta.tutor.choice === 'new') return null;
  return { threadId, ...(found.meta.tutor.choice ? { choice: found.meta.tutor.choice } : {}) };
}
export const draftClientId = (roadmapId, version) => cid(`roadmap-draft-${roadmapId}-v${version}`);
export const acceptedClientId = (roadmapId, version) => cid(`roadmap-accepted-${roadmapId}-v${version}`);
export const doneClientId = roadmapId => cid(`roadmap-done-${roadmapId}`);
export const boundaryClientId = sourceKey => cid(`roadmap-boundary-${sourceKey}`);

const formatName = format => STRINGS.formatName[format] || format || '';
const act = (id, label, run, extra = {}) => ({ id, label, run: { kind: id, ...run }, ...extra });

// The invitation the current roadmap was made from: { invitationId, first } (first: its FIRST draft is still being written), else null. The invitation message
// shows the one Generating roadmap shimmer in place of its buttons while first, no buttons once its roadmap exists, and the draft entry draws nothing of
// its own until the draft arrives.
export function roadmapInvitationOf(state) {
  const view = state.view, rm = view?.roadmap;
  return rm?.invitationId ? { invitationId: rm.invitationId, first: rm.state === 'draft' && view.planDraft == null && view.acceptedPlan == null } : null;
}
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
      [act('explain_on_canvas', STRINGS.explain, {}, { disabled: busy, primary: true }), act('keep_here', STRINGS.keepHere, {}, { disabled: busy })], { creating: busy });
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
    const content = [STRINGS.roadmapPrepared(mdName(name)), `**${STRINGS.roadmapDraft}**`, steps.map((s, i) => `${i && s.section === steps[i - 1].section ? '' : s.section ? `\n**${s.section}**\n\n` : ''}${i + 1}. **${s.title}**${s.goal ? ` — ${s.goal}` : ''}${s.format ? ` (${formatName(s.format)})` : ''}`).join('\n')].filter(Boolean).join('\n\n');
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
    const open = isUnfinishedRoadmap(rm.state);
    push(acceptedClientId(rid, rm.acceptedPlanVersion), 'accepted', 1, STRINGS.roadmapReady(), { roadmapId: rid, planVersion: rm.acceptedPlanVersion }, [
      ...(open && canStartCourse(state) ? [act('generate_course', STRINGS.generateCourse, {}, { primary: true, green: true })] : []),
      act('open_toc', STRINGS.openToc, {}, { blue: true }),
      ...(open ? [act('edit_roadmap', STRINGS.editRoadmap, {}, { disabled: pending })] : []),
      ...(open ? [act('end', STRINGS.end)] : []),
    ]);
  }
  // No per-card entries (owner 2026-11-14): a course makes every card from one Generate course; its progress is the overlay on the canvas and each row's status in the table of contents.
  if (rm.state === 'completed') push(doneClientId(rid), 'done', 1, STRINGS.completed, { roadmapId: rid, state: 'completed' });
  if (rm.state === 'ended') push(doneClientId(rid), 'done', 1, STRINGS.ended, { roadmapId: rid, state: 'ended' });
  return out;
}

// A decided entry keeps no button: its outcome is one quiet line (null: none needed, the entry's own words and stage already say it). A live entry keeps its
// buttons; a stored one (history) never has any. choice: the routing entry's stored choice; acceptedPlanVersion: the roadmap's accepted draft version.
export function outcomeOf(entry, { live = true, acceptedPlanVersion = null } = {}) {
  const tutor = entry.tutor || {};
  if (entry.kind === 'recovery' && !live) return STRINGS.recoveryDone;
  if (entry.kind === 'route' && tutor.choice) return tutor.choice === 'new' ? STRINGS.routedNew : STRINGS.routedStay;
  if (entry.kind === 'draft' && !live && tutor.planVersion != null && tutor.stage !== 'generating') return acceptedPlanVersion != null && Number(tutor.planVersion) === Number(acceptedPlanVersion) ? STRINGS.draftAccepted : STRINGS.draftReplaced;
  return null;
}
// A stored entry's action ids as their labels, for history (always disabled: a stored entry with no live counterpart never acts).
const LABELS = { route_new: STRINGS.startNewChat, route_stay: STRINGS.stayHere, explain_on_canvas: STRINGS.explain, keep_here: STRINGS.keepHere, accept_roadmap: STRINGS.acceptRoadmap,
  edit_roadmap: STRINGS.editRoadmap, open_toc: STRINGS.openToc, generate_course: STRINGS.generateCourse, end: STRINGS.end };
export const historyActions = tutor => [...new Set(tutor?.actions || [])].filter(id => LABELS[id] && !['open_toc'].includes(id)).map(id => ({ id, label: LABELS[id], run: { kind: id }, disabled: true }));

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
