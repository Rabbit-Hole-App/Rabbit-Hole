// Imported files' authorized references (docs/features/canvas-file-imports.md section 4.1): the file_source_refs rows written
// in the same batch as a board write (learn-migrations/0023). No imports, so canvases.js, dives.js and learn-boards.js can
// use it without an import cycle; file-access.js reads the rows.
// The source ids a board's saved state names through cards' fileRef.
// The card's own source and, for a model, its dependency files (fileRef.bundle: glTF .bin and textures, OBJ .mtl and textures).
export const fileRefSources = state => [...new Set((state?.blocks || []).flatMap(block => [block?.fileRef?.source?.id,
  ...(Array.isArray(block?.fileRef?.bundle) ? block.fileRef.bundle.map(part => part?.source?.id) : [])]).filter(id => typeof id === 'string'))];

// The board row exactly as this batch's write left it (canvas-refs.js GUARD): a rejected or stale save changes no reference.
const GUARD = 'EXISTS (SELECT 1 FROM learn_boards g WHERE g.id = ? AND g.state_json = ? AND g.version = COALESCE(?, g.version))';
// The reference rewrite for one board write, after the write in the same batch. version null: an unversioned save.
export function fileRefStatements(db, boardId, text, version, state, saver) {
  const ids = JSON.stringify(fileRefSources(state)), guard = [boardId, text, version ?? null];
  return [
    db.prepare(`DELETE FROM file_source_refs WHERE board_id = ? AND source_id NOT IN (SELECT value FROM json_each(?)) AND ${GUARD}`).bind(boardId, ids, ...guard),
    db.prepare(`INSERT OR IGNORE INTO file_source_refs (source_id, board_id) SELECT s.id, ? FROM json_each(?) j JOIN file_sources s ON s.id = j.value
      WHERE s.org = ? AND s.owner_email = ? AND ${GUARD}`).bind(boardId, ids, saver.org, saver.email, ...guard),
  ];
}
// A fork or duplicate: the references the board it was read from holds, for the sources its copied cards still name.
export const inheritFileRefs = (db, boardId, fromBoardId, state) => db.prepare(`INSERT OR IGNORE INTO file_source_refs (source_id, board_id)
  SELECT r.source_id, ? FROM file_source_refs r WHERE r.board_id = ? AND r.source_id IN (SELECT value FROM json_each(?))`).bind(boardId, fromBoardId, JSON.stringify(fileRefSources(state)));
// Before a board row is deleted, in the same batch: its references (the bytes stay; cleanup decides with retention).
export const dropFileRefs = (db, org, owner, app) => db.prepare('DELETE FROM file_source_refs WHERE board_id IN (SELECT id FROM learn_boards WHERE org = ? AND owner_email = ? AND app = ?)').bind(org, owner, app);

