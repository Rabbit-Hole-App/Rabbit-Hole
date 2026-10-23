// Pinned Study (UI-27 Release 1): the references the Study pane reads and attaches, and where its rows sit. Pure: no React,
// no DOM. study-state.js holds the remembered arrangement; this holds what is built from the live canvas.
import { pdfRef } from './pdf-source.js';
import { objectName, selectionRef } from './selection-ref.js';
import { pinnedChatRef, versionStatus } from './study-attach.js';
import { eligible } from './study-state.js';

const textOf = (object, kind) => (kind === 'explanation'
  ? [object.title, object.body, ...(object.more || []).map(section => section.text)].filter(Boolean).join('\n\n')
  : String(object.text || ''));

// The ref the reader opens for a canvas object: a PDF's document ref (pdf-source.js pdfRef, the one Add to chat sends), or the
// card itself with its text as it is now, as the card's own Add to chat makes it (selection-ref.js). The version is whatever
// the ref carries; none is invented. null for anything Release 1 does not pin.
export function pinRef(object) {
  const kind = eligible(object);
  if (kind === 'pdf') return pdfRef(object);
  if (!kind) return null;
  return { ...selectionRef({ ids: [object.id], kind: 'card', name: objectName(object), content: textOf(object, kind) }) };
}

// The pin as the canvas holds it now: the stored pin gives only the card id and kind; the ref (a note's or an Explanation's
// text) is rebuilt from the live card. null when the card is gone or is no longer that kind.
export function currentPin(pin, object) {
  if (!pin || !object || object.id !== pin.cardId || eligible(object) !== pin.kind) return null;
  const ref = pinRef(object);
  return ref ? { ...pin, ref } : null;
}

// What Add pinned reference attaches (after the source is authorized again): the current pin at the reader's page, or the
// text selected in the pinned PDF (an excerpt draft) when there is one. null: nothing to attach.
export function pinnedAttachRef({ pin, object, reader = null, excerpt = null, unavailable = false }) {
  const now = currentPin(pin, object);
  return now ? pinnedChatRef(now, { page: reader?.page, excerpt, unavailable }) : null;
}

// The line under the pinned title when the ref has no version of its own (doc and paper PDFs): binding is source and place.
export const versionLine = ref => (ref && versionStatus(ref) === 'unavailable' ? 'Version verification unavailable' : null);

// Where the pane, the Notebook / Canvas row and the canvas go, in the slot parent's pixels. top: below the frame's top and any
// header floating over it; the working-view row has its own strip above the canvas, so it never lies over a card or a control.
export const SWITCH_ROW = 36;
export function studyOffsets({ layout, frameTop, top }) {
  const below = top - frameTop;
  if (layout.stacked) {
    const switchTop = top + layout.size;
    return { marginLeft: 0, marginTop: below + layout.size + SWITCH_ROW, paneTop: top, switchTop, switchLeft: 0, canvasTop: switchTop + SWITCH_ROW };
  }
  return { marginLeft: layout.size, marginTop: below + SWITCH_ROW, paneTop: top, switchTop: top, switchLeft: layout.size, canvasTop: top + SWITCH_ROW };
}
