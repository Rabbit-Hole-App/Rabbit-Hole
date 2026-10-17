// STEP/STP cards (file-imports Lane 4): a STEP original is converted by the control-plane job runner (JOBS lane) through
// the converter's `step-glb` (docs/features/canvas-file-converter.md section 1.6); the card renders the GLB derivative in
// the shared viewer. This module is the card's half: the job-to-card state map and reading the derivatives. It never
// dispatches to the converter itself.
//
// Derivatives the card expects on the source (file_derivatives.kind), as file-convert's step-glb writes them
// (packages/file-convert/converters/step.mjs on feature/file-convert):
//   mesh       model.glb       glTF 2.0 binary, metres, source Z-up turned to glTF Y-up at the root; one node per
//                              assembly part, named after it; within the viewer's bounds (20 MiB, 5,000,000 elements)
//   structure  structure.json  { source_unit: 'millimetre' | 'inch' | ... | null, unit: 'metre', quality, parts, meshes,
//                              nodes, triangles, vertices, tree: { name, meshes, children? }, read_ms }
//   (no poster: the card draws one from the mesh on first view; job `limitations` are shown in the card's details)
// The job goes through file-jobs-client.js (JOBS lane): the owner's canvas submits step-glb once the STEP original is
// stored (one idempotency key per card, converter and revision), every page reads the job's state, and once ready the
// card reads the mesh and structure derivatives of that revision; a shared or forked card with no job of its own reads
// the ready derivatives of its source revision and never starts a job.
import { useEffect, useState } from 'react';
import { canWrite, fileScope, scopeQuery } from './file-source-client.js';
import { FORK_PENDING_LABEL, fetchDerivatives, isTerminal, stageLabel, submitFileJob, watchFileJobs } from './file-jobs-client.js';

export const CAD_CONVERTER = { converter: 'step-glb', options: {} };
const STAGE = { queued: 'Queued for conversion', validating: 'Checking the STEP file', converting: 'Converting to a viewing mesh', preparing_preview: 'Preparing the preview' };
const KEPT = 'The original STEP file is kept.';

// The card's state: { state, label, retry }. Inputs: the card's fileRef, its job record, whether the mesh derivative was
// found, whether this page may submit, and a submit error.
export function cadCardState(fileRef, { job = null, mesh = false, owner = true, error = '' } = {}) {
  if (!fileRef) return { state: 'awaiting', label: `Awaiting converter: this card was made before STEP previews were stored. ${KEPT}`, retry: false };
  if (mesh) return { state: job?.state === 'ready_with_limitations' ? 'limited' : 'ready', label: '', retry: false };
  if (!fileRef.source?.id) return { state: 'saving', label: 'The STEP file is saving; its preview starts once it is stored.', retry: false };
  if (error) return { state: 'failed', label: `The STEP preview could not be started: ${error}. ${KEPT}`, retry: true };
  if (!fileRef.job) return owner ? { state: 'working', label: STAGE.queued, retry: false } : { state: 'pending', label: `${FORK_PENDING_LABEL}. ${KEPT}`, retry: false };
  if (!job || STAGE[job.state]) return { state: 'working', label: STAGE[job?.stage] || STAGE[job?.state] || stageLabel(job), retry: false };
  if (job.state === 'cancelled') return { state: 'cancelled', label: `Conversion cancelled. ${KEPT}`, retry: true };
  if (job.state === 'failed') return { state: 'failed', label: `The STEP preview could not be made${job.error ? `: ${job.error}` : ''}. ${KEPT}`, retry: true };
  return { state: 'working', label: STAGE.preparing_preview, retry: false }; // ready: reading the derivatives
}

// The STEP card's preview: submit (owner, once), watch the job, find the derivatives. update(fn) writes the job id in.
// Returns { ...cadCardState, meshUrl, structureUrl, limitations }.
export function useCadPreview(block, update) {
  const ref = block.fileRef, source = ref?.source, cad = block.model?.render === 'cad';
  const [found, setFound] = useState({ job: null, meshUrl: null, structureUrl: null, error: '' });
  const owner = canWrite();
  useEffect(() => {
    if (!cad || !source?.id || ref.job || !owner) return;
    const at = fileScope();
    submitFileJob(globalThis.fetch, { sourceId: source.id, sourceRev: source.rev, cardId: block.id, ...CAD_CONVERTER, app: at.app, board: at.board })
      .then(job => update(current => (current.fileRef?.job ? current : { ...current, fileRef: { ...current.fileRef, job: job.id } })),
        error => setFound(previous => ({ ...previous, error: error.message })));
  }, [cad, source?.id, ref?.job]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!cad || !source?.id) return undefined;
    const at = fileScope();
    let live = true;
    const read = async job => {
      const list = await fetchDerivatives(globalThis.fetch, { sourceId: source.id, rev: source.rev, ...CAD_CONVERTER, app: at?.app || null, board: at?.board || 'main', share: at?.share || null }).catch(() => null);
      if (!live || !list) return;
      const url = name => { const d = list.find(x => x.name === name); return d ? `/api/learn/files/${source.id}/d/${d.id}${scopeQuery(at)}` : null; };
      setFound(previous => ({ ...previous, job: job || previous.job, meshUrl: url('model.glb'), structureUrl: url('structure.json') }));
    };
    if (!ref.job) { read(null); return () => { live = false; }; } // a shared or forked card: the ready results of its revision
    const watch = watchFileJobs({ blocks: [block], fetchImpl: (u, init) => globalThis.fetch(u, init), share: at?.share || null, onJob: (_, job) => {
      if (!live) return;
      setFound(previous => ({ ...previous, job }));
      if (isTerminal(job) && (job.state === 'ready' || job.state === 'ready_with_limitations')) read(job);
    } });
    return () => { live = false; watch.stop(); };
  }, [cad, source?.id, ref?.job]); // eslint-disable-line react-hooks/exhaustive-deps
  const state = cadCardState(ref, { job: found.job, mesh: !!found.meshUrl, owner, error: found.error });
  return { ...state, meshUrl: found.meshUrl, structureUrl: found.structureUrl, limitations: found.job?.limitations || [] };
}

// The STEP length units the converter reports, as the card shows them, and how many of each make a metre (the mesh is
// in metres; a size is shown back in the file's own unit).
const UNITS = { millimetre: ['mm', 1000], centimetre: ['cm', 100], decimetre: ['dm', 10], metre: ['m', 1], kilometre: ['km', 0.001], micrometre: ['µm', 1e6], inch: ['in', 39.37007874015748], foot: ['ft', 3.280839895013123] };
// structure.json (+ the job's limitations) -> what the card shows: units only when the file declared one, part count.
export function cadFacts(structure, limitations = []) {
  if (!structure || typeof structure !== 'object') return { units: null, perMetre: null, parts: null, limitations: [] };
  const unit = UNITS[String(structure.source_unit || '').toLowerCase()] || null;
  const notes = [...(Array.isArray(limitations) ? limitations : []), ...(Array.isArray(structure.limitations) ? structure.limitations : [])].filter(l => typeof l === 'string');
  return { units: unit?.[0] || null, perMetre: unit?.[1] || null, parts: Number.isInteger(structure.parts) ? structure.parts : null, limitations: [...new Set(notes)].slice(0, 5) };
}

// The mesh and structure derivatives (URLs from useCadPreview, authorised through this page's scope); no redirects.
export async function fetchCadDerivatives({ meshUrl, structureUrl }, signal) {
  const get = async url => { const response = await fetch(url, { credentials: 'same-origin', redirect: 'error', signal }); if (!response.ok) throw new Error(`The CAD preview could not be read (${response.status})`); return response; };
  const mesh = new Uint8Array(await (await get(meshUrl)).arrayBuffer());
  const structure = structureUrl ? await (await get(structureUrl)).json().catch(() => null) : null;
  return { mesh, structure };
}
