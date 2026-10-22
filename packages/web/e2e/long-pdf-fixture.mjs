// Long PDF fixtures (PDF-02), generated in code: `total` Letter pages, each with a text layer reading "Page <n> of <total>"
// and "Marker p<n>", plus any extra sentence `words[n]` on page n, then eight filler lines. Used by the unit tests (web context-doc-pages.test.mjs,
// control-plane pdf-pages.test.js) and by e2e/pdf-long-check.mjs. Plain PDF 1.4 with the standard Helvetica font: pdf.js
// draws and extracts it without any font file.
const esc = text => String(text).replace(/[\\()]/g, ch => `\\${ch}`);

export function longPdf(total, words = {}) {
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', null, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const kids = [];
  for (let n = 1; n <= total; n++) {
    // Filler lines give each page about 600 characters, as a real page has, so a question cannot carry every page.
    const filler = Array.from({ length: 8 }, (_, k) => `Line ${k + 1} of page ${n} keeps ordinary words here for length only.`);
    const lines = [`Page ${n} of ${total}`, `Marker p${n}`, ...(words[n] ? [words[n]] : []), ...filler];
    const stream = `BT /F1 14 Tf 72 720 Td ${lines.map((line, i) => `${i ? '0 -22 Td ' : ''}(${esc(line)}) Tj`).join(' ')} ET`;
    objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const contents = objs.length;
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contents} 0 R >>`);
    kids.push(`${objs.length} 0 R`);
  }
  objs[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${total} >>`;
  let out = '%PDF-1.4\n';
  const offsets = objs.map((obj, i) => { const at = out.length; out += `${i + 1} 0 obj\n${obj}\nendobj\n`; return at; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

// The sentence the long-PDF tests look for: only on this page of the 312-page fixture, well past page 100.
export const DEEP_PAGE = 250;
export const DEEP_WORDS = 'Sedimentation builds the river delta.';
