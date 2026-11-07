import { useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';
import DepthMenu from './DepthMenu.jsx';
import { EvidencePill } from './Md.jsx';
import { ProposalTools, StepPill } from './NextStepPill.jsx';
import { STRINGS } from './roadmap-strings.js';
import { ChatMessage } from './ChatMessages.jsx';
import { ChatOutputs } from './ChatOutputs.jsx';
import { PRIMARY, SECONDARY, ghost } from './RoadmapInvitation.jsx';
import { newThreadId, saveMessage } from './chat-persist.js';
import { invitationClientId, transcriptOf } from './roadmap-transcript.js';

// Fix B (T4): the roadmap inside the Chat transcript, after the thread's own messages (ask.jsx). Each item is the existing
// ChatMessage (text, its waiting row, its error row) or ChatOutputs (Go to card); choices use the roadmap's own buttons.
// roadmap: useRoadmap; chat: the Chat workspace; msgs: the open thread's messages.
const BOUND = canvas => `rh.roadmap.thread.${canvas}`;
const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, value); } catch { /* private mode: the thread still opens */ } };
const ATTR = { explain_on_canvas: 'data-roadmap-explain', keep_here: 'data-roadmap-keep', answer: 'data-roadmap-option', part: 'data-roadmap-choice', offer: 'data-roadmap-offer' };

export default function RoadmapTranscript({ roadmap, chat, msgs }) {
  const c = roadmap.controller, iv = roadmap.invitation, thread = chat.thread;
  // T5: Explain on canvas asks for this source's Depth first, seeded from the composer's; the choice is this roadmap's only (DepthMenu
  // gets a local settings object, so the canvas setting is never written). Planning starts on Start planning.
  const [choosing, setChoosing] = useState(null), [depth, setDepth] = useState(null);
  const seed = chat.settings?.depth || 'standard';
  // One new Tutor thread per invitation (owner plan 5.1): the invitation is saved as its first message through the existing
  // chat-persist path, so the thread exists on the server, survives a reload and becomes this canvas's open one. The previous
  // thread keeps its messages and draft (open() saves the draft first). Chat opens once, here: invitationOf already waited for
  // the learner to stop typing and for any answer to finish.
  useEffect(() => {
    if (!iv || thread.status !== 'ready') return;
    const done = `rh.roadmap.invited.${iv.id}`;
    if (read(done)) return;
    write(done, '1');
    const threadId = newThreadId();
    saveMessage({ threadId, app: chat.canvas, client_id: invitationClientId(iv.id), role: 'assistant', content: iv.text, mode: thread.mode, title: iv.text })
      .then(() => { write(BOUND(chat.canvas), threadId); return thread.open(threadId); })
      .then(() => chat.panels.openChat(), () => chat.panels.openChat()); // a failed save still shows the invitation, in the thread already open
  }, [iv?.id, thread.status]); // eslint-disable-line react-hooks/exhaustive-deps
  // shortcut: the Tutor thread is remembered per browser; another device shows the roadmap in its open thread. Upgrade: store the thread id on the roadmap.
  const bound = read(BOUND(chat.canvas));
  if (bound && thread.id && thread.id !== bound) return null;
  const items = transcriptOf(roadmap.state, { invitation: iv, saved: !!iv && msgs.some(m => m.clientId === invitationClientId(iv.id)), choosing: !!iv && choosing === iv.id });
  const local = { depth: depth || seed, set: next => setDepth(next.depth), status: 'ready', saveStatus: 'ready', retry() {} };
  const planning = !!iv && roadmap.state.busy.includes(`create:${iv.id}`);
  if (!items.length) return null;
  const run = action => {
    const r = action.run;
    if (r.kind === 'explain_on_canvas') { setChoosing(iv.id); setDepth(null); }
    else if (r.kind === 'keep_here') c.dismiss();
    else if (r.kind === 'answer') c.answer({ optionId: r.optionId });
    else if (r.kind === 'part') c.explainPart(r.choice);
    else if (r.kind === 'offer') roadmap.editPlan();
  };
  return (
    <div data-roadmap-chat>
      {items.map(item => (
        <div key={item.key} data-roadmap-item={item.key} {...(item.key.startsWith('invitation:') ? { 'data-roadmap-invitation': iv.id } : {})}>
          {item.m && <ChatMessage m={item.m} i={0} msgs={[item.m]} learnChat busy={false} setMsgs={() => {}} setFilePeek={() => {}} setRunPeek={() => {}} outputOps={chat.canvasOps ?? null} />}
          {item.actions && (
            <div className="flex flex-wrap gap-1.5 pb-1.5">
              {item.actions.map(action => {
                const attr = ATTR[action.run.kind];
                return <button key={action.id} type="button" {...{ [attr]: attr === ATTR.explain_on_canvas || attr === ATTR.keep_here ? true : action.id }} onClick={() => run(action)}
                  className={action.run.kind === 'explain_on_canvas' ? PRIMARY : action.run.kind === 'keep_here' ? SECONDARY : ghost}>{action.label}</button>;
              })}
            </div>
          )}
          {item.review && <div className="py-1.5"><EvidencePill icon={BookOpen} type="button" data-roadmap-review onClick={() => { chat.panels.setTab('toc'); chat.panels.setOpen(true); }}>{item.review}</EvidencePill></div>}
          {item.depth && (
            <div data-roadmap-depth className="flex flex-wrap items-center gap-1.5 pb-1.5">
              <DepthMenu settings={local} disabled={planning} />
              <button type="button" data-roadmap-start disabled={planning} onClick={() => c.explain({ depth: local.depth, instruction: '' })} className={PRIMARY}>{STRINGS.startPlanning}</button>
            </div>
          )}
          {/* T8: Edit is the existing R5 Edit (ProposalTools, closed), only when the server says editing is on (view.edit: ROADMAP_EDIT_ENABLED); it opens the same
              editor as Ctrl/Cmd+K on the canvas (the proposal overlay), never a second one. */}
          {item.pill && <div className="flex flex-wrap items-center gap-1.5 pb-1.5"><StepPill pill={item.pill} tabHint={false} onAccept={() => c.acceptProposal()} onCancel={() => c.cancelProposal()} />
            {item.pill.canEdit && <ProposalTools pill={item.pill} edit={{ open: false, onOpen: () => c.openEditor() }} />}</div>}
          {item.outputs && <ChatOutputs outputs={item.outputs} ops={chat.canvasOps ?? null} />}
        </div>
      ))}
    </div>
  );
}
