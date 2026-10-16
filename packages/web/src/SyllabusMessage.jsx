// A Tutor answer's syllabus (chat-workspace-CONTRACT.md B6): an editable, ordered list of topics with their learning
// objectives and the attached materials each draws on. Edits stay local until Save, which hands the whole list to
// saveSyllabus(topics) (PUT /api/learn/chat/messages/:id/syllabus, chat-syllabus-route.js); the server validates it as the
// journey path shape and answers the saved syllabus. Without saveSyllabus the list is read-only. Nothing here generates
// a lesson.
// Use as table of contents (R4 owner decision 5B, contract C8): toContents { outline(), propose(proposal) } is the page's
// existing Apply/Discard flow. The button proposes this syllabus, as saved, against the contents as they are now; the
// learner reviews and applies it there, and this message stays a historical proposal.
import { useState } from 'react';
import { ArrowDown, ArrowUp, Check, ListTree, Loader2, Plus, Trash2 } from 'lucide-react';
import { syllabusProposal } from './syllabus-outline.js';

const ICON = 'shrink-0 rounded p-1 text-ink-3 hover:bg-hover hover:text-ink disabled:opacity-40';
const PILL = 'inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs text-ink-2 hover:bg-hover disabled:opacity-50';
// Server limits (web/src/learn-journey.js validatePath): a title is 1-80 characters, objectives together at most 240.
const TITLE_MAX = 80, OBJECTIVES_MAX = 240, TOPICS_MAX = 12;
// ponytail: Apply takes at most 24 ops until the PANEL lane lifts syllabus proposals to 96 (lead ruling, C8 size A).
const APPLY_MAX = 24;
const lines = text => text.split('\n').map(l => l.trim()).filter(Boolean);

export default function SyllabusMessage({ syllabus, saveSyllabus = null, toContents = null }) {
  const [topics, setTopics] = useState(() => syllabus.topics.map(t => ({ ...t, objectivesText: t.objectives.join('\n') })));
  const [dirty, setDirty] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState(null);
  const [adopted, setAdopted] = useState(null);
  const useAsContents = () => {
    const proposal = syllabusProposal({ ...syllabus, topics: topics.map(({ objectivesText, ...t }) => t) }, toContents.outline());
    if (!proposal.ops.length) setAdopted('Already in the table of contents.');
    else if (proposal.ops.length > APPLY_MAX) setAdopted(`Too many headings to add at once (${proposal.ops.length}; at most ${APPLY_MAX}).`);
    else { toContents.propose(proposal); setAdopted('Proposed in Table of contents: review it there, then Apply or Discard.'); }
  };
  const editable = !!saveSyllabus;
  const change = next => { setTopics(next); setDirty(true); setError(null); setAdopted(null); };
  const edit = (i, patch) => change(topics.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const move = (i, by) => { const next = [...topics]; [next[i], next[i + by]] = [next[i + by], next[i]]; change(next); };
  // A new topic's id is unique within the list; the server keeps ids as given.
  const add = () => change([...topics, { id: `n${Date.now().toString(36)}`, title: '', objectives: [], objectivesText: '', refs: [] }]);
  const save = async () => {
    setSaving(true); setError(null);
    try {
      const saved = await saveSyllabus(topics.map(({ objectivesText, ...t }) => ({ ...t, title: t.title.trim(), objectives: lines(objectivesText), refs: t.refs.map(r => r.sourceId) })));
      if (saved?.topics) setTopics(saved.topics.map(t => ({ ...t, objectivesText: t.objectives.join('\n') })));
      setDirty(false);
    } catch (e) { setError(e?.message || 'Could not save the syllabus'); }
    finally { setSaving(false); }
  };
  return (
    <div data-syllabus className="mt-2 rounded-lg border border-line px-3 py-2 text-sm">
      {syllabus.goal && <p className="mb-2 text-xs text-ink-2">Goal: {syllabus.goal}</p>}
      <ol className="flex flex-col gap-2">
        {topics.map((t, i) => (
          <li key={t.id} data-syllabus-topic={t.id} className="flex gap-2">
            <span className="w-5 shrink-0 pt-1 text-right text-xs text-ink-3">{i + 1}.</span>
            <div className="min-w-0 flex-1">
              {editable ? <>
                <input aria-label={`Topic ${i + 1} title`} value={t.title} maxLength={TITLE_MAX} onChange={e => edit(i, { title: e.target.value })}
                  className="w-full rounded border border-transparent bg-white px-1 font-medium text-ink hover:border-line focus:border-line focus:outline-none" />
                {t.description && <p data-syllabus-description className="px-1 text-xs text-ink-2">{t.description}</p>}
                <textarea aria-label={`Topic ${i + 1} objectives, one per line`} value={t.objectivesText} rows={Math.max(1, lines(t.objectivesText).length)}
                  maxLength={OBJECTIVES_MAX} onChange={e => edit(i, { objectivesText: e.target.value })}
                  className="w-full resize-none rounded border border-transparent bg-white px-1 text-xs text-ink-2 hover:border-line focus:border-line focus:outline-none" />
              </> : <>
                <p className="font-medium text-ink">{t.title}</p>
                {t.description && <p data-syllabus-description className="text-xs text-ink-2">{t.description}</p>}
                <ul className="list-disc pl-4 text-xs text-ink-2">{t.objectives.map((o, k) => <li key={k}>{o}</li>)}</ul>
              </>}
              {/* A topic's subtopics (contract C9) are shown, not edited here: the table of contents edits them once adopted. */}
              {t.subtopics?.length > 0 && <ol className="mt-1 flex flex-col gap-0.5 pl-1">
                {t.subtopics.map((u, k) => (
                  <li key={u.id} data-syllabus-subtopic={u.id} className="flex gap-1.5 text-xs">
                    <span className="shrink-0 tabular-nums text-ink-3">{i + 1}.{k + 1}</span>
                    <span className="min-w-0"><span className="text-ink">{u.title}</span>{u.description && <span className="block text-ink-2">{u.description}</span>}</span>
                  </li>
                ))}
              </ol>}
              {t.refs.length > 0 && <p className="px-1 text-xs text-ink-3">From: {t.refs.map(r => r.name).join(', ')}</p>}
            </div>
            {editable && <div className="flex shrink-0 items-start">
              <button type="button" aria-label={`Move topic ${i + 1} up`} title="Move up" disabled={i === 0} onClick={() => move(i, -1)} className={ICON}><ArrowUp size={14} /></button>
              <button type="button" aria-label={`Move topic ${i + 1} down`} title="Move down" disabled={i === topics.length - 1} onClick={() => move(i, 1)} className={ICON}><ArrowDown size={14} /></button>
              <button type="button" aria-label={`Remove topic ${i + 1}`} title="Remove topic" disabled={topics.length === 1} onClick={() => change(topics.filter((_, j) => j !== i))} className={ICON}><Trash2 size={14} /></button>
            </div>}
          </li>
        ))}
      </ol>
      {(editable || toContents) && <div className="mt-2 flex flex-wrap items-center gap-2">
        {editable && <>
        <button type="button" data-syllabus-add disabled={topics.length >= TOPICS_MAX} onClick={add} className={PILL}><Plus size={14} />Add topic</button>
        <button type="button" data-syllabus-save disabled={!dirty || saving} onClick={save} className={PILL}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}{dirty ? 'Save syllabus' : 'Saved'}
        </button>
        </>}
        {toContents && <button type="button" data-syllabus-contents disabled={dirty} title={dirty ? 'Save the syllabus first' : undefined}
          onClick={useAsContents} className={PILL}><ListTree size={14} />Use as table of contents</button>}
        {error && <span role="alert" className="text-xs text-red-700">{error}</span>}
        {adopted && <span role="status" data-syllabus-contents-status className="text-xs text-ink-2">{adopted}</span>}
      </div>}
    </div>
  );
}
