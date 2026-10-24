// The saved Study arrangement a loading placeholder needs before its canvas page exists (CanvasLoading.jsx): the same
// readStudy the canvas page uses, so a reload straight into Study never paints a map Study hides (focus-study.md). Pure.
import { canvasKeys } from './home/canvas-local.js';
import { readStudy } from './study-state.js';

const asStudy = state => ({ mode: state.mode, state });

// app: the canvas record when the page has it (exact scope). Without it, name: the slug in the address; the one saved arrangement
// in this browser for a canvas of that name. Zero or several matches, or unreadable storage: null, which shows the Canvas placeholder.
export function savedStudy(storage, { app = null, name = null } = {}) {
  try {
    if (app) return asStudy(readStudy(storage, canvasKeys({ org: app.org, email: app.email || app.owner_email, slug: app.name }).base));
    if (!name || !storage) return null;
    const tail = `:${name}:study`, hits = [];
    for (let i = 0; i < storage.length; i++) { const key = storage.key(i); if (key?.startsWith('small.adaptive-canvas:') && key.endsWith(tail)) hits.push(key); }
    return hits.length === 1 ? asStudy(readStudy(storage, hits[0].slice(0, -':study'.length))) : null;
  } catch { return null; }
}
