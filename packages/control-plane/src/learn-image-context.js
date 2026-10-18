// One authorized image per question. Board references resolve only within the supplied, authorized row;
// uploaded references resolve only under the authenticated app identity. Neither accepts a caller's asset key.
import { getAsset, ownerRow } from './learn-boards.js';
import { isUploadedMediaId, MEDIA_UPLOAD_LIMIT, readUploadedMedia, sniffImageType, uploadedMediaTitle } from './learn-media.js';
import { paperIdentity } from './learn-paper.js';
import { base64 } from './token.js';
import { authorizeFileSource } from './file-access.js';

const unavailable = () => ({ blocks: [{ type: 'text', text: 'The referenced image is unavailable. Do not claim to see it; answer only from the available context.' }], notice: 'The image could not be read. Try attaching a PNG, JPEG or WebP under 5 MB again.' });
const imageBlocks = (bytes, title) => {
  const type = sniffImageType(bytes);
  if (!type || !bytes.length || bytes.length > MEDIA_UPLOAD_LIMIT) return unavailable();
  return { blocks: [{ type: 'text', text: `Image: ${uploadedMediaTitle(title)}` }, { type: 'image', source: { type: 'base64', media_type: type, data: base64(bytes) } }] };
};
export const imageCard = (state, id) => (Array.isArray(state?.blocks) ? state.blocks : []).find(block => block?.id === id && block.type === 'file' && block.kind === 'image');

// The caller has already authorized this row (owner, share or publication). No fallback to an original owner's upload.
export async function boardImageContext(env, row, block, expectedSource = null) {
  try {
    if (expectedSource && (expectedSource.id !== block?.fileRef?.source?.id || expectedSource.rev !== block?.fileRef?.source?.rev)) return unavailable();
    // fileRef is the current immutable revision. A retained legacy asset may be
    // the original before an accepted transform; never silently read it instead.
    if (block?.fileRef) {
      const ref = block.fileRef.source;
      if (!row?.id || typeof ref?.id !== 'string' || !/^[0-9a-f]{64}$/.test(ref?.rev || '')) return unavailable();
      // The caller already authorized row. This branch requires its indexed
      // source relationship; it does not use an owner identity or browser URL.
      const allowed = await authorizeFileSource(null, env, ref.id, { row });
      if (allowed instanceof Response || allowed.source.family !== 'image' || allowed.source.sha256 !== ref.rev) return unavailable();
      const object = await env.LEARN_MEDIA.get(allowed.source.r2_key);
      if (!object || object.size > MEDIA_UPLOAD_LIMIT) return unavailable();
      return imageBlocks(new Uint8Array(await object.arrayBuffer()), block.label || block.title);
    }
    if (!block?.assetKey) return unavailable();
    const response = await getAsset(env, row, block.assetKey);
    if (!response.ok) return unavailable();
    return imageBlocks(new Uint8Array(await response.arrayBuffer()), block.label || block.title);
  } catch { return unavailable(); }
}

export async function tutorImageContext(env, access, body) {
  const ref = body.image_context;
  if (ref === undefined) return { blocks: [] };
  if (!ref || typeof ref !== 'object' || Array.isArray(ref) || Object.keys(ref).length !== 1
      || !(typeof ref.block_id === 'string' && ref.block_id.length > 0 && ref.block_id.length <= 200 || isUploadedMediaId(ref.id))) {
    return { error: 'image_context must contain one block_id or uploaded image id', status: 400 };
  }
  if (ref.block_id) {
    const board = body.board ?? 'main';
    if (typeof board !== 'string' || !/^[A-Za-z0-9 _.-]{1,100}$/.test(board)) return { error: 'Invalid board', status: 400 };
    const row = env.LEARN_DB && await ownerRow(env, access, access.name, board);
    const block = row && imageCard(JSON.parse(row.state_json || '{}'), ref.block_id);
    if (!block) return { error: 'That image is not on this board.', status: 403 };
    return boardImageContext(env, row, block, body.image_source || null);
  }
  try {
    const media = await readUploadedMedia(env, paperIdentity(access), ref.id);
    return imageBlocks(media.bytes, media.title);
  } catch { return unavailable(); }
}
