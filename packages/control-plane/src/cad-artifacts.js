// CAD uses the existing immutable file source/derivative store and read permissions.
import { learnMedia } from './learn-storage.js';
import { CAD_LIMITS, CAD_RUNTIME, cadHash, cadError } from './cad-contract.js';
import { uploadBody, clientMismatch } from './upload-body.js';
const NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const SHA = /^[a-f0-9]{64}$/;
export const cadStageKey = (job, name) => `cad-staging/${job.id}/${job.attempt}/${name}`;
export async function saveCadSource(env, job, source) {
  const bytes = new TextEncoder().encode(source), hash = await cadHash(bytes);
  const id = `fs_${(await cadHash(`${job.id}:${job.revisionId}:source`)).slice(0, 24)}`, key = `file-sources/${id}/original`;
  const bucket = learnMedia(env), previous = await bucket.head(key);
  if (previous && previous.customMetadata?.sha256 !== hash) throw cadError('This revision already has different source.', 409);
  if (!previous) await bucket.put(key, bytes, { sha256: hash, httpMetadata: { contentType: 'text/plain' }, customMetadata: { sha256: hash } });
  await env.LEARN_DB.prepare(`INSERT OR IGNORE INTO file_sources(id,org,owner_email,app,board_id,family,name,media_type,bytes,sha256,r2_key,status,created_at,stored_at)
    VALUES(?,?,?,?,?,'cad','model.py','text/plain',?,?,?,'stored',?,?)`).bind(id, job.owner.org, job.owner.email, job.app, job.boardId, bytes.length, hash, key, Date.now(), Date.now()).run();
  return { id, sha256: hash, bytes: bytes.length, key };
}
export async function putCadOutput(env, job, name, req) {
  if (!NAME.test(name)) throw cadError('Invalid artifact name');
  const length = Number(req.headers.get('content-length')), hash = req.headers.get('x-content-sha256');
  if (!SHA.test(hash || '') || !Number.isSafeInteger(length) || length <= 0 || length > CAD_LIMITS.artifactBytes) throw cadError('Artifact needs a bounded length and SHA-256', 413);
  const bucket = learnMedia(env), key = cadStageKey(job, name), old = await bucket.head(key);
  if (old) { if (old.customMetadata?.sha256 !== hash) throw cadError('Artifact is immutable', 409); return { name, bytes: length, sha256: hash }; }
  // Native streaming with R2 checksum verification; declared size is checked by R2 metadata afterwards.
  const upload=await uploadBody(req,{cap:length});
  if(upload.refused||upload.length!==length)throw cadError('Artifact length differs',422);
  try{await bucket.put(key, upload.body, { sha256: hash, customMetadata: { sha256: hash, bytes: String(length) } });}
  catch(error){if(await clientMismatch(upload,error))throw cadError('Artifact bytes differ from their declared size or checksum',422);throw error;}
  const head = await bucket.head(key);
  if (head.size !== length) { await bucket.delete(key); throw cadError('Artifact length differs', 422); }
  return { name, bytes: length, sha256: hash };
}
export function validateCadManifest(job, result) {
  if (result?.schema !== 'cad-execute-result/1' || result.job_id !== job.id || result.attempt !== job.attempt || result.revision_id !== job.revisionId) throw cadError('Result belongs to another revision', 409);
  if (!result.runtime || result.runtime.cadgen !== CAD_RUNTIME.cadgen) throw cadError('Unexpected CAD runtime', 422);
  const outputs = result.outputs;
  if (!Array.isArray(outputs) || !outputs.length || outputs.length > 12 || new Set(outputs.map(o => o.name)).size !== outputs.length || outputs.some(o => !NAME.test(o.name) || !SHA.test(o.sha256) || !Number.isSafeInteger(o.bytes) || o.bytes <= 0 || o.bytes > CAD_LIMITS.artifactBytes || !['step','glb','thumbnail','stl','3mf','validation'].includes(o.kind) || typeof o.media_type !== 'string' || o.media_type.length > 100)) throw cadError('Invalid CAD artifact manifest', 422);
  if (outputs.reduce((n, o) => n + o.bytes, 0) > CAD_LIMITS.totalBytes) throw cadError('CAD artifacts exceed total limit', 413);
  const kinds = new Set(outputs.map(o => o.kind));
  if (job.operation === 'export') { if (!kinds.has(job.exportFormat)) throw cadError('Requested export is missing', 422); }
  else if (!kinds.has('step')) throw cadError('Required STEP geometry is missing', 422);
  const validation = result.validation;
  if (!validation || validation.baselinePassed !== true || validation.units !== job.brief.units || !Array.isArray(validation.checks) || validation.checks.some(c => c.passed === false && c.status !== 'unchecked')) throw cadError('Independent geometry validation did not pass', 422);
  return result;
}
export async function publishCadArtifacts(env, job, result) {
  validateCadManifest(job, result);
  const bucket = learnMedia(env), now = Date.now(), rows = [];
  for (const out of result.outputs) {
    const key = cadStageKey(job, out.name), head = await bucket.head(key);
    if (!head || head.size !== out.bytes || head.customMetadata?.sha256 !== out.sha256) throw cadError('Artifact bytes do not match the manifest', 422);
    const id = `fd_${(await cadHash(`${job.id}:${job.attempt}:${out.name}`)).slice(0,24)}`, target = `file-sources/${job.source.id}/d/${id}`;
    if (!await bucket.head(target)) { const staged = await bucket.get(key); await bucket.put(target, staged.body, { sha256: out.sha256, httpMetadata: { contentType: out.media_type }, customMetadata: { sha256: out.sha256, source: job.source.id } }); }
    rows.push({ ...out, id, key: target });
  }
  await env.LEARN_DB.batch(rows.map(o => env.LEARN_DB.prepare(`INSERT OR IGNORE INTO file_derivatives(id,source_id,source_sha256,kind,name,converter,converter_version,options_hash,status,media_type,bytes,sha256,r2_key,coverage_json,created_at,updated_at)
    VALUES(?,?,?,?,?,'cad-execute',?,?,'ready',?,?,?,?,?,?,?)`).bind(o.id,job.source.id,job.source.sha256,o.kind,o.name,CAD_RUNTIME.cadgen,job.revisionId,o.media_type,o.bytes,o.sha256,o.key,JSON.stringify({units:job.brief.units}),now,now)));
  const artifacts = rows.map(o => ({ name:o.name, kind:o.kind, bytes:o.bytes, sha256:o.sha256, mediaType:o.media_type, url:`/api/learn/files/${job.source.id}/d/${o.id}` }));
  if (job.operation === 'export') return { ...job.manifest, artifacts: [...job.manifest.artifacts.filter(a => !artifacts.some(b => b.kind === a.kind)), ...artifacts] };
  return { schema:'cad-model/1', revisionId:job.revisionId, sourceId:job.source.id, title:job.brief.title, units:job.brief.units,
    parameters:job.brief.parameters, assumptions:job.brief.assumptions, validation:result.validation, runtime:result.runtime, timings:result.timings,
    artifacts:[{name:'model.py',kind:'source',bytes:job.source.bytes,sha256:job.source.sha256,mediaType:'text/plain',url:`/api/learn/files/${job.source.id}`}, ...artifacts] };
}
