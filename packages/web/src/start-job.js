// The Start job (docs/features/start-sources.md): the one draft store and the orchestrator that turns it into a destination
// with its sources. It lives outside React, so closing the dialog never cancels a start, and the card half (cards are
// inserted by the browser on the mounted canvas) is handed to the destination page through attach(). Every outside effect
// arrives in `deps`, so node tests run the whole job against fakes (start-job.test.mjs); start-run.js wires the real ones.
import { UNTITLED } from './start.js';
import { blankPlan, canBlank, canStart, clearDraft, createDraft, fileKey, loadDraft, planStart, reduce, saveDraft } from './start-draft.js';

const message = (error, fallback = 'This could not be added.') => String(error?.message || error || fallback);
export const WAIT_FOR_PAGE = 30_000; // how long queued cards wait for the destination page to attach
export const WAIT_FOR_INDEX = 10 * 60_000;
export const STOPPED = 'Stopped. Start again to continue.';

// deps: storage, command(name, args, ctx), uploadContextDoc(slug, file), uploadSource(file, { app, board, family }) -> { source },
// contextFromSource(slug, source), contextLink(slug, url), repository(slug) -> the project row, navigate(href), here() -> pathname,
// wait(ms), notify(text), setTimer/clearTimer.
export function createJob(deps) {
  const files = new Map(); // fileKey -> File: held for the life of the tab, never stored
  const lanes = new Map(); // slug -> { place, queue: [{ item, resolve }], busy, timer }
  const listeners = new Set();
  // Plain calls: a browser's setTimeout throws 'Illegal invocation' when called as a method of another object.
  const timers = { set: (...args) => (deps.setTimer || setTimeout)(...args), clear: (...args) => (deps.clearTimer || clearTimeout)(...args) };
  let draft = loadDraft(deps.storage) || createDraft();
  let running = null;
  let stopped = false; // Stop: nothing further starts, what is in flight finishes, the rest fails as stopped

  const commit = (next) => {
    if (next === draft) return;
    draft = next;
    saveDraft(draft, deps.storage);
    listeners.forEach((listener) => listener());
  };
  const dispatch = (action) => commit(reduce(draft, action));
  const rowOf = (id) => draft.rows.find((row) => row.id === id);
  const move = (id, patch) => dispatch({ type: 'row', id, ...patch });
  const fail = (id, reason) => { if (rowOf(id)) move(id, { status: 'failed', reason, waiting: '' }); };
  // The row is ready once every destination it asked for is done; the reducer refuses the move until then.
  const settle = (id) => move(id, { status: 'ready' });

  const reset = () => { files.clear(); commit(createDraft()); clearDraft(deps.storage); };

  // ---- cards: handed to the destination page ------------------------------------------------------------------
  const laneOf = (slug) => { if (!lanes.has(slug)) lanes.set(slug, { place: null, queue: [], busy: false, timer: null }); return lanes.get(slug); };
  const drop = (lane, reason) => { for (const { item, resolve } of lane.queue.splice(0)) { fail(item.rowId, reason); resolve(); } };
  async function drain(slug) {
    const lane = laneOf(slug);
    if (!lane.place || lane.busy) return;
    lane.busy = true;
    timers.clear(lane.timer);
    while (lane.queue.length && lane.place && !stopped) {
      const { item, resolve } = lane.queue.shift();
      move(item.rowId, { status: 'importing', reason: '' });
      try {
        const out = (await lane.place(item)) || {};
        move(item.rowId, { done: { canvas: true }, ...(out.label ? { label: out.label } : {}), ...(out.detail ? { detail: out.detail } : {}), ...(out.meta ? { meta: out.meta } : {}) });
        if (out.warning) fail(item.rowId, out.warning); else settle(item.rowId);
      } catch (error) { fail(item.rowId, message(error)); }
      resolve();
    }
    lane.busy = false;
  }
  // The page that owns slug's canvas registers how to place one card; the job drains its queue through it. Returns detach.
  function attach(slug, place) {
    const lane = laneOf(slug);
    lane.place = place;
    drain(slug);
    return () => {
      if (lane.place !== place) return;
      lane.place = null;
      drop(lane, 'The canvas was closed before this was added. Start again to retry.');
    };
  }
  function enqueue(slug, item) {
    const lane = laneOf(slug);
    return new Promise((resolve) => {
      move(item.rowId, { status: 'importing' });
      lane.queue.push({ item, resolve });
      if (lane.place) { drain(slug); return; }
      timers.clear(lane.timer);
      lane.timer = timers.set(() => { if (!lane.place) drop(lane, 'The canvas did not open. Start again to retry.'); }, WAIT_FOR_PAGE);
    });
  }

  // ---- the destination, once -----------------------------------------------------------------------------------
  const goTo = (slug) => { if (!String(deps.here()).startsWith(`/apps/${slug}`)) deps.navigate(`/apps/${slug}`); };
  async function destination(plan, ctx) {
    if (draft.destination) { goTo(draft.destination.slug); return draft.destination.slug; }
    const repository = draft.rows.find((row) => row.kind === 'repository' && row.status !== 'ready');
    if (plan.destination.kind === 'repository' && repository) {
      const existing = repository.meta.existing;
      if (existing) {
        dispatch({ type: 'destination', kind: 'repository', slug: existing.slug, existing: true });
        move(repository.id, { done: { context: true } });
        goTo(existing.slug);
        return existing.slug;
      }
      move(repository.id, { status: 'checking' });
      let made;
      try {
        made = await deps.command('connect_repository', repository.meta.connect, ctx);
        if (made?.choose) throw Error('This repository was connected on another branch meanwhile. Remove it and add it again.');
        if (!made?.data?.name) throw Error('The repository was not connected.');
      } catch (error) { fail(repository.id, message(error)); throw error; }
      dispatch({ type: 'destination', kind: 'repository', slug: made.data.name, existing: !!made.data.existing });
      move(repository.id, { done: { context: true } });
      return made.data.name;
    }
    const made = await deps.command('create_canvas', { title: UNTITLED, open: true }, ctx);
    if (!made?.data?.name) throw Error('The canvas was not created.');
    dispatch({ type: 'destination', kind: 'canvas', slug: made.data.name });
    return made.data.name;
  }

  // ---- one source ----------------------------------------------------------------------------------------------
  // A board that is still saving answers 'save this board first': wait a moment and send again, a few times, then say so.
  async function sendSource(file, slug, family) {
    for (let attempt = 0; ; attempt++) {
      try { return await deps.uploadSource(file, { app: slug, board: 'main', family }); }
      catch (error) { if (!error?.boardNotSaved || attempt >= 4) throw error; await deps.wait(1500); }
    }
  }
  const asDoc = (doc, file) => (doc ? { id: doc.id, name: doc.name || file?.name || 'Document' } : null);
  const asSource = (source) => (source ? { id: source.id, rev: source.rev, name: source.name, type: source.type, size: source.size, family: source.family } : null);
  // A file: a PDF, .txt or .md for context is stored once as a context document. A .txt or .md wanted as both is sent once, as a
  // file source the card reads; the server copies it into the context list inside itself (never a second upload). A PDF for both
  // places its card from the stored context document. Anything else, and a canvas-only file, takes the drop road on the page.
  async function fileStep(row, needs, slug, pending) {
    const file = files.get(row.key);
    if (!file) { fail(row.id, 'Add this file again.'); return; }
    let doc = row.meta.doc || null, source = row.meta.source || null;
    const text = !row.meta.pdf && /[.](txt|md|markdown)$/i.test(row.meta.name);
    try {
      if (needs.context && needs.canvas && text) {
        move(row.id, { status: 'uploading' });
        source ||= asSource((await sendSource(file, slug, row.meta.family)).source);
        move(row.id, { meta: { source } });
        doc ||= asDoc(await deps.contextFromSource(slug, source), file);
        move(row.id, { done: { context: true }, meta: { doc } });
      } else if (needs.context) {
        move(row.id, { status: 'uploading' });
        doc = asDoc(await deps.uploadContextDoc(slug, file), file);
        move(row.id, { done: { context: true }, meta: { doc } });
      }
    } catch (error) { fail(row.id, message(error)); return; }
    if (needs.canvas) pending.push(enqueue(slug, { rowId: row.id, kind: 'file', file, doc, source }));
    else settle(row.id);
  }
  // A link: context is a note the server keeps (no card needed); the card is the live reader, added when canvas is on.
  async function linkStep(row, needs, slug, pending) {
    if (needs.context) {
      move(row.id, { status: 'checking' });
      try { const doc = await deps.contextLink(slug, row.meta.url); move(row.id, { done: { context: true }, meta: { doc: asDoc(doc) } }); } catch (error) { fail(row.id, message(error)); return; }
    }
    if (needs.canvas) pending.push(enqueue(slug, { rowId: row.id, kind: 'link', link: { ...row.meta } }));
    else settle(row.id);
  }
  async function overviewStep(row, slug) {
    move(row.id, { status: 'importing', waiting: 'index' });
    const until = Date.now() + WAIT_FOR_INDEX;
    let project = null;
    while (Date.now() < until) {
      if (stopped) { fail(row.id, STOPPED); return; }
      try { project = await deps.repository(slug); } catch (error) { fail(row.id, message(error)); return; }
      if (project?.commit_sha) break;
      if (project?.status === 'failed') { fail(row.id, project.error || 'The repository could not be indexed.'); return; }
      await deps.wait(2500);
    }
    if (!project?.commit_sha) { fail(row.id, 'The index is taking longer than expected. Start again to add the overview.'); return; }
    move(row.id, { waiting: '' });
    await enqueue(slug, { rowId: row.id, kind: 'overview', repository: { app: slug, repo: project.repo, commit: project.commit_sha } });
  }

  async function execute(ctx) {
    const plan = planStart(draft);
    for (const id of plan.complete) settle(id);
    const slug = await destination(plan, ctx);
    const pending = [];
    for (const step of plan.steps) {
      const row = rowOf(step.id);
      if (!row || row.status === 'ready') continue;
      if (stopped) { fail(row.id, STOPPED); continue; }
      if (row.kind === 'repository') {
        if (step.needs.canvas) pending.push(overviewStep(row, slug)); else settle(row.id);
      } else if (row.kind === 'file') await fileStep(row, step.needs, slug, pending);
      else await linkStep(row, step.needs, slug, pending);
    }
    await Promise.all(pending);
    dispatch({ type: 'finish' });
    if (draft.phase === 'done') { reset(); deps.notify?.('Sources added.'); }
  }

  // Start rabbit hole. A second press while one runs, or with nothing to start, does nothing.
  async function start(ctx) {
    if (running || !canStart(draft)) return false;
    dispatch({ type: 'begin' });
    if (draft.phase !== 'starting') return false;
    stopped = false;
    running = execute(ctx)
      .catch((error) => dispatch({ type: 'finish', error: message(error, 'Start did not finish.') }))
      .finally(() => { running = null; });
    await running;
    return true;
  }

  // Stop: nothing further starts; what is in flight finishes; every other source fails as stopped and Start again picks them up.
  function stop() {
    if (!running) return;
    stopped = true;
    for (const lane of lanes.values()) drop(lane, STOPPED);
  }

  // Start with a blank canvas: imports nothing from the list; reuses a destination a failed start already made.
  async function blank(ctx) {
    if (running || !canBlank(draft)) return false;
    const plan = blankPlan(draft);
    dispatch({ type: 'lock' });
    running = (async () => {
      if (plan.create) {
        const made = await deps.command('create_canvas', { title: UNTITLED, open: true }, ctx);
        if (!made?.data?.name) throw Error('The canvas was not created.');
      } else goTo(plan.slug);
      reset();
    })()
      .catch((error) => dispatch({ type: 'finish', error: message(error, 'The canvas was not created.') }))
      .finally(() => { running = null; });
    await running;
    return true;
  }

  return {
    getDraft: () => draft,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    dispatch,
    addFiles: (list) => {
      const picked = [...list];
      for (const file of picked) files.set(fileKey(file), file);
      dispatch({ type: 'add-files', files: picked.map(({ name, size, type, lastModified }) => ({ name, size, type, lastModified })) });
    },
    start, blank, stop, attach, reset,
    isRunning: () => !!running,
  };
}
