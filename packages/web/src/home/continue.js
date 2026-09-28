// Home's read of this browser (T02 §3.1-3.2). Read-only and forgiving: if the Learn blob
// changes shape on the Learn branches, a line drops out; nothing throws.
import { titleOf } from '../agent/catalog.js';
import { ago, cronHuman, cronList } from '../api.js';
import { outlineFrom } from '../learn-outline-model.js';
import { canvasKeys, hasLocalContent, opensHere } from './canvas-local.js';

const json = (storage, key) => { try { return JSON.parse(storage.getItem(key)); } catch { return null; } };

export function readRecent(storage) {
  const list = json(storage, 'small.recent');
  return Array.isArray(list) ? list.filter((slug) => typeof slug === 'string') : [];
}

// small.recent ∩ catalog, in recent order, at most five (T02 §3.2).
export const recentItems = (recent, catalog) => recent.map((slug) => (catalog || []).find((a) => a.name === slug)).filter(Boolean).slice(0, 5);

// LearnPage.jsx:143: the row's own org (a shared app's differs from the workspace's) and the
// viewer's email (live rows carry none; repository and canvas rows carry the viewer's).
const keysOf = (a, email, org) => canvasKeys({ org: a.org || org, email: a.email || email, slug: a.name });

// T02 §8.3: the record exists, but its content was made in another browser.
export const onAnotherDevice = (a, email, storage) =>
  a.kind === 'canvas' && !opensHere({ storage, keys: keysOf(a, email), record: a });

const lastQuestion = (chat) => {
  if (!Array.isArray(chat)) return null;
  // ponytail: top-level turns only; in-block replies carry no timestamps to order by.
  const turn = [...chat].reverse().find((e) => typeof e?.question === 'string' && e.question.trim());
  return turn ? turn.question.trim() : null;
};

// The learner's own outline and ticks (AdaptiveCanvas.jsx:901), never an inference.
const nextHeading = (blob) => { try { return outlineFrom(blob?.blocks).find((h) => !h.done)?.label || null; } catch { return null; } };

// What this browser holds for a project's or canvas's Learn: the last question and the next
// unticked heading, or null when it was never explored here.
export function learnProgress(a, { org, email, storage }) {
  const keys = keysOf(a, email, org);
  return hasLocalContent(storage, keys) ? { lastExplored: lastQuestion(json(storage, keys.chat)), next: nextHeading(json(storage, keys.ink)) } : null;
}

export function readContinue({ org, email, recent, catalog, storage }) {
  const items = recentItems(recent || [], catalog);
  const card = (a, canvas, lastExplored = null, next = null) => ({ slug: a.name, title: titleOf(a), kind: a.kind, canvas, lastExplored, next });
  for (const a of items) {
    const p = learnProgress(a, { org, email, storage });
    if (p) return card(a, true, p.lastExplored, p.next);
  }
  return items.length ? card(items[0], false) : null;
}

// A canvas route opens Learn itself (CanvasPage); other kinds open their Learn tab.
export const openHref = (item) => (item.canvas && item.kind !== 'canvas' ? `/apps/${item.slug}?tab=learn` : `/apps/${item.slug}`);

// App.jsx:409's access wording; for a job it is also who can run it (index.js:2008 canView).
const access = (a) => (a.visibility === 'private' ? 'only shared' : `anyone @${a.org.replace(/-/g, '.')}`);

// T02 §3.2: kinds differ by metadata and next action, not only the chip.
export function recentCard(a, { catalog = [], email, storage }) {
  if (a.kind === 'repository') {
    const canvases = catalog.filter((c) => c.kind === 'canvas' && c.project === a.name).length;
    return {
      meta: [a.commit_sha && a.commit_sha.slice(0, 7), `Map ${a.status}`, canvases && `${canvases} canvas${canvases > 1 ? 'es' : ''}`, a.visibility === 'private' ? 'Private' : 'Workspace'].filter(Boolean),
      action: { label: 'Open project', to: `/apps/${a.name}` },
    };
  }
  if (a.kind === 'canvas') {
    if (onAnotherDevice(a, email, storage)) return { meta: ['On another device'], action: null };
    const project = catalog.find((p) => p.name === a.project);
    const last = lastQuestion(json(storage, keysOf(a, email).chat));
    return {
      meta: [project ? `In ${titleOf(project)}` : 'Standalone', last && `Last explored: ${last}`, 'Content in this browser'].filter(Boolean),
      action: { label: 'Continue learning', to: `/apps/${a.name}` },
    };
  }
  if (a.kind === 'job') {
    const run = a.lastRun;
    return {
      meta: [
        run && (run.status === 'running' ? 'Running' : `${run.status === 'finished' ? '✓' : '✗'} ${ago(run.startedAt)}`),
        a.schedule && `${cronList(a.schedule).map(cronHuman).join(' · ')}${a.schedule_paused ? ' · paused' : ''}`,
        `Runs: ${access(a)}`,
      ].filter(Boolean),
      action: run?.runId ? { label: 'View last run', to: `/apps/${a.name}/runs/${run.runId}` } : { label: 'Open', to: `/apps/${a.name}` },
    };
  }
  return { meta: [`Deployed ${ago(a.deployed_at || a.created_at)}`, access(a)], action: { label: 'Open app', href: a.url } };
}
