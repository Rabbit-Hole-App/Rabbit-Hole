// Who may read an imported file (docs/features/canvas-file-imports.md section 4.1; owner decision D, 2026-10-16). One check
// for the original, its derivatives, dependencies, extracted text and job status: the source's owner, or anyone who may open
// a board that holds an authorized reference to the source. Board-view access grants the complete original even when the
// card previews only some pages, slides or sheets; it never reaches a source that board does not reference. An id alone is
// never access, and every refusal is the same 404, so a refusal does not say whether a source exists.
//
// An authorized reference is a file_source_refs row (learn-migrations/0023), written in the same batch as the board write:
// a save indexes the sources its cards name that the saver owns, and keeps a reference the board already held while a card
// still names it; a fork inherits the references of the board it was read through. So a card that merely names someone
// else's source id indexes nothing, and reads nothing.
import { repositoryIdentity } from './repositories.js';
import { sharedAccess } from './learn-boards.js';
import { fileRefSources } from './file-refs.js';

export { fileRefSources };

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const NOT_AVAILABLE = () => json({ error: 'Not available' }, 404);

const references = async (db, row, sourceId) => !!row?.id && !!(await db.prepare('SELECT 1 FROM file_source_refs WHERE source_id = ? AND board_id = ?').bind(sourceId, row.id).first());

// { source, via: 'owner' | 'board' | 'link', board? } or a Response (401 sign in, or 404).
// through: { token } a share or publication link the request carries; { row } a learn_boards row the caller has already
// authorized for this requester (their own board, a fork, or a member's board); none: only the source's owner.
export async function authorizeFileSource(req, env, sourceId, through = {}) {
  const db = env.LEARN_DB;
  const source = typeof sourceId === 'string' && await db.prepare("SELECT * FROM file_sources WHERE id = ? AND status = 'stored'").bind(sourceId).first();
  if (!source) return NOT_AVAILABLE();
  if (through.token) {
    const found = await sharedAccess(req, env, through.token);
    if (found instanceof Response) return found.status === 401 ? found : NOT_AVAILABLE();
    return await references(db, found.row, sourceId) ? { source, via: 'link', board: found.row } : NOT_AVAILABLE();
  }
  if (through.row) return await references(db, through.row, sourceId) ? { source, via: 'board', board: through.row } : NOT_AVAILABLE();
  const viewer = await repositoryIdentity(req, env);
  if (viewer instanceof Response) return viewer;
  return viewer.org === source.org && viewer.email === source.owner_email ? { source, via: 'owner' } : NOT_AVAILABLE();
}
