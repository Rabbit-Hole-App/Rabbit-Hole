import test from 'node:test';
import assert from 'node:assert/strict';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { assemble, capRects, rectsFor, regionAnchor, splitText, toPdfRect, toViewport, toViewportRect, EXCERPT_LIMIT } from './pdf-anchor.js';

// A one-page PDF with this MediaBox and /Rotate, so the viewports below are pdf.js's own.
function pdfBytes(box, rotate) {
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', `<< /Type /Page /Parent 2 0 R /MediaBox [${box.join(' ')}] /Rotate ${rotate} >>`];
  let out = '%PDF-1.4\n';
  const offsets = objs.map((obj, i) => { const at = out.length; out += `${i + 1} 0 obj\n${obj}\nendobj\n`; return at; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(out);
}
async function page(box, rotate) {
  const task = getDocument({ data: pdfBytes(box, rotate), isEvalSupported: false, useSystemFonts: true });
  const doc = await task.promise;
  return { doc: task, page: await doc.getPage(1) };
}
const close = (a, b, eps = 1e-6) => a.every((n, i) => Math.abs(n - b[i]) < eps);

test('a PDF rect round-trips through the viewport at every zoom and rotation, and is the same rect whatever the zoom', async () => {
  for (const rotate of [0, 90, 180, 270]) {
    const { doc, page: p } = await page([0, 0, 612, 792], rotate);
    const rect = [72, 100, 300, 160];
    let first = null;
    for (const scale of [0.5, 1, 1.5, 2.25, 4.5]) {
      for (const extra of [0, 90, 180, 270]) { // the reader's own Rotate page on top of the page's /Rotate
        const viewport = p.getViewport({ scale, rotation: (p.rotate + extra) % 360 });
        const px = toViewportRect(rect, viewport);
        assert.ok(px[0] < px[2] && px[1] < px[3], 'normalized');
        assert.ok(close(toPdfRect(px, viewport), rect), `round trip at rotate ${rotate}+${extra}, scale ${scale}`);
        const share = toViewport({ rects: [rect] }, viewport)[0];
        const back = toPdfRect([share.left * viewport.width, share.top * viewport.height, (share.left + share.width) * viewport.width, (share.top + share.height) * viewport.height], viewport);
        assert.ok(close(back, rect), 'fractions of the page box map back to the same rect');
        if (extra === 0) {
          // the same box on screen at another zoom: the region anchor stays the same PDF rect
          const anchor = regionAnchor(px, viewport).rects[0];
          if (first) assert.ok(close(anchor, first)); else first = anchor;
        }
      }
    }
    await doc.destroy();
  }
});

test('rotation 90 swaps the page box and maps a top-left PDF corner where pdf.js draws it', async () => {
  const { doc, page: p } = await page([0, 0, 612, 792], 90);
  const viewport = p.getViewport({ scale: 1 });
  assert.equal(viewport.width, 792); assert.equal(viewport.height, 612);
  // PDF (0, 792) is the unrotated top-left; at 90 degrees clockwise it lands top-right
  assert.ok(close(viewport.convertToViewportPoint(0, 792), [792, 0]));
  await doc.destroy();
});

test('a page box not at the origin keeps its own user space', async () => {
  const { doc, page: p } = await page([50, 50, 662, 842], 0);
  const viewport = p.getViewport({ scale: 2 });
  assert.ok(close(toPdfRect([0, 0, viewport.width, viewport.height], viewport), [50, 50, 662, 842]));
  await doc.destroy();
});

test('assemble joins pieces into line boxes, keeps paragraph breaks and every character', () => {
  const line = (y, x1, x2) => [x1, y, x2, y + 10];
  const { exact, lines } = assemble([
    { text: 'The first ', rect: line(700, 72, 130) }, { text: 'line', rect: line(700, 130, 160) },
    { text: 'second line', rect: line(688, 72, 150) },
    { text: 'well-', rect: line(676, 72, 100) }, { text: 'known', rect: line(664, 72, 110) },
    { text: 'New paragraph.', rect: line(640, 72, 170) },
  ]);
  assert.equal(exact, 'The first line second line well-known\n\nNew paragraph.');
  assert.equal(lines.length, 5);
  assert.deepEqual(lines[0].rect, [72, 700, 160, 710], 'one box per line, the union of its pieces');
  assert.equal(exact.slice(lines[4].start, lines[4].end), 'New paragraph.');
  assert.equal(exact.slice(lines[1].start, lines[1].end), 'second line');
});

test('capRects keeps at most 64 boxes covering every line', () => {
  const rects = Array.from({ length: 150 }, (_, i) => [72, 700 - i * 4, 500, 703 - i * 4]);
  const capped = capRects(rects);
  assert.ok(capped.length <= 64);
  assert.deepEqual([Math.min(...capped.map(r => r[1])), Math.max(...capped.map(r => r[3]))], [700 - 149 * 4, 703]);
  assert.equal(capRects(rects.slice(0, 10)).length, 10);
});

test('splitText cuts at paragraphs, then sentences, then spaces, each part within the limit and nothing lost', () => {
  const para = 'Alpha beta gamma. '.repeat(250).trim(); // 4499 chars
  const text = `${para}\n\n${para}\n\n${para}`;
  const parts = splitText(text);
  assert.equal(parts.map(([a, b]) => text.slice(a, b)).join(''), text, 'every character, in order');
  assert.ok(parts.every(([a, b]) => b - a <= EXCERPT_LIMIT));
  assert.equal(parts.length, 3);
  assert.ok(text.slice(...parts[0]).endsWith('\n\n'), 'cut after a paragraph break');
  const sentences = 'One sentence here. '.repeat(600); // no paragraph break
  const cut = splitText(sentences);
  assert.ok(sentences.slice(...cut[0]).endsWith('. '), 'cut after a sentence');
  assert.equal(cut.map(([a, b]) => sentences.slice(a, b)).join(''), sentences);
  const solid = 'x'.repeat(16001);
  assert.deepEqual(splitText(solid), [[0, 8000], [8000, 16000], [16000, 16001]], 'no boundary: exactly at the limit');
  assert.deepEqual(splitText('short'), [[0, 5]]);
  assert.equal(splitText('a'.repeat(8000)).length, 1, '8,000 is within the limit');
  assert.equal(splitText('a'.repeat(8001)).length, 2);
});

test('rectsFor gives a part only its own lines', () => {
  const lines = [{ start: 0, end: 10, rect: [0, 90, 1, 100] }, { start: 11, end: 20, rect: [0, 80, 1, 90] }, { start: 22, end: 30, rect: [0, 70, 1, 80] }];
  assert.deepEqual(rectsFor(lines, 0, 11), [[0, 90, 1, 100]]);
  assert.deepEqual(rectsFor(lines, 11, 30), [[0, 80, 1, 90], [0, 70, 1, 80]]);
});
