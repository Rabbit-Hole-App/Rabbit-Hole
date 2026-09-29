// Preview-only additions to a job or server page (WP6 checkpoint 1). SharePage renders this behind a literal
// learnPreview, so none of it reaches the live build. Import only side-effect-free modules here: an import with
// top-level code (agent/commands.js) stays in the live bundle even when this component folds away.
import { useEffect } from 'react';
import { ago, navigate } from './api.js';
import { D7_REASON } from './agent/slash.js';
import { patchSurface } from './agent/surface.js';
import { fmtDur, secs } from './run.jsx';
import { Pill, StatusPill } from './ui.jsx';
import { learnPreview } from './flags.js';
import { fixturesOn, useFixtures } from './home/review-fixtures.js';
import { repositoriesOf, titleOf } from './agent/catalog.js';

export default function AppOps({ app, catalog }) {
  // App scope for the bar (T02 §6.2). Root resets the surface on every URL change, so this re-runs on the path.
  const path = window.location.pathname + window.location.search;
  useEffect(() => { patchSurface({ resource: { kind: 'app', slug: app.name, title: app.name } }); }, [path, app.name]);
  const lr = app.lastRun;
  const fixtures = useFixtures(fixturesOn(localStorage, window.location.search, learnPreview)); // data loads only through review-fixtures.js's literal guard
  const from = fixtures && repositoriesOf(catalog, fixtures.BUILT_FROM)[0]; // ponytail: a review fixture only; read the app's recorded project when the backend has one
  // ponytail: runtime = the last run's duration; a server keeps the existing "deployed <ago>" (no health field). Outputs are one
  // link to the run page (RunView); list names inline when asked.
  return <>
    {app.kind === 'job' && <span data-last-run className="flex items-center gap-1.5">{lr ? <>Last run {ago(lr.startedAt)} · <StatusPill status={lr.status} />{lr.finishedAt && ` in ${fmtDur(secs(lr.startedAt, lr.finishedAt))}`}<button type="button" className="cursor-pointer text-accent hover:underline" onClick={() => navigate(`/apps/${app.name}/runs/${lr.runId}`)}>Outputs →</button></> : 'Never run'}</span>}
    {from && <span data-built-from className="flex items-center gap-1.5"><button type="button" className="cursor-pointer text-accent hover:underline" onClick={() => navigate(`/apps/${from.name}`)}>Built from {titleOf(from)} →</button><Pill>Fixture · UI preview</Pill></span>}
    <span data-app-ops className="basis-full text-ink-3">{D7_REASON}</span>
  </>;
}
