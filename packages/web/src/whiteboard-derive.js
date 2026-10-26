import { emptySketch } from './whiteboard-sketch.js';

// The seam to the migration workstream (docs/features/tldraw-removal.md, workstream B): what a whiteboard block with a tldraw
// `snapshot` and no saved `sketch` shows, derived in memory when it opens (migration rule 2). Returns { sketch, pending? }.
// ponytail: until B3 (`deriveSketch(block)` in legacy-to-sketch.js) lands, nothing is converted: `pending` tells the editor
// not to save over the original. The integrator replaces this body with `export { deriveSketch } from './legacy-to-sketch.js'`.
export const deriveSketch = () => ({ sketch: emptySketch(), pending: true });
