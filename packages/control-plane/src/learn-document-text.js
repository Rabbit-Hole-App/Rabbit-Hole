// The text side of a dropped document (docs/features/learn-sections/roadmap-unplug-spec.md section B): pure, no model and no storage, so the overview builder (learn-index.js) and the
// store (learn-document.js) both import it without a cycle.
//
//   sectionsOf({ kind, name, text, pages }) -> [{ key, title, text }]   markdown: one section per heading ('#intro'); pdf: one per page ('p.3')
//   documentSnapshot({ sha, name, kind, sections }) -> a snapshot { version: 'document-1', repo: 'file:<sha>', commit: <sha>, files: { <key>: text }, graph } the repository tools read
//   documentDigest(snapshot) -> the text the overview is written from (outline first, then the first 24 KB)
export const DOC_KINDS = ['markdown', 'pdf'];
export const DOC_TEXT_MAX = 512 * 1024, DOC_PAGES_MAX = 400, DOC_NAME_MAX = 200, DIGEST_TEXT_BYTES = 24 * 1024, OUTLINE_MAX = 150;

export async function sha256(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2, '0')).join('');
}
// What is hashed and stored: markdown its text; a pdf its pages' text in order, one form feed between pages.
export const fullText = ({ kind, text, pages }) => (kind === 'pdf' ? (pages || []).join('\f') : String(text ?? ''));

const slugOf = title => String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'section';
export function sectionsOf({ kind, name = 'document', text = '', pages = [] }) {
  if (kind === 'pdf') return pages.map((page, i) => ({ key: `p.${i + 1}`, title: `Page ${i + 1}`, text: String(page || '') })).filter(s => s.text.trim());
  const sections = [], seen = new Map();
  let current = { key: '#start', title: 'Start', lines: [] }, fenced = false;
  const close = () => { const body = current.lines.join('\n'); if (body.trim()) sections.push({ key: current.key, title: current.title, text: body }); };
  for (const line of String(text).split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const heading = !fenced && /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      close();
      const slug = slugOf(heading[1]), n = (seen.get(slug) || 0) + 1; seen.set(slug, n);
      current = { key: `#${n > 1 ? `${slug}-${n}` : slug}`, title: heading[1].trim().slice(0, 120), lines: [line] };
    } else current.lines.push(line);
  }
  close();
  if (sections.length === 1 && sections[0].key === '#start') sections[0] = { ...sections[0], key: '#document', title: String(name).slice(0, 120) };
  return sections;
}

export function documentSnapshot({ sha, name, kind, sections }) {
  const files = Object.fromEntries(sections.map(s => [s.key, s.text]));
  return {
    version: 'document-1', repo: `file:${sha}`, commit: sha, name, docKind: kind, files, skipped: [],
    graph: { nodes: sections.map(s => ({ id: s.key, label: s.title, path: s.key, line: 1 })), edges: sections.slice(1).map((s, i) => ({ source: sections[i].key, target: s.key, relation: 'next', confidence: 'EXTRACTED' })) },
  };
}
export const isDocumentSnapshot = snapshot => snapshot?.version === 'document-1';

export function documentDigest(snapshot) {
  const keys = Object.keys(snapshot.files || {}), titleOf = key => (snapshot.graph?.nodes || []).find(n => n.id === key)?.label || key;
  const out = [`Document: ${snapshot.name} (${snapshot.docKind === 'pdf' ? `PDF, ${keys.length} pages with text` : `Markdown, ${keys.length} sections`})`, '', `Outline (${Math.min(keys.length, OUTLINE_MAX)} of ${keys.length} sections, in order; each line is the anchor, the title, the length):`];
  for (const key of keys.slice(0, OUTLINE_MAX)) out.push(`${key} | ${titleOf(key)} | ${snapshot.files[key].length} characters`);
  out.push('', `Text (the first ${DIGEST_TEXT_BYTES / 1024} KB, in order):`);
  let budget = DIGEST_TEXT_BYTES;
  for (const key of keys) {
    if (budget <= 0) break;
    const text = snapshot.files[key].slice(0, budget); budget -= text.length;
    out.push(`--- ${key} | ${titleOf(key)}`, text);
  }
  return out.join('\n');
}


