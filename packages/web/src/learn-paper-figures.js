import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { wsHeaders } from './api.js';
GlobalWorkerOptions.workerSrc = workerUrl;

// Render the actual cited PDF page, then crop it. No model-generated replacement.
export async function preparePaperFigures(plan, app) {
  const documents = new Map(), tasks = [];
  try {
    const blocks = [];
    for (const block of plan.blocks) {
      if (block.kind !== 'paper_figure') { blocks.push(block); continue; }
      const id = block.paper.id;
      if (!documents.has(id)) {
        const response = await fetch(`/api/learn/paper?app=${encodeURIComponent(app)}&id=${encodeURIComponent(id)}`, { headers: wsHeaders(), signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw new Error('Could not load the cited paper figure. Try again.');
        const data = new Uint8Array(await response.arrayBuffer());
        const task = getDocument({ data, isEvalSupported: false, disableFontFace: true, useSystemFonts: true });
        tasks.push(task); documents.set(id, await task.promise);
      }
      const document = documents.get(id);
      if (block.citation.page > document.numPages) throw new Error('The cited page does not exist in this paper.');
      const page = await document.getPage(block.citation.page), natural = page.getViewport({ scale: 1 });
      const scale = Math.min(2, 1400 / natural.width, Math.sqrt(4000000 / (natural.width * natural.height)));
      const viewport = page.getViewport({ scale });
      const canvas = window.document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      const { x, y, w, h } = block.crop;
      const crop = window.document.createElement('canvas'); crop.width = Math.max(1, Math.round(w * canvas.width)); crop.height = Math.max(1, Math.round(h * canvas.height));
      crop.getContext('2d').drawImage(canvas, x * canvas.width, y * canvas.height, w * canvas.width, h * canvas.height, 0, 0, crop.width, crop.height);
      blocks.push({ ...block, figure: { src: crop.toDataURL('image/png'), width: crop.width, height: crop.height, alt: block.text, url: `${block.paper.pdfUrl}#page=${block.citation.page}` } });
    }
    return { ...plan, blocks };
  } finally { await Promise.all(tasks.map(task => task.destroy())); }
}

export { getDocument };
