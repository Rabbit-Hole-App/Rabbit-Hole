// CAD transport uses the existing authenticated API; polling observes jobs, never advances them.
export const CAD_ROOT = '/api/learn/cad/jobs';
const STAGES = { queued: 'Queued', preparing: 'Preparing design', waiting_for_answer: 'Waiting for your answer', building: 'Building geometry', checking: 'Checking', repairing: 'Repairing', exporting: 'Exporting', ready: 'Ready', failed: 'Failed', cancelled: 'Cancelled' };
export const cadStage = state => STAGES[state] || 'Checking status';
export const cadRunning = state => !['ready', 'failed', 'cancelled', 'waiting_for_answer'].includes(state);
export const cadArtifact = (manifest, kind, revisionId = manifest?.revisionId) => manifest && manifest.revisionId === revisionId ? manifest.artifacts?.find(artifact => artifact.kind === kind && artifact.url) || null : null;
export function mergeCadBlock(previous, incoming) {
  const layout = Object.fromEntries(['dx','dy','w','h','camera','cardLayout','locked'].filter(key => Object.hasOwn(previous || {}, key)).map(key => [key,previous[key]]));
  const next = { ...previous, ...incoming, ...layout };
  if ((incoming.awaitingAccept || incoming.proposedRevisionId || (incoming.baseRevisionId && incoming.status !== 'ready')) && previous?.revisionId) {
    next.proposedRevisionId = incoming.proposedRevisionId || (incoming.awaitingAccept ? incoming.revisionId : null);
    for (const key of ['revisionId','manifestUrl','thumbnailUrl','units','briefSummary','parameters','validation']) next[key] = previous[key];
  }
  if (!incoming.proposedRevisionId && !incoming.awaitingAccept) delete next.proposedRevisionId;
  return next;
}
export function cadContext(block) {
  return { kind:'CAD model', title:block.title, text: [`CAD model: ${block.title || 'Untitled'}`, `Model: ${block.modelId || ''}; revision: ${block.revisionId || 'pending'}`, `Units: ${block.units || 'not established'}`, typeof block.briefSummary==='string' ? block.briefSummary : JSON.stringify(block.briefSummary || {}), `Parameters: ${JSON.stringify(block.manifest?.parameters || block.parameters || {})}`, `Validation findings: ${JSON.stringify(block.manifest?.validation || block.validation || [])}`, 'Context contains saved metadata and preview, not exact geometry inspection.'].join('\n') };
}
export function cadClient(api, app, board = 'main') {
  const post = (path, body = {}) => api(path,{method:'POST',body:JSON.stringify({app,board,...body})});
  return {
    list: () => api(`${CAD_ROOT}?app=${encodeURIComponent(app)}&board=${encodeURIComponent(board)}`),
    get: id => api(`${CAD_ROOT}/${encodeURIComponent(id)}?app=${encodeURIComponent(app)}`),
    start: request => post(CAD_ROOT,{...request,confirmed:true}),
    action: (id,action,body) => post(`${CAD_ROOT}/${encodeURIComponent(id)}/${action}`,{...body,...(['retry','clarify'].includes(action)?{confirmed:true}:{})}),
  };
}

// Keep the same idempotency identity when a response is lost. A completed request
// is removed, so a later intentional generation can create another model.
export function submitCadOnce(pending, key, start, payload, makeId = () => crypto.randomUUID()) {
  let entry = pending.get(key);
  if (entry?.promise) return entry.promise;
  if (!entry) { entry = { payload: { ...payload, cardId: payload.cardId || makeId(), requestId: makeId() } }; pending.set(key,entry); }
  entry.promise = Promise.resolve().then(()=>start(entry.payload)).then(result=>{pending.delete(key);return result;},error=>{
    entry.promise=null;
    if(error.status && error.status<500)pending.delete(key);
    throw error;
  });
  return entry.promise;
}
