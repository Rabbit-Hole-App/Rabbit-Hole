// Source arrived (owner 2026-11-18 22:15): one event for any source whose reading has finished. The repository fires it when its catalogue lands (TutorRehearsal.jsx);
// a PDF, a Markdown file or slides will fire the same call with their own summary and options. The Tutor flow answers it with one opening message (learn_open).
// detail: { canvas, kind ('repository' | 'pdf' | 'markdown' | 'slides' ...), summary (one line), options [{ id, label, what }], cannot [{ thing, why }], canRun }.
export const SOURCE_ARRIVED_EVENT = 'rh-source-arrived';
export function sourceArrived(canvas, { kind, summary, options = [], cannot = [], canRun = false }) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SOURCE_ARRIVED_EVENT, { detail: { canvas, kind, summary, options, cannot, canRun } }));
}
// The body learn_open takes: only the words it may use (the server checks the same shape).
export const openBody = ({ kind, summary, options = [], cannot = [] }) => ({
  action: 'learn_open', kind, summary,
  options: options.map(({ id, label, what }) => ({ id, label, what: what || '' })),
  cannot: cannot.map(({ thing, why }) => ({ thing, why: why || '' })),
});
