// A Tutor answer's syllabus (chat-workspace-CONTRACT.md B6): an editable, ordered list of topics with their learning
// objectives and the attached materials each draws on. Edits stay local until Save, which hands the whole list to
// saveSyllabus(topics) (PUT /api/learn/chat/messages/:id/syllabus, chat-syllabus-route.js); the server validates it as the
// journey path shape and answers the saved syllabus. Without saveSyllabus the list is read-only. Nothing here generates
// a lesson.
import { useState } from 'react';
import { ArrowDown, ArrowUp, Check, Loader2, Plus, Trash2 } from 'lucide-react';

const ICON = 'shrink-0 rounded p-1 text-ink-3 hover:bg-hover hover:text-ink disabled:opacity-40';
const PILL = 'inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs text-ink-2 hover:bg-hover disabled:opacity-50';
// Server limits (web/src/learn-journey.js validatePath): a title is 1-80 characters, objectives together at most 240.
const TITLE_MAX = 80, OBJECTIVES_MAX = 240, TOPICS_MAX = 12;
const lines = text => text.split('\n').map(l => l.trim()).filter(Boolean);

export default function SyllabusMessage({ syllabus, saveSyllabus = null }) {
  const [topics, setTopics] = useState(() => syllabus.topics.map(t => ({ ...t, objectivesText: t.objectives.join('\n') })));
  const [dirty, setDirty] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState(null);
  const editable = !!saveSyllabus;
  const change = next => { setTopics(next); setDirty(true); setError(null); };
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
                <textarea aria-label={`Topic ${i + 1} objectives, one per line`} value={t.objectivesText} rows={Math.max(1, lines(t.objectivesText).length)}
                  maxLength={OBJECTIVES_MAX} onChange={e => edit(i, { objectivesText: e.target.value })}
                  className="w-full resize-none rounded border border-transparent bg-white px-1 text-xs text-ink-2 hover:border-line focus:border-line focus:outline-none" />
              </> : <>
                <p className="font-medium text-ink">{t.title}</p>
                <ul className="list-disc pl-4 text-xs text-ink-2">{t.objectives.map((o, k) => <li key={k}>{o}</li>)}</ul>
              </>}
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
      {editable && <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" data-syllabus-add disabled={topics.length >= TOPICS_MAX} onClick={add} className={PILL}><Plus size={14} />Add topic</button>
        <button type="button" data-syllabus-save disabled={!dirty || saving} onClick={save} className={PILL}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}{dirty ? 'Save syllabus' : 'Saved'}
        </button>
        {error && <span role="alert" className="text-xs text-red-700">{error}</span>}
      </div>}
    </div>
  );
}
