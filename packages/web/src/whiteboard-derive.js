// The seam to the migration workstream (docs/features/tldraw-removal.md, workstream B): what a whiteboard block with a tldraw
// `snapshot` shows when it opens, derived in memory and never written (migration rule 2). Returns { sketch, status, derived, kept,
// approx, warnings, report }; a saved `sketch` always wins.
export { deriveSketch } from './legacy-to-sketch.js';
