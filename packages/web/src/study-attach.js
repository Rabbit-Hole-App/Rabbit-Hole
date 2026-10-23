// Add pinned reference (Pinned Study lane 2; contract C:/s/spec/pinned-study/contract.md, spec section 6): the one ContextRef the
// shell hands to chat.addToChat for the pin at the reader's current location, and the read-only check that runs first.
// pinnedChatRef is pure: it reads its inputs, mutates neither and calls nothing. Attaching is the learner's explicit act;
// scrolling, changing the pin or restoring a layout never reach this file, and the ref returned is a snapshot, so an attached
// chip never follows the reader.
//   PDF pin: the pin's document or uploaded-paper ref at { page } (reader.page, a positive integer; 1 when the reader has none),
//     or, when reader.excerpt is a text selection inside that same PDF, that selection's own ref (pdf-excerpt.js excerptChatRef,
//     the ref the excerpt card's Add to chat sends): the words themselves rather than a page. Two pages are two chips and one
//     page is one (chat-context.js sameRef: source + range). Release 1 attaches no region (picture) excerpt: that needs
//     addToChat's fileRef option, so a region selection attaches its page.
//   Text or Explanation pin: the pin's ref as it is (the card's own ref, with the text it carries), never the card text added
//     to some other ref.
// Binding is source and location (the stable source id plus the page), not a version. A version or hash the ref already has
// (a non-empty ref.version, an excerpt's own identity) is kept as it is; doc and paper PDFs carry version '' today and no
// content hash exists on the client. versionStatus(ref) says which: the shell reads 'unavailable' as "version verification
// unavailable". Nothing here claims the bytes are the same ones; a content hash needs a server change and is reported, not built.
// authorizePinnedSource is the only function that reads the network: a status-only HEAD (else a GET aborted once its headers
// arrive) of the bytes route the reader itself uses. It never writes and never calls a model. A saved pin is not an access grant.
import { pdfBytesUrl, pdfKeyOfRef } from './pdf-source.js';
import { excerptChatRef } from './pdf-excerpt.js';

// null: nothing to attach (no pin, a source that is missing or unavailable, a page that is not a whole number from 1).
export function pinnedChatRef(pin, reader) {
  const ref = pin?.ref;
  if (!ref || typeof ref.sourceId !== 'string' || !ref.sourceId) return null;
  if (pin.kind !== 'pdf') return ref;
  const key = pdfKeyOfRef(ref);
  if (!key || reader?.unavailable === true) return null;
  const page = reader?.page ?? 1;
  if (!Number.isInteger(page) || page < 1) return null;
  const selected = reader?.excerpt?.source?.key === key ? excerptChatRef(reader.excerpt) : null;
  return selected || { ...ref, range: { page } };
}

// 'available' when the ref carries a version or hash of its own; 'unavailable' for a ref bound by source and location only.
export const versionStatus = ref => (ref && (String(ref.version || '') !== '' || String(ref.sourceId || '').startsWith('excerpt:')) ? 'available' : 'unavailable');

// Whether the pinned source may still be read, checked when Add pinned reference is pressed. { ok: true } or { ok: false, reason }.
// PDF: the same bytes route SourceReader opens (pdf-source.js pdfBytesUrl, as the learner's own session). Text or Explanation:
// the shell's cardExists(cardId), as the card is the source. fetchImpl is injectable for tests.
export async function authorizePinnedSource(pin, { fetchImpl = fetch, app, cardExists } = {}) {
  const no = reason => ({ ok: false, reason });
  if (!pin?.ref || typeof pin.ref.sourceId !== 'string') return no('missing');
  if (pin.kind !== 'pdf') return cardExists?.(pin.cardId) === true ? { ok: true } : no('card-missing');
  const key = pdfKeyOfRef(pin.ref), url = key && app ? pdfBytesUrl(app, key, pin.ref.home || null) : null;
  if (!url) return no('missing');
  const control = new AbortController();
  try {
    let response = await fetchImpl(url, { method: 'HEAD', signal: control.signal });
    if (response.status === 405 || response.status === 501) response = await fetchImpl(url, { method: 'GET', signal: control.signal });
    control.abort(); // headers are enough: the body is never read
    return response.ok ? { ok: true } : no(`status-${response.status}`);
  } catch {
    return no('network');
  }
}
