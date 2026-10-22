// /explain v2 context refs (EXP-T20 slice 3, Lane L2; job API C:/s/spec/explain/job-api-c.md). The Chat's pinned refs and its
// temporary code refs (repository graph or Files selections, graph-card nodes) reach an /explain job as ContextRefs, exactly as
// a question sends them, and are read here, on the server, under the asker's own access - never from text the browser sent.
//   code: cardCodeRefs (readableVersion: a public repository, or one this learner imported, at the ref's own commit).
//   file: fileContext (authorizeFileSource on this canvas; bounded excerpts of ready text derivatives).
// Every other kind is named only (status 'listed'): the job's author sees that it was attached, not its contents.
import { contextRefs } from './chat-modes.js';
import { cardCodeRefs } from './repositories.js';
import { fileContext } from './file-context.js';

export const EXPLAIN_REF_TEXT = 24000; // the resolved text's cap; the job's whole context stays under its 60 KB limit

// -> { refs: [{ sourceId, kind, name, status }], text } for the job's context, or throws (status 400) on malformed refs.
// ctx: { user: { org, email }, board: { app } } as explainRoute has them. deps: the readers, injected by tests.
export async function resolveExplainRefs(req, env, { user, board }, value, { code = cardCodeRefs, files = fileContext } = {}) {
  let refs;
  try { refs = contextRefs(value); } catch (error) { throw Object.assign(new Error(error.message), { status: 400 }); }
  const parts = [], status = new Map();
  const codeRefs = refs.filter(ref => ref.kind === 'code');
  if (codeRefs.length) {
    const entities = await code(env, user, codeRefs, null).catch(() => codeRefs.map(() => null));
    codeRefs.forEach((ref, i) => {
      const entity = entities[i];
      status.set(ref, entity?.status || 'unavailable');
      if (entity && entity.status !== 'unavailable') parts.push(`Code ${JSON.stringify(ref.name)}: ${JSON.stringify(entity)}`);
    });
  }
  const fileRefs = refs.filter(ref => ref.kind === 'file');
  if (fileRefs.length) {
    const got = await files(req, env, fileRefs, { user, app: board.app }).catch(() => null);
    for (const ref of fileRefs) status.set(ref, got?.coverage?.get(`${ref.sourceId}|${JSON.stringify(ref.range ?? null)}`) || 'unavailable');
    if (got?.blocks?.length) parts.push(...got.blocks);
  }
  return {
    refs: refs.map(ref => ({ sourceId: ref.sourceId, kind: ref.kind, name: ref.name, status: status.get(ref) || 'listed' })),
    text: parts.join('\n\n').slice(0, EXPLAIN_REF_TEXT),
  };
}
