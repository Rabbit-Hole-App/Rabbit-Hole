// The Start job (docs/features/start-sources.md): the one draft store and the orchestrator that turns it into a destination
// with its sources. It lives outside React, so closing the dialog never cancels a start, and the card half (cards are
// inserted by the browser on the mounted canvas) is handed to the destination page through attach(). Every outside effect
// arrives in `deps`, so node tests run the whole job against fakes (start-job.test.mjs); start-run.js wires the real ones.
import { UNTITLED } from './start.js';
import { blankPlan, canBlank, canStart, clearDraft, createDraft, fileKey, loadDraft, planStart, reduce, saveDraft } from './start-draft.js';

const message = (error, fallback = 'This could not be added.') => String(error?.message || error || fallback);
export const WAIT_FOR_PAGE = 30_000; // how long queued cards wait for the destination page to attach
export const WAIT_FOR_INDEX = 10 * 60_000;

// deps: storage, command(name, args, ctx), uploadContextDoc(slug, file), repository(slug) -> the project row, navigate(href),
// here() -> pathname, wait(ms), notify(text), setTimer/clearTimer.
export function createJob(deps) {
  const files = new Map(); // fileKey -> File: held for the life of the tab, never stored
  const lanes = new Map(); // slug -> { place, queue: [{ item, resolve }], busy, timer }
  const listeners = new Set();
  const timers = { set: deps.setTimer || setTimeout, clear: deps.clearTimer || clearTimeout };
  let draft = loadDraft(deps.storage) || createDraft();
  let running = null;

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
    while (lane.queue.length && lane.place) {
      const { item, resolve } = lane.queue.shift();
      move(item.rowId, { status: 'importing', reason: '' });
      try {
        const out = (await lane.place(item)) || {};
        move(item.rowId, { done: { canvas: true, ...(item.kind === 'link' ? { context: true } : {}) }, ...(out.label ? { label: out.label } : {}), ...(out.detail ? { detail: out.detail } : {}), ...(out.meta ? { meta: out.meta } : {}) });
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
  async function fileStep(row, needs, slug, pending) {
    const file = files.get(row.key);
    if (!file) { fail(row.id, 'Add this file again.'); return; }
    let doc = row.meta.doc || null;
    if (needs.context) {
      move(row.id, { status: 'uploading' });
      try { doc = await deps.uploadContextDoc(slug, file); } catch (error) { fail(row.id, message(error)); return; }
      move(row.id, { done: { context: true }, meta: { doc: doc ? { id: doc.id, name: doc.name || file.name } : null } });
    }
    if (needs.canvas) pending.push(enqueue(slug, { rowId: row.id, kind: 'file', file, doc: doc ? { id: doc.id, name: doc.name || file.name } : null }));
    else settle(row.id);
  }
  function linkStep(row, slug, pending) {
    // A link's context is its card, so a placed card completes both choices (drain).
    pending.push(enqueue(slug, { rowId: row.id, kind: 'link', link: { ...row.meta } }));
  }
  async function overviewStep(row, slug) {
    move(row.id, { status: 'importing', waiting: 'index' });
    const until = Date.now() + WAIT_FOR_INDEX;
    let project = null;
    while (Date.now() < until) {
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
      if (row.kind === 'repository') {
        if (step.needs.canvas) pending.push(overviewStep(row, slug)); else settle(row.id);
      } else if (row.kind === 'file') await fileStep(row, step.needs, slug, pending);
      else linkStep(row, slug, pending);
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
    running = execute(ctx)
      .catch((error) => dispatch({ type: 'finish', error: message(error, 'Start did not finish.') }))
      .finally(() => { running = null; });
    await running;
    return true;
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
    start, blank, attach, reset,
    isRunning: () => !!running,
  };
}
