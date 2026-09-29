// Preview-only additions to a job or server page (WP6 checkpoint 1). SharePage renders this behind a literal
// learnPreview, so none of it reaches the live build. Import only side-effect-free modules here: an import with
// top-level code (agent/commands.js) stays in the live bundle even when this component folds away.
import { useEffect } from 'react';
import { D7_REASON } from './agent/slash.js';
import { patchSurface } from './agent/surface.js';

export default function AppOps({ app }) {
  // App scope for the bar (T02 §6.2). Root resets the surface on every URL change, so this re-runs on the path.
  const path = window.location.pathname + window.location.search;
  useEffect(() => { patchSurface({ resource: { kind: 'app', slug: app.name, title: app.name } }); }, [path, app.name]);
  return <span data-app-ops className="basis-full text-ink-3">{D7_REASON}</span>;
}
