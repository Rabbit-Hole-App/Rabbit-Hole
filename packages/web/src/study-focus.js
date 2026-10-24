// Which Focus belongs to Study (docs/features/focus-study.md, coordinator ruling P7): the one Study > Notebook started, on the
// notebook Study is working in. It ends with Study's working view (Canvas, Unpin, View > Canvas, Locate on canvas); a Focus the
// learner started on another card is not Study's and is left alone.
export const studyOwnsFocus = (study, focus) => study?.work === 'notebook' && !!focus?.id && focus.id === study.notebookId;

// Ends Study's Focus now (exitFocus puts the camera and selection back at once, so a camera command right after wins).
// True when it ended one.
export function endStudyFocus(canvas, study) {
  if (!studyOwnsFocus(study, canvas?.focusState?.())) return false;
  canvas.exitFocus();
  return true;
}
