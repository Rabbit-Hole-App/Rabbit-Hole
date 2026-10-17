// DOC/DOCX/ODT/RTF -> PDF (+ page text, first-page poster) and PPTX/PPT/ODP -> PDF (+ slide PNGs,
// slide text and notes) with LibreOffice headless and poppler-utils. Files only: the sandbox has
// no network, so linked images or remote objects in a document are never fetched; LibreOffice
// runs macros only when signed and trusted, and this profile trusts nothing.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LIMITS } from '../contract.mjs';
import { pptxText } from './pptx-text.mjs';
import { textUnits } from './text-units.mjs';

function run(cmd, args, { timeoutMs = 240000, ...opts } = {}) {
  const r = spawnSync(cmd, args, { encoding: 'buffer', timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: 64 * 1024 * 1024, ...opts });
  if (r.error) throw Object.assign(new Error(`${cmd} could not run: ${r.error.code || r.error.message}`), { code: r.error.code === 'ETIMEDOUT' ? 'timeout' : 'converter_failure' });
  return r;
}

// The scratch /tmp and the job's out/ are different filesystems in the sandbox: copy, never rename.
const renameSync = (from, to) => { copyFileSync(from, to); rmSync(from); };

const PDF_FILTER = {
  writer: 'pdf:writer_pdf_Export',
  // Hidden slides included, so PDF page n is slide n (presentation order).
  impress: 'pdf:impress_pdf_Export:{"ExportHiddenSlides":{"type":"boolean","value":"true"},"ExportNotesPages":{"type":"boolean","value":"false"}}',
};

export function toPdf(input, work, app) {
  const outdir = join(work, 'pdf');
  mkdirSync(outdir, { recursive: true });
  const t0 = performance.now();
  const r = run('soffice', ['--headless', '--invisible', '--nologo', '--nodefault', '--nolockcheck', '--norestore', '--nofirststartwizard',
    `-env:UserInstallation=file://${join(work, 'lo-profile')}`, '--convert-to', PDF_FILTER[app], '--outdir', outdir, input], { cwd: work, env: { ...process.env, HOME: work } });
  const pdf = join(outdir, readdirSync(outdir).find(f => f.endsWith('.pdf')) || 'missing.pdf');
  if (!existsSync(pdf)) throw Object.assign(new Error(`LibreOffice produced no PDF (exit ${r.status}${r.signal ? `, ${r.signal}` : ''}): ${r.stderr.toString('utf8').slice(-400)}`), { code: r.signal ? 'converter_crashed' : 'invalid_source' });
  return { pdf, convert_ms: Math.round(performance.now() - t0) };
}

export function pdfInfo(pdf) {
  const r = run('pdfinfo', [pdf]);
  const text = r.stdout.toString('utf8');
  const pages = Number(text.match(/^Pages:\s+(\d+)/m)?.[1]);
  const size = text.match(/^Page size:\s+([\d.]+) x ([\d.]+) pts/m);
  if (!pages) throw Object.assign(new Error('the PDF has no pages'), { code: 'invalid_source' });
  return { pages, ...(size ? { page_size_pt: [Number(size[1]), Number(size[2])] } : {}) };
}

// One pdftotext call; pages are separated by form feeds.
export function pdfPageText(pdf, unitKey, maxChars = LIMITS.text_max_bytes) {
  const r = run('pdftotext', ['-enc', 'UTF-8', '-eol', 'unix', pdf, '-']);
  const pages = r.stdout.toString('utf8').split('\f');
  if (pages.length && pages.at(-1).trim() === '') pages.pop();
  let chars = 0, truncated = false;
  const units = [];
  pages.forEach((t, i) => {
    const text = t.replace(/[ \t]+\n/g, '\n').trim();
    if (chars + text.length > maxChars) { truncated = true; return; }
    chars += text.length;
    units.push({ [unitKey]: i + 1, text });
  });
  return { units, chars, truncated };
}

function pngs(pdf, outDir, { from, to, width, prefix }) {
  const r = run('pdftoppm', ['-png', '-f', String(from), '-l', String(to), '-scale-to-x', String(width), '-scale-to-y', '-1', pdf, join(outDir, prefix)]);
  if (r.status !== 0) throw Object.assign(new Error(`pdftoppm failed: ${r.stderr.toString('utf8').slice(-300)}`), { code: 'converter_failure' });
  // pdftoppm pads page numbers to the page count's width; rename to slide-NNN.png.
  const made = readdirSync(outDir).filter(f => f.startsWith(`${prefix}-`) && f.endsWith('.png'));
  return made.map(f => ({ f, n: Number(f.slice(prefix.length + 1, -4)) })).sort((a, b) => a.n - b.n);
}

const pngSize = b => (b.length > 24 && b.readUInt32BE(0) === 0x89504e47 ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null);

export function convertDocument({ input, kind, work, out, options = {} }) {
  const { pdf, convert_ms } = toPdf(input, work, 'writer');
  const info = pdfInfo(pdf);
  renameSync(pdf, join(out, 'preview.pdf'));
  const outputs = [{ name: 'preview.pdf', kind: 'preview', media_type: 'application/pdf', meta: info }];
  const text = pdfPageText(join(out, 'preview.pdf'), 'page');
  const shared = textUnits(text, 'page', info.pages);
  writeFileSync(join(out, 'text.json'), JSON.stringify(shared));
  outputs.push({ name: 'text.json', kind: 'text', media_type: 'application/json', meta: { units: 'pages', count: shared.units.length, chars: text.chars, complete: shared.complete } });
  if (options.poster !== false) {
    const [first] = pngs(join(out, 'preview.pdf'), work, { from: 1, to: 1, width: 800, prefix: 'poster' });
    if (first) { renameSync(join(work, first.f), join(out, 'poster.png')); outputs.push({ name: 'poster.png', kind: 'poster', media_type: 'image/png', meta: { page: 1, size: pngSize(readFileSync(join(out, 'poster.png'))) } }); }
  }
  const limitations = ['Layout rendered by LibreOffice; fonts, complex layout and embedded objects can differ from Word', 'Text comes from the PDF text layer by page: headings and list structure are not marked'];
  if (kind === 'doc') limitations.push('Legacy .doc: tracked changes and comments are not shown');
  if (!text.chars) limitations.push('No text layer found (a scanned document?); OCR was not run');
  return { outputs, coverage: { text: text.chars ? (text.truncated ? 'partial' : 'extracted') : 'none', units: 'pages', count: info.pages }, limitations, metrics: { libreoffice_ms: convert_ms } };
}

export function convertSlides({ input, kind, work, out, options = {} }) {
  const { pdf, convert_ms } = toPdf(input, work, 'impress');
  const info = pdfInfo(pdf);
  renameSync(pdf, join(out, 'preview.pdf'));
  const outputs = [{ name: 'preview.pdf', kind: 'preview', media_type: 'application/pdf', meta: { ...info, slides: info.pages } }];
  const from = Math.min(options.from || 1, info.pages), to = Math.min(options.to || info.pages, info.pages, from + LIMITS.slides_max_images - 1);
  const width = options.width || 1280;
  const t0 = performance.now();
  for (const { f, n } of pngs(join(out, 'preview.pdf'), work, { from, to, width, prefix: 'slide' })) {
    const name = `slide-${String(n).padStart(3, '0')}.png`;
    renameSync(join(work, f), join(out, name));
    outputs.push({ name, kind: 'slide', media_type: 'image/png', meta: { slide: n, size: pngSize(readFileSync(join(out, name))) } });
  }
  const images_ms = Math.round(performance.now() - t0);
  let text;
  if (kind === 'pptx') text = pptxText(readFileSync(input), { maxChars: LIMITS.text_max_bytes });
  else text = pdfPageText(join(out, 'preview.pdf'), 'slide');
  const shared = textUnits(text, 'slide', info.pages);
  writeFileSync(join(out, 'text.json'), JSON.stringify(shared));
  outputs.push({ name: 'text.json', kind: 'text', media_type: 'application/json', meta: { units: 'slides', count: shared.units.length, chars: text.chars, complete: shared.complete, notes: kind === 'pptx' } });
  const limitations = ['Slides rendered by LibreOffice: animations, transitions, video and embedded apps are not shown; fonts can differ'];
  if (to < info.pages || from > 1) limitations.push(`Slide images ${from}-${to} of ${info.pages}`);
  if (kind !== 'pptx') limitations.push('Speaker notes are not extracted from this format');
  if (text.units.some(u => u.hidden)) limitations.push('Hidden slides are included and marked hidden');
  return { outputs, coverage: { text: text.chars ? (text.truncated ? 'partial' : 'extracted') : 'none', units: 'slides', count: info.pages, images: [from, to] }, limitations, metrics: { libreoffice_ms: convert_ms, images_ms } };
}
