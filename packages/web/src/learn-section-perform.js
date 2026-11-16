// packages/web/src/learn-section-perform.js
// Learn sections, Make (learn-section-make-spec.md section 11c; docs/features/learn-sections/CONTRACT.md "perform"): what the browser does with the server's `perform` for one
// item, through the functions that already make each card. Dev build only (TutorRehearsal.jsx, VITE_REHEARSAL_TRIGGER).
// performItem({ canvasApi, slash, perform, item, ctx }) -> Promise<{ cardId | jobId, highlight? }>; it throws when the card could not be made.

export async function performItem({ slash, perform }) {
  if (perform?.op === 'slash') {
    if (!slash?.current?.intercept) throw new Error('no_composer');
    slash.current.intercept(perform.line, { depth: perform.depth, context: perform.context, madeBy: perform.madeBy });
    return {};
  }
  throw new Error(`unknown_op:${perform?.op}`);
}
