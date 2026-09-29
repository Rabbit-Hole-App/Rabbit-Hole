// Preview-only additions to a job or server page (WP6 checkpoint 1). SharePage renders this behind a literal
// learnPreview, so none of it reaches the live build. Import only side-effect-free modules here: an import with
// top-level code (agent/commands.js) stays in the live bundle even when this component folds away.
import { D7_REASON } from './agent/slash.js';

export default function AppOps() {
  return <span data-app-ops className="basis-full text-ink-3">{D7_REASON}</span>;
}
