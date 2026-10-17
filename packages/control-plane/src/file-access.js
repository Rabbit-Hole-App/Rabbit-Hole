// Who may read an imported file (docs/features/canvas-file-imports.md section 4.1; owner decision D, 2026-10-16). One check
// for the original, its derivatives, dependencies, extracted text and job status: the source's owner, or anyone who may open
// a board whose saved state has a card referencing the source (fileRef.source.id). Board-view access grants the complete
// original even when the card previews only some pages, slides or sheets; it never reaches a source no card on that board
// names. An id alone is never access, and every refusal is the same 404, so a refusal does not say whether a source exists.
import { repositoryIdentity } from './repositories.js';
import { sharedAccess } from './learn-boards.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const NOT_AVAILABLE = () => json({ error: 'Not available' }, 404);

// The source ids a board's saved state references through cards' fileRef.
export const fileRefSources = state => [...new Set((state?.blocks || []).map(block => block?.fileRef?.source?.id).filter(id => typeof id === 'string'))];
const references = (row, sourceId) => { try { return fileRefSources(JSON.parse(row?.state_json || '{}')).includes(sourceId); } catch { return false; } };

// { source, via: 'owner' | 'board' | 'link', board? } or a Response (401 sign in, or 404).
// through: { token } a share or publication link the request carries; { row } a learn_boards row the caller has already
// authorized for this requester (their own board, a fork, or a member's board); none: only the source's owner.
export async function authorizeFileSource(req, env, sourceId, through = {}) {
  const source = typeof sourceId === 'string' && await env.LEARN_DB.prepare("SELECT * FROM file_sources WHERE id = ? AND status = 'stored'").bind(sourceId).first();
  if (!source) return NOT_AVAILABLE();
  if (through.token) {
    const found = await sharedAccess(req, env, through.token);
    if (found instanceof Response) return found.status === 401 ? found : NOT_AVAILABLE();
    return references(found.row, sourceId) ? { source, via: 'link', board: found.row } : NOT_AVAILABLE();
  }
  if (through.row) return references(through.row, sourceId) ? { source, via: 'board', board: through.row } : NOT_AVAILABLE();
  const viewer = await repositoryIdentity(req, env);
  if (viewer instanceof Response) return viewer;
  return viewer.org === source.org && viewer.email === source.owner_email ? { source, via: 'owner' } : NOT_AVAILABLE();
}
