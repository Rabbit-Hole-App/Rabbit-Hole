import { toViewportRect } from './pdf-anchor.js';

// A region excerpt's picture (pdf-excerpts contract, pdf-crop.js): the PDF page itself rendered by pdf.js into an offscreen
// canvas, offset so only the region is drawn - no reader overlays, outline or padding. The longest side aims at 2000 px, never
// below the 72-dpi size (scale 1) unless the 4096 px side limit forces it; a PNG over 4 MiB steps the scale down, and one that
// still cannot fit is an error the reader shows.
export const CROP = { target: 2000, maxSide: 4096, maxBytes: 4 * 1024 * 1024, step: 0.75 };

// The first scale for a region of w x h points (scale 1).
export function cropScale(w, h, limits = CROP) {
  const long = Math.max(w, h);
  return Math.min(limits.maxSide / long, Math.max(1, limits.target / long));
}
// The next smaller scale after a PNG came out too large, or null below the readable floor (scale 1, or the side limit's scale).
export function smallerScale(scale, w, h, limits = CROP) {
  const floor = Math.min(1, limits.maxSide / Math.max(w, h));
  if (scale <= floor) return null;
  return Math.max(floor, scale * limits.step);
}

const png = canvas => new Promise((resolve, reject) => canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Could not create the image.'))), 'image/png'));

export async function renderCrop(pdfPage, anchor, limits = CROP) {
  const base = pdfPage.getViewport({ scale: 1 });
  const [x1, y1, x2, y2] = toViewportRect(anchor.rects[0], base);
  const w = x2 - x1, h = y2 - y1;
  if (!(w > 0 && h > 0)) throw new Error('Select a larger region.');
  for (let scale = cropScale(w, h, limits); scale; scale = smallerScale(scale, w, h, limits)) {
    const width = Math.max(1, Math.min(limits.maxSide, Math.round(w * scale))), height = Math.max(1, Math.min(limits.maxSide, Math.round(h * scale)));
    const viewport = pdfPage.getViewport({ scale, offsetX: -x1 * scale, offsetY: -y1 * scale });
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff'; context.fillRect(0, 0, width, height); // a page with no background paints white, as the reader shows it
    await pdfPage.render({ canvasContext: context, viewport }).promise;
    const blob = await png(canvas);
    if (blob.size <= limits.maxBytes) return { blob, width, height };
  }
  throw new Error('This region is too detailed to save as a readable image. Select a smaller region.');
}
