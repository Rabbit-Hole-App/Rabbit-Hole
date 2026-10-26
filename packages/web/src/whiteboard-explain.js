// The Tutor drawing its answer onto a native Whiteboard (workstream T replaces this body; docs/features/tldraw-removal.md,
// "Tutor draw-back interface"). The card calls it with what it owns:
//   block, appName, question, answer, onStage(text)
//   addMarks(marks)  applies { strokes?, shapes?, items? } to the board as ONE edit (one undo step), skipping ids already there
//   focus(rect)      shows a sketch-space rectangle { x, y, x2, y2 } in the card (the view is never saved)
// and expects { spoken } back (text offered for paid narration, or '').
// ponytail: until T, the native board cannot be drawn on by the Tutor; the tldraw card (default until cutover) still can.
export async function explainOnBoard() {
  throw new Error('The tutor cannot draw on the new whiteboard yet.');
}
