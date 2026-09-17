import ChatComposer from './ChatComposer.jsx';
import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, History, Plus, Loader2, Trash2, X } from 'lucide-react';
import { api } from './api.js';
import { ConfirmDialog } from './ui.jsx';

const fields = [
  { key: 'audience', label: 'Audience', question: 'Who is this course for?', choices: ['Colleagues using the app', 'Developers maintaining it', 'People learning the underlying concepts'] },
  { key: 'goal', label: 'Learning goal', question: 'What should they be able to do afterward?', choices: ['Run the app and interpret its results', 'Understand how the app works', 'Change the app confidently'] },
  { key: 'knowledge', label: 'Prior knowledge', question: 'What do they already know?', choices: ['New to this topic', 'Know the basics', 'Experienced with the topic'] },
  { key: 'duration', label: 'Duration', question: 'How much time should the course take?', choices: ['10 minutes', '20 minutes', '45 minutes'] },
];
const button = 'rounded border border-line px-3 py-1.5 text-xs hover:bg-hover disabled:opacity-40';
const input = 'w-full rounded border border-line bg-white p-2 text-sm outline-none focus:border-accent';

export function useLearnCourse(app) {
  const [data, setData] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(null);
  const [chats, setChats] = useState([]);
  const [chatId, setChatId] = useState(null);
  const endpoint = `/api/apps/${encodeURIComponent(app.name)}/learn-course`;
  useEffect(() => {
    let active = true;
    api(endpoint).then(value => { if (active) setData(value); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [endpoint]);
  const reload = async () => { setError(''); try { setData(await api(endpoint)); } catch (e) { setError(e.message); } };
  const act = async (action, extra = {}) => {
    if (busy) return null;
    if (dirty && !['save', 'brief', 'delete'].includes(action)) { setError('Save your curriculum edits before continuing.'); return null; }
    setBusy(true); setPending({ action, startedAt: Date.now() }); setError('');
    try {
      const result = await api(endpoint, { method: 'POST', body: JSON.stringify({ action, revision: data?.revision ?? data?.course?.revision ?? 0, ...extra }) });
      setData(result); return action === 'delete' ? true : result.course;
    } catch (e) { setError(e.message); return null; }
    finally { setBusy(false); setPending(null); }
  };
  return { course: data?.course, canAuthor: data?.canAuthor ?? false, loaded: !!data, busy, pending, error, act, reload, dirty, setDirty, chats, setChats, chatId, setChatId };
}

function CourseProgress({ pending }) {
  const container = useRef(null);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    container.current?.scrollIntoView({ block: 'nearest' });
    const update = () => setElapsed(Math.floor((Date.now() - pending.startedAt) / 1000));
    update(); const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [pending.startedAt]);
  const curriculum = pending.action === 'draft';
  return <div ref={container} className="mb-5 rounded-lg border border-line bg-hover/40 p-4" aria-busy="true">
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="flex items-center gap-2" role="status"><Loader2 size={15} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />{curriculum ? 'Drafting and reviewing curriculum…' : 'Generating the first lesson…'}</span>
      <span className="shrink-0 text-xs tabular-nums text-ink-2" data-course-elapsed>{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')} elapsed</span>
    </div>
    <div role="progressbar" aria-label={curriculum ? 'Curriculum generation in progress' : 'Lesson generation in progress'} className="mt-3 h-1.5 overflow-hidden rounded-full bg-line"><span className="block h-full w-1/3 animate-pulse rounded-full bg-accent motion-reduce:animate-none" /></div>
    <p className="mt-2 text-xs text-ink-2">{curriculum ? 'The agent is preparing a draft and checking its scope, sequence, and timing. This can take a couple of minutes.' : 'Your approved curriculum is being turned into lesson content.'} Your saved work stays here while it runs.</p>
  </div>;
}

export function CourseInterview({ state, app, sectionEditor }) {
  const { course, busy: courseBusy, act } = state;
  const [sectionBusy, setSectionBusy] = useState(false);
  const [sectionError, setSectionError] = useState('');
  const busy = courseBusy || sectionBusy;
  const [answer, setAnswer] = useState('');
  const [history, setHistory] = useState(false);
  const composer = useRef(null);
  useEffect(() => { if (sectionEditor?.target) { setHistory(false); requestAnimationFrame(() => composer.current?.focus()); } }, [sectionEditor?.target?.id]);
  useEffect(() => { if (!course) setAnswer(''); }, [course]);
  const brief = course?.brief || {};
  const current = fields.find(f => !brief[f.key]);
  const submit = async value => {
    if (!value.trim() || busy || state.dirty) return;
    let sectionResult;
    if (sectionEditor?.target) {
      setSectionBusy(true); setSectionError('');
      try { sectionResult = await sectionEditor.revise(value); }
      catch (error) { setSectionError(error.message); return; }
      finally { setSectionBusy(false); }
    }
    const result = sectionResult || await act(current ? 'brief' : 'draft', current ? { brief: { ...brief, [current.key]: value } } : { instruction: value });
    if (!result) return;
    const id = state.chatId || crypto.randomUUID();
    state.setChatId(id);
    const exchange = [{ role: 'user', text: value }, { role: 'agent', text: sectionResult ? `Updated ${sectionResult.title}. Review the highlighted block; no assets were generated. Draft edits are saved in this browser.` : current ? 'Course brief updated.' : 'Curriculum revised. Review the updated outline in the main area.' }];
    state.setChats(chats => chats.some(chat => chat.id === id) ? chats.map(chat => chat.id === id ? { ...chat, messages: [...chat.messages, ...exchange] } : chat) : [...chats, { id, title: value.slice(0, 70), messages: exchange }]);
    setAnswer('');

  };
  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="mb-4 flex shrink-0 items-center gap-1">
      <h2 className="mr-auto text-sm font-semibold">Curriculum Agent</h2>
      <button type="button" disabled={busy} onClick={() => setHistory(!history)} className="flex h-6 items-center gap-1 rounded-sm px-1.5 text-xs text-ink-2 hover:bg-hover"><History size={12} />{history ? 'Back to chat' : 'History'}</button>
      <button type="button" disabled={busy} onClick={() => { state.setChatId(null); setAnswer(''); setHistory(false); sectionEditor?.clear(); }} className="flex h-6 items-center gap-1 rounded-sm px-1.5 text-xs text-ink-2 hover:bg-hover"><Plus size={12} />New chat</button>
    </div>
    {history ? <div className="min-h-0 flex-1 overflow-y-auto text-sm"><p className="mb-3 text-xs text-ink-2">Curriculum conversations in this visit. The saved course is retained separately.</p>{state.chats.length ? state.chats.map(chat => <button key={chat.id} className="mb-2 block w-full rounded border border-line p-3 text-left hover:bg-hover" onClick={() => { state.setChatId(chat.id); setHistory(false); }}>{chat.title}</button>) : <p>No curriculum conversations yet.</p>}</div> : <>
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto text-sm">
    {(state.chats.find(chat => chat.id === state.chatId)?.messages || []).map((message, index) => <p key={index} className="mb-2 rounded bg-hover p-2 text-sm">{message.text}</p>)}

      <p>Let’s decide what learners need to know and be able to do. I’ll select topics, principles, prerequisites, and evidence of learning around your goal. <strong>{app.name}</strong> provides context for applying that knowledge.</p>
      {fields.filter(f => brief[f.key]).map(f => <div key={f.key}><p className="mb-2 text-ink-2">{f.question}</p><div className="rounded-lg bg-hover p-3">{brief[f.key]}</div></div>)}
      {current ? <div><p className="mb-3 font-medium">{current.question}</p><div className="flex flex-wrap gap-2">{current.choices.map(choice => <button className={button + ' text-left'} disabled={busy} key={choice} onClick={() => submit(choice)}>{choice}</button>)}</div></div>
        : <p className="text-ink-2">{course?.curriculum ? 'Review the curriculum on the left, including its assumptions about prior knowledge. Edit it directly or tell me what should change.' : 'The brief is ready. I’ll draft and review a curriculum before presenting it. Lesson presentation comes later.'}</p>}
      {current?.key === 'knowledge' && <p className="text-xs text-ink-2">Name specific concepts or skills if you can. Any assumptions will be shown for your review.</p>}
      {!current && !course?.curriculum && <button className={button} disabled={busy} onClick={() => act('draft')}>Draft curriculum</button>}
    </div>
    <div className="sticky bottom-0 mt-2 shrink-0 bg-white pt-1 pb-2">
      {state.dirty && <p className="mb-2 text-xs text-ink-2">Save the edits on the left before continuing here.</p>}
      {sectionError && <p role="alert" className="mb-2 text-xs text-red-700">{sectionError}</p>}
      {sectionEditor?.target && <div className="mb-2 rounded-lg border border-accent bg-accent/5 p-3 text-sm"><div className="flex items-start justify-between gap-2"><span className="text-xs font-medium">Editing {sectionEditor.target.page} / {sectionEditor.target.title}</span><button type="button" aria-label="Clear section edit" onClick={sectionEditor.clear}><X size={14} /></button></div><p className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs text-ink-2">{sectionEditor.target.text}</p></div>}
      {state.error && <p role="alert" className="mb-2 text-xs text-red-700">{state.error}</p>}
      <ChatComposer inputRef={composer} value={answer} onChange={setAnswer} onSubmit={submit} placeholder={sectionEditor?.target ? 'How should this section change?' : current ? 'Your answer...' : 'Ask for a curriculum revision...'} maxLength={sectionEditor?.target ? 2000 : current ? 600 : 2000} busy={busy} disabled={state.dirty}
        leading={<button type="button" disabled title="Curriculum uses the course brief and repository source" aria-label="Add" className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line text-ink-2 disabled:opacity-40"><Plus size={14} strokeWidth={1.5} /></button>}
        trailing={<span title="Curriculum Agent uses the configured default model" className="shrink-0 px-1.5 text-xs text-ink-2">Auto</span>} />
    </div>
    </>}
  </div>;
}

function CurriculumList({ label, values, onChange, disabled }) {
  return <label className="block space-y-1 text-xs text-ink-2"><span>{label}</span>{onChange
    ? <textarea className={input} rows={Math.max(2, values.length)} disabled={disabled} value={values.join('\n')} onChange={e => onChange(e.target.value ? e.target.value.split('\n') : [])} />
    : values.length ? <ul className="list-inside list-disc space-y-1 text-sm text-ink">{values.map((value, i) => <li key={i}>{value}</li>)}</ul> : <p>None specified.</p>}</label>;
}

export function CoursePanel({ state, app, onPreview, onDeleted, planningOnly = false }) {
  const { course, canAuthor, loaded, busy, error, act, reload } = state;
  const [draft, setDraft] = useState(null), [brief, setBrief] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => { setDraft(course?.curriculum || null); setBrief(course?.brief || {}); }, [course]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(course?.curriculum || null) || JSON.stringify(brief) !== JSON.stringify(course?.brief || {});
  useEffect(() => { state.setDirty(dirty); }, [dirty, state.setDirty]);
  useEffect(() => () => state.setDirty(false), [state.setDirty]);
  const updateLesson = (i, patch) => setDraft({ ...draft, lessons: draft.lessons.map((l, n) => n === i ? { ...l, ...patch } : l) });
  const move = (i, step) => { const lessons = [...draft.lessons]; [lessons[i], lessons[i + step]] = [lessons[i + step], lessons[i]]; setDraft({ ...draft, lessons }); };
  const save = () => act(draft ? 'save' : 'brief', { brief, ...(draft ? { curriculum: draft } : {}) });
  const currentPlan = draft?.version === 2;
  return <div aria-label="Course curriculum" className="min-h-0 flex-1 overflow-y-auto pr-2">
    {['draft', 'generate'].includes(state.pending?.action) && <CourseProgress pending={state.pending} />}
    {error && <div role="alert" className="mb-4 rounded border border-red-200 p-3 text-sm text-red-700">{error} <button className="underline" disabled={busy} onClick={reload}>Reload course</button></div>}
    {!loaded ? <p className="text-sm text-ink-2">Loading course…</p> : <>
      <div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">{draft?.title || 'Create a course'}</h2><p className="mt-1 text-xs text-ink-2">{course?.approved && !dirty ? 'Curriculum approved' : 'Draft · review before generating lessons'}</p></div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          {canAuthor && dirty && <button className={button} disabled={busy} onClick={save}>Save curriculum</button>}
          {canAuthor && course && <button className={button + ' text-red-600'} disabled={busy} onClick={() => setConfirmDelete(true)}>Delete curriculum</button>}
        </div></div>
      {confirmDelete && <ConfirmDialog title="Delete curriculum?" body={<>Delete the saved course brief, curriculum, and generated lesson for <strong>{app.name}</strong>? Unsaved curriculum edits will also be discarded. Your app and chat history will stay.</>} onCancel={() => setConfirmDelete(false)} onConfirm={async () => {
        setConfirmDelete(false);
        if (await act('delete', { confirm: true })) onDeleted?.();
      }} />}
      {!canAuthor && !course && <p className="text-sm text-ink-2">The app owner hasn’t approved a course yet. You can still explore the demo and ask questions.</p>}
      {draft && canAuthor && <div className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-line p-3">
        <button className={button} disabled={busy || dirty} onClick={() => act('draft')}>{busy ? 'Planning and reviewing…' : currentPlan ? 'Review with Curriculum Agent' : 'Rebuild with Curriculum Agent'}</button>
        <p className="text-xs text-ink-2">{currentPlan ? 'Review scope, sequence, alignment, and time before approving.' : 'This is the previous page-based outline. Rebuild it using your saved brief to plan topics and principles.'}</p>
      </div>}
      {(canAuthor || course) && <>
        <div className="mb-5 rounded-lg border border-line p-4"><h3 className="mb-3 text-sm font-medium">Course brief</h3><div className="grid gap-3 sm:grid-cols-2">
          {fields.map(f => <label className="space-y-1 text-xs text-ink-2" key={f.key}><span>{f.label}</span>{canAuthor ? <input aria-label={f.label} className={input} maxLength={600} disabled={busy} value={brief[f.key] || ''} placeholder="Answer with Learn Agent" onChange={e => setBrief({ ...brief, [f.key]: e.target.value })} /> : <p className="text-ink">{brief[f.key]}</p>}</label>)}
        </div></div>
        {!draft && <div className="rounded-lg border border-dashed border-line p-6 text-sm text-ink-2">Answer the questions in Learn Agent. The outline will appear here for your review.</div>}
        {draft && course && <div className="space-y-4">
          {canAuthor && <label className="block space-y-1 text-xs text-ink-2">Course title<input className={input} disabled={busy} maxLength={150} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label>}
          {currentPlan && <section className="space-y-4 rounded-lg border border-line p-4">
            <h3 className="text-sm font-medium">Curriculum scope</h3>
            {[
              ['outcomes', 'Course outcomes'], ['prerequisites', 'Entry prerequisites'],
              ['assumptions', 'Assumptions to confirm'], ['excludedTopics', 'Outside this course'],
            ].map(([key, label]) => <CurriculumList key={key} label={label} values={draft[key]} disabled={busy} onChange={canAuthor ? values => setDraft({ ...draft, [key]: values }) : null} />)}
            <div className="flex items-end gap-4"><label className="space-y-1 text-xs text-ink-2">Time budget (minutes){canAuthor ? <input className={input} type="number" min="1" max="1440" disabled={busy} value={draft.minutes} onChange={e => setDraft({ ...draft, minutes: Number(e.target.value) })} /> : <p>{draft.minutes}</p>}</label><p className="pb-2 text-xs text-ink-2">{draft.lessons.reduce((sum, l) => sum + l.minutes, 0)} minutes allocated, including assessment.</p></div>
          </section>}
          {draft.lessons.map((item, i) => <section key={i} className="rounded-lg border border-line p-4">
            <div className="mb-3 flex items-center justify-between gap-2"><span className="text-xs font-medium text-ink-2">Lesson {i + 1}</span>{canAuthor && <div className="flex gap-2">
              <button aria-label={`Move lesson ${i + 1} up`} className={button} disabled={busy || i === 0} onClick={() => move(i, -1)}><ArrowUp size={12} /></button>
              <button aria-label={`Move lesson ${i + 1} down`} className={button} disabled={busy || i === draft.lessons.length - 1} onClick={() => move(i, 1)}><ArrowDown size={12} /></button>
              <button aria-label={`Remove lesson ${i + 1}`} className={button} disabled={busy || draft.lessons.length === 1} onClick={() => setDraft({ ...draft, lessons: draft.lessons.filter((_, n) => n !== i) })}><Trash2 size={12} /></button>
            </div>}</div>
            {canAuthor ? <div className="space-y-3">
              <label className="block space-y-1 text-xs text-ink-2">Title<input aria-label={`Lesson ${i + 1} title`} className={input} disabled={busy} maxLength={150} value={item.title} onChange={e => updateLesson(i, { title: e.target.value })} /></label>
              <label className="block space-y-1 text-xs text-ink-2">Learning objective<textarea className={input} disabled={busy} maxLength={600} value={item.objective} onChange={e => updateLesson(i, { objective: e.target.value })} /></label>
              {!currentPlan && <label className="block space-y-1 text-xs text-ink-2">Previous planned pages<textarea className={input} rows={item.pages.length} disabled={busy} value={item.pages.join('\n')} onChange={e => updateLesson(i, { pages: e.target.value.split('\n') })} /></label>}
            </div> : <><h3 className="font-medium">{item.title}</h3><p className="mt-2 text-sm">{item.objective}</p>{!currentPlan && <ol className="mt-3 list-inside list-decimal text-sm text-ink-2">{item.pages.map((p, n) => <li key={n}>{p}</li>)}</ol>}</>}
            {currentPlan && <div className="mt-3 space-y-3">
              {[['topics', 'Topics'], ['principles', 'Principles to learn'], ['requires', 'Requires']].map(([key, label]) => <CurriculumList key={key} label={label} values={item[key]} disabled={busy} onChange={canAuthor ? values => updateLesson(i, { [key]: values }) : null} />)}
              {[['rationale', 'Why this belongs here'], ['assessment', 'Evidence of learning · success criteria']].map(([key, label]) => <label key={key} className="block space-y-1 text-xs text-ink-2">{label}{canAuthor ? <textarea className={input} disabled={busy} maxLength={key === 'assessment' ? 1000 : 600} value={item[key]} onChange={e => updateLesson(i, { [key]: e.target.value })} /> : <p className="text-sm text-ink">{item[key]}</p>}</label>)}
              <label className="block space-y-1 text-xs text-ink-2">Minutes, including assessment{canAuthor ? <input className={input} type="number" disabled={busy} min="1" max="1440" value={item.minutes} onChange={e => updateLesson(i, { minutes: Number(e.target.value) })} /> : <p>{item.minutes}</p>}</label>
            </div>}
            <details className="mt-3 text-xs text-ink-2"><summary className="cursor-pointer">Supporting app evidence</summary><p className="mt-2">{item.evidence}</p></details>
          </section>)}
          <div className="flex flex-wrap items-center gap-3 pb-3">
            {canAuthor && <button className={button} disabled={busy || dirty || planningOnly && course.approved} onClick={async () => {
              if (!course.approved) await act('approve');
              else if (!planningOnly) { const result = await act('generate'); if (result?.lesson) onPreview(result.lesson); }
            }}>{busy ? 'Working…' : course.approved ? planningOnly ? 'Curriculum approved' : course.lesson ? 'Regenerate first lesson' : 'Generate first lesson' : 'Approve curriculum'}</button>}
            {course?.lesson && !dirty && <button className={button} disabled={busy} onClick={() => onPreview(course.lesson)}>Preview first lesson</button>}
            {dirty && <p className="text-xs text-ink-2">Save your edits, then approve the updated curriculum.</p>}
          </div>
        </div>}
      </>}
    </>}
  </div>;
}
