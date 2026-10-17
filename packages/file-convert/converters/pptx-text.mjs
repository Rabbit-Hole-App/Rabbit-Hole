// Slide text and speaker notes from a PPTX, in presentation order, from the XML parts only (no
// rendering). Slide numbers are 1-based positions in ppt/presentation.xml's sldIdLst, the same
// numbering as the PDF LibreOffice exports with hidden slides included.
import { openZip } from './zip.mjs';

const decode = s => s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (m, e) => {
  const k = e.toLowerCase();
  if (k === 'lt') return '<'; if (k === 'gt') return '>'; if (k === 'amp') return '&'; if (k === 'quot') return '"'; if (k === 'apos') return "'";
  const n = k.startsWith('#x') ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
  return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
});

// Paragraph text: <a:t> runs joined, one line per <a:p>, <a:br/> a line break.
function paragraphs(xml) {
  const out = [];
  for (const p of xml.match(/<a:p[\s>][\s\S]*?<\/a:p>/g) || []) {
    const line = (p.match(/<a:t>[\s\S]*?<\/a:t>|<a:t\/>|<a:br\/>|<a:br [^>]*\/>/g) || [])
      .map(t => (t.startsWith('<a:br') ? '\n' : decode(t.replace(/^<a:t>|<\/a:t>$/g, '').replace('<a:t/>', '')))).join('');
    if (line.trim()) out.push(line.trim());
  }
  return out.join('\n');
}

const rels = xml => Object.fromEntries([...(xml || '').matchAll(/<Relationship\b([^>]*)\/?>/g)].map(([, a]) => [a.match(/\bId="([^"]+)"/)?.[1], { target: a.match(/\bTarget="([^"]+)"/)?.[1], type: a.match(/\bType="([^"]+)"/)?.[1] || '' }]));
const resolve = (base, target) => {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/').slice(0, -1);
  for (const seg of target.split('/')) { if (seg === '..') parts.pop(); else if (seg !== '.') parts.push(seg); }
  return parts.join('/');
};

export function pptxText(buf, { maxChars = 4 * 1024 * 1024 } = {}) {
  const z = openZip(buf);
  const str = n => z.read(n)?.toString('utf8') ?? null;
  const pres = str('ppt/presentation.xml');
  if (!pres) throw new Error('not a PPTX: ppt/presentation.xml is missing');
  const presRels = rels(str('ppt/_rels/presentation.xml.rels'));
  const ids = [...(pres.match(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/)?.[0] || '').matchAll(/<p:sldId\b[^>]*\br:id="([^"]+)"/g)].map(m => m[1]);
  const size = pres.match(/<p:sldSz\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/);
  let chars = 0, truncated = false;
  const units = [];
  ids.forEach((rid, i) => {
    const target = presRels[rid]?.target;
    if (!target) return;
    const part = resolve('ppt/presentation.xml', target);
    const xml = str(part) || '';
    const unit = { slide: i + 1, text: paragraphs(xml) };
    if (/<p:sld\b[^>]*\bshow="(0|false)"/.test(xml)) unit.hidden = true;
    const slideRels = rels(str(part.replace(/([^/]+)$/, '_rels/$1.rels')));
    const notesRel = Object.values(slideRels).find(r => r.type.endsWith('/notesSlide'));
    if (notesRel) {
      const notesXml = str(resolve(part, notesRel.target)) || '';
      // Only the notes body placeholder: not the slide image or the slide number.
      const body = (notesXml.match(/<p:sp>[\s\S]*?<\/p:sp>/g) || []).filter(sp => /<p:ph\b[^>]*type="body"/.test(sp)).map(paragraphs).join('\n').trim();
      if (body) unit.notes = body;
    }
    const n = unit.text.length + (unit.notes?.length || 0);
    if (chars + n > maxChars) { truncated = true; return; }
    chars += n;
    units.push(unit);
  });
  return { units, chars, truncated, slides: ids.length, ...(size ? { slide_size_emu: { cx: Number(size[1]), cy: Number(size[2]) } } : {}) };
}
