// PDF excerpt canvas cards and their chat refs as the browser builds them (web/src/pdf-excerpt.js excerptChatRef), for the
// server tests of what a thread stores and sends. Rects are a long multi-line selection: 64 line boxes (pdf-anchor.js
// MAX_RECTS) at full float precision, the largest anchor the reader stores.
import { excerptChatRef } from '../../web/src/pdf-excerpt.js';

export const SOURCE = { key: 'doc:ctx:0123456789ab', sha256: 'a'.repeat(64), name: 'Attention.pdf', home: null };
const rects = Array.from({ length: 64 }, (_, i) => [72.12345678901 + i / 7, 700.98765432109 - i * 11.0371, 540.33333333333 + i / 3, 712.44444444441 - i * 11.0371]);
// A verbatim quote of `length` characters that is easy to find whole in a payload.
export const quoteOf = (length, mark = 'q') => Array.from({ length }, (_, i) => (i % 50 === 24 ? ' ' : String.fromCharCode(97 + ((i * 7 + mark.charCodeAt(0)) % 26)))).join('');
export function textExcerptCard(exact, { id = '2'.repeat(24), note = 'Compare with the figure on page 4' } = {}) {
  return { id: `card-${id.slice(0, 6)}`, type: 'explanation', title: `Attention.pdf · p. xii`, note, excerpt: {
    v: 1, id: `pdfx_${id}`, kind: 'text', source: SOURCE, page: { index: 12, label: 'xii' }, rotate: 0, view: [0, 0, 612, 792], rects,
    quote: { exact, prefix: 'p'.repeat(32), suffix: 's'.repeat(32) }, highlightId: `pdfh_${'3'.repeat(24)}`, crop: null, part: null } };
}
export function regionExcerptCard({ id = '4'.repeat(24), note = 'The green block' } = {}) {
  return { id: `card-${id.slice(0, 6)}`, type: 'file', label: 'Attention.pdf · p. xii', note, excerpt: {
    v: 1, id: `pdfx_${id}`, kind: 'region', source: SOURCE, page: { index: 12, label: 'xii' }, rotate: 90, view: [0, 0, 612, 792], rects: [rects[0]],
    quote: null, highlightId: `pdfh_${'5'.repeat(24)}`, crop: { source: { id: `fs_${'d'.repeat(24)}`, rev: 'e'.repeat(64) }, width: 300, height: 200 }, part: null } };
}
export { excerptChatRef };
