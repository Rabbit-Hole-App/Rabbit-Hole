// STEP/STP cards (file-imports Lane 4): a STEP original is converted by the control-plane job runner (JOBS lane) through
// the converter's `step-glb` (docs/features/canvas-file-converter.md section 1.6); the card renders the GLB derivative in
// the shared viewer. This module is the card's half: the job-to-card state map and reading the derivatives. It never
// dispatches to the converter itself.
//
// Derivatives the card expects on the source (file_derivatives.kind):
//   mesh       model.glb       glTF 2.0 binary, metres, glTF Y-up; one node per assembly part, named after it; within
//                              the viewer's bounds (20 MiB, 5,000,000 accessor elements)
//   structure  structure.json  { units, unit_scale_to_m, parts, solids, tree: [{ name, children?: [...] }], bbox: { min, max } (source units), limitations? }
//   poster     poster.png      optional; when absent the card draws one from the mesh on first view
// ponytail: the /api/learn/files routes are Lane 1's contract (canvas-file-imports.md 4.2); not built yet, so a STEP card
// shows "awaiting converter" until the card carries a fileRef with a job.

const STAGE = { queued: 'Queued for conversion', validating: 'Checking the STEP file', converting: 'Converting to a viewing mesh', preparing_preview: 'Preparing the preview' };

// The card's state from its fileRef and the job record (GET /api/learn/files/jobs/<id>): { state, label, retry }.
export function cadCardState(fileRef, job = null) {
  if (fileRef?.derivatives?.mesh && (!job || ['ready', 'ready_with_limitations'].includes(job.state))) return { state: job?.state === 'ready_with_limitations' ? 'limited' : 'ready', label: '', retry: false };
  if (!fileRef?.job) return { state: 'awaiting', label: 'Awaiting converter: a STEP preview needs the CAD converter, which is not connected yet. The original STEP file is kept.', retry: false };
  if (!job) return { state: 'queued', label: STAGE.queued, retry: false };
  if (STAGE[job.state]) return { state: 'working', label: STAGE[job.stage] || STAGE[job.state], retry: false };
  if (job.state === 'cancelled') return { state: 'cancelled', label: 'Conversion cancelled. The original STEP file is kept.', retry: true };
  if (job.state === 'failed') return { state: 'failed', label: `The STEP preview could not be made${job.error ? `: ${job.error}` : ''}. The original STEP file is kept.`, retry: true };
  if (['ready', 'ready_with_limitations'].includes(job.state)) return { state: job.state === 'ready' ? 'ready' : 'limited', label: '', retry: false };
  return { state: 'working', label: STAGE.queued, retry: false };
}

// structure.json -> what the card shows: units only when the converter reported them, part count, limitations.
export function cadFacts(structure) {
  if (!structure || typeof structure !== 'object') return { units: null, parts: null, limitations: [] };
  const units = typeof structure.units === 'string' && /^(mm|cm|m|in|ft|µm)$/.test(structure.units) ? structure.units : null;
  return { units, parts: Number.isInteger(structure.parts) ? structure.parts : null, limitations: Array.isArray(structure.limitations) ? structure.limitations.filter(l => typeof l === 'string').slice(0, 5) : [] };
}

const derivativeUrl = (fileRef, id, board) => `/api/learn/files/${encodeURIComponent(fileRef.source.id)}/d/${encodeURIComponent(id)}${board ? `?board=${encodeURIComponent(board)}` : ''}`;
// The mesh and structure derivatives, authorised through the board (section 4.1); same-origin credentials, no redirects.
export async function fetchCadDerivatives(fileRef, board, signal) {
  const get = async id => { const response = await fetch(derivativeUrl(fileRef, id, board), { credentials: 'same-origin', redirect: 'error', signal }); if (!response.ok) throw new Error(`The CAD preview could not be read (${response.status})`); return response; };
  const mesh = new Uint8Array(await (await get(fileRef.derivatives.mesh)).arrayBuffer());
  const structure = fileRef.derivatives.structure ? await (await get(fileRef.derivatives.structure)).json().catch(() => null) : null;
  return { mesh, structure };
}
