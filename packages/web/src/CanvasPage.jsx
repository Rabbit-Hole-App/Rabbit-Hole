// CANVAS destination (WP6): /apps/canvas-<id> opens Learn directly under one light row. The gate is decided once,
// before Learn mounts: Learn writes empty keys on mount (canvas-local.js), and an empty editable copy of content
// made elsewhere would look like lost work (T02 §8.3).
import { useEffect, useState } from 'react';
import { api, navigate } from './api.js';
import { Button } from './ui.jsx';
import LearnPage from './LearnPage.jsx';
import { titleOf } from './agent/catalog.js';
import { canvasKeys, NOT_HERE, NOT_HERE_WHY, opensHere } from './home/canvas-local.js';

// ponytail: T02 §8.3 [New canvas here] and [About local-only storage] are left out; add them when asked.
export function CanvasLearn({ app, project, onMap = null, switcher = null }) { // callers key it by canvas: the decision is made once per mount
  // The canvas opens when this browser has its content (or made it), or when the server has its board
  // (docs/features/canvas-persistence.md): NOT_HERE only when neither copy exists. The server is asked only when needed.
  const [here, setHere] = useState(() => opensHere({ storage: localStorage, keys: canvasKeys({ org: app.org, email: app.email || app.owner_email, slug: app.name }), record: app }) || null); // LearnPage.jsx:143's key
  useEffect(() => {
    if (here !== null) return undefined;
    let live = true;
    api(`/api/learn/boards/${encodeURIComponent(app.name)}/main`).then(data => data.exists !== false, () => false).then(found => { if (live) setHere(found); });
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (here === null) return <main className="min-w-0 flex-1" />;
  if (here) return <LearnPage app={app} onMap={onMap} switcher={switcher} />;
  return <main data-canvas-gate className="min-w-0 flex-1 overflow-auto"><div className="mx-auto max-w-md px-6 pt-[18vh] text-center">
    <h1 className="text-lg font-semibold">{NOT_HERE}</h1>
    <p className="pt-2 text-sm text-ink-2">{NOT_HERE_WHY}</p>
    {project && <Button variant="secondary" className="mx-auto mt-4" onClick={() => navigate(`/apps/${project.name}`)}>Open project</Button>}
  </div></main>;
}

// A column, not a Fragment: LearnPage brings its own <main>, which no longer matches index.css's
// [data-shell-sidebar] ~ main phone padding, so the column restores it. Learn's header names the canvas
// (feature/parallel-work 07e1f15), so the row only links a parent project: one title (user, WP6 closeout).
export default function CanvasPage({ app, project }) {
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col max-md:pt-(--shell-top-h)">
    {project && <div data-canvas-parent className="flex shrink-0 items-center gap-2 pt-5 pr-8 pl-14 text-xs text-ink-2 max-md:px-4 max-md:pt-3">
      <button type="button" className="cursor-pointer hover:text-ink hover:underline" onClick={() => navigate(`/apps/${project.name}`)}>In {titleOf(project)} →</button>
    </div>}
    <CanvasLearn app={app} project={project} />
  </div>;
}
