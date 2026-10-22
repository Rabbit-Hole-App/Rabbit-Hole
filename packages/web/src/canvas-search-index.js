// Current-canvas Search. Pure and unbudgeted: callers supply only already-authorized live data.
// No fetch, model, OCR, persisted mutation, or inference from URL-looking prose.
import { cardText } from './canvas-semantics.js';
import { docText } from './doc-text.js';
import { pdfRef } from './pdf-source.js';
import { validSources } from './card-sources.js';
import { cadArtifact } from './cad-client.js';
import { codeLang } from './code-lang.js';

export const SEARCH_FILTERS = ['all', 'cards', 'text', 'comments', 'references', 'links', 'code', 'rabbit-holes'];
const string = value => typeof value === 'string' ? value : '';
const at = (collection, id) => collection instanceof Map ? collection.get(id) : collection?.[id];
const array = value => Array.isArray(value) ? value : [];
const CODE = new Set(['repo-code', 'code', 'snippet', 'code-exercise', 'notebook']);
const fields = (key, text, kind = 'card', location) => string(text) ? [{ key, text, kind, location }] : [];
const safeReference = ref => ref.unavailable ? { id: ref.id, target: ref.target, kind: ref.kind || 'canvas', unavailable: true } : ref;
const referenceKey = ref => JSON.stringify([ref.kind, ref.id || ref.target || ref.sourceId || ref.url || ref.arxiv || ref.path, ref.page, ref.lines]);
function referencesFor(object, supplied) {
  const refs = [...array(supplied)];
  for (const ref of array(object.refs)) if (!refs.some(value => value.id === ref.id || value.target === ref.target)) refs.push({ ...ref, kind: 'canvas' });
  for (const ref of validSources(object.sources)) if (ref.kind !== 'calculation') refs.push(ref);
  if (object.type === 'repo-code' && object.source?.kind === 'repository') refs.push({ kind: 'code', ...object.source });
  const pdf = pdfRef(object);
  if (pdf) refs.push({ ...pdf, kind: 'pdf', title: pdf.name, page: pdf.range?.page });
  if (object.type === 'paper' && object.paper?.id) refs.push({ kind: 'paper', id: object.paper.id, title: object.title, page: object.paper.page, arxiv: object.paper.id });
  const seen = new Set();
  return refs.map(safeReference).filter(ref => { const key = referenceKey(ref); if (seen.has(key)) return false; seen.add(key); return true; });
}
function notebookFields(object) {
  const names = [...new Set([object.ipynb_path || 'notebook.ipynb', object.active_path, ...array(object.files)].filter(value => typeof value === 'string' && value))];
  return [...names.flatMap((name, i) => fields(`name:${i}`, name, 'metadata', { path: name })), ...array(object.ipynb?.cells).flatMap((cell, position) => {
    const location = { cell: cell.id || String(position + 1), path: object.ipynb_path || 'notebook.ipynb' };
    const source = Array.isArray(cell.source) ? cell.source.join('') : string(cell.source);
    // Text outputs are already stored. Images/HTML are not turned into searchable text.
    const outputs = array(cell.outputs).map(output => output.output_type === 'stream' ? [].concat(output.text || '').join('') : output.output_type === 'error' ? `${output.ename || ''}: ${output.evalue || ''}` : [].concat(output.data?.['text/plain'] || '').join('')).filter(Boolean);
    return [...fields(`cell:${position}`, source, 'card', location), ...outputs.flatMap((text, i) => fields(`cell:${position}:output:${i}`, text, 'card', location))];
  })];
}
// A result's compact preview (UI-12, owner brief 2026-10-21 message 21 item 1): only what the board already holds - the
// picture its card itself shows, a cached poster, a stored thumbnail path, the code text - never source bytes, a renderer or
// a model. kind 'picture' reserves a thumbnail slot (an icon when none loads), 'code' an excerpt, 'text' neither.
const canvasName = href => /^\/apps\/([^/?#]+)/.exec(string(href))?.[1] || null;
export function searchPreviewOf(object, kind, references = []) {
  if (kind === 'item' && object.mode === 'code') return { kind: 'code', language: codeLang(object), text: string(object.text) };
  if (kind !== 'card') return { kind: 'text' };
  if (object.type === 'canvas-ref') { const ref = references.find(value => value.kind === 'canvas' && !value.unavailable); return { kind: 'picture', label: 'Canvas', canvas: canvasName(ref?.href), relation: 'Link card on this canvas' }; }
  if (CODE.has(object.type) || object.mode === 'code') return { kind: 'code', language: string(object.language) || 'text', path: string(object.source?.path || object.source?.name || object.ipynb_path), text: string(object.code ?? object.draft ?? object.starter) };
  if (object.type === 'video') return { kind: 'picture', label: 'Video', ...(/^[\w-]{11}$/.test(string(object.videoId)) ? { src: `https://i.ytimg.com/vi/${object.videoId}/mqdefault.jpg` } : {}) };
  if (object.type === 'image') {
    const variants = array(object.variants).length ? object.variants : [{ src: object.src, cacheKey: object.cacheKey }];
    const shown = variants[Math.max(0, Math.min(object.variant ?? variants.length - 1, variants.length - 1))] || {};
    return { kind: 'picture', label: 'Image', ...(string(shown.src) ? { src: shown.src } : string(shown.cacheKey) ? { asset: shown.cacheKey } : {}) };
  }
  if (object.type === 'cad') { const path = string(object.thumbnailUrl) || string(cadArtifact(object.manifest, 'thumbnail')?.url); return { kind: 'picture', label: '3D model', ...(path ? { path } : {}) }; }
  if (object.type === 'file' && object.kind === 'model') return { kind: 'picture', label: '3D model', poster: object.id };
  if (object.type === 'file' && object.kind === 'image' && !object.fileRef && string(object.assetKey)) return { kind: 'picture', label: 'Image', asset: object.assetKey };
  // ponytail: PDF, paper and slide pages are drawn only by pdf.js (a live renderer), so they keep the compact fallback.
  if (object.type === 'file' || object.type === 'paper' || object.type === 'pdf' || (object.type === 'slide' && object.pdf)) return { kind: 'picture', label: object.type === 'paper' ? 'Paper' : object.kind === 'pdf' || object.type === 'pdf' || object.pdf ? 'PDF' : 'File' };
  return { kind: 'text' };
}
// Up to CODE_LINES lines of a code result's text from its match (or its first lines when browsing), numbered as stored.
export const CODE_LINES = 3;
function codeExcerpt(preview, entry, first, matcher) {
  const units = entry.fields.filter(field => field.kind === 'source' && Number.isInteger(field.location?.start));
  if (units.length) {
    const at = Math.max(0, units.indexOf(first?.field));
    return units.slice(at, at + CODE_LINES).map(unit => ({ n: unit.location.start, text: unit.text.split('\n')[0] }));
  }
  // A notebook's excerpt is its matched (or first) cell.
  const cell = [first?.field, ...entry.fields].find(field => field?.kind === 'card' && field.location?.cell != null);
  const lines = (cell?.text ?? preview.text).split('\n');
  const hit = matcher ? Math.max(0, lines.findIndex(line => { matcher.lastIndex = 0; return matcher.test(line); })) : 0;
  const excerpt = lines.slice(hit, hit + CODE_LINES).map((text, i) => ({ n: hit + i + 1, text }));
  return excerpt.some(line => line.text.trim()) ? excerpt : [];
}
function availabilityFor(object, loaded) {
  if (loaded) return { status: loaded.status || (loaded.complete === false ? 'partial' : 'ready'), ...(loaded.limited ? { limited: loaded.limited, message: loaded.limited } : loaded.message ? { message: loaded.message } : {}) };
  if (object.type === 'notebook' && (!object.ipynb?.cells || [object.active_path, ...array(object.files)].some(path => path && path !== (object.ipynb_path || 'notebook.ipynb')))) return { status: 'partial', message: 'Stored notebook text and file names only; other workspace file bodies are not read.' };
  if (object.type === 'paper' || (object.type === 'slide' && object.pdf)) return { status: 'partial', message: 'Only the paper or page title and reference metadata are available to Search.' };
  if (object.type === 'image') return { status: 'partial', message: 'Image labels and supplied captions only; no OCR.' };
  if (object.type === 'repo-code' || object.type === 'file' || object.type === 'pdf') return { status: 'partial', message: 'Only the file name is available to Search.' };
  return { status: 'ready' };
}
function objectEntry(object, kind, suppliedRefs, children, loaded) {
  if (!object?.id || object.redacted || object.unavailable) return null;
  // An explicitly denied source may not retain private filename/path metadata in the index.
  if ((object.type === 'repo-code' || object.type === 'repo-graph') && loaded?.status === 'unavailable') return null;
  const canvasTarget = object.type === 'canvas-ref' ? object.refs?.[0]?.target : null;
  const resolvedCanvas = canvasTarget ? array(suppliedRefs).find(ref => ref.target === canvasTarget) : null;
  if (resolvedCanvas) object = { ...object, title: resolvedCanvas.unavailable ? '' : resolvedCanvas.title || '', label: '', text: '' };
  const title = string(object.title || object.label || object.name || object.question || object.prompt);
  const references = referencesFor(object, suppliedRefs), rabbitHoles = children.filter(child => child.origin_block_id === object.id && !child.unavailable && !child.pending);
  const categories = [kind === 'card' ? 'cards' : 'text'];
  if (CODE.has(object.type) || object.mode === 'code') categories.push('code');
  if (references.length) categories.push('references');
  if (rabbitHoles.length) categories.push('rabbit-holes');
  let content;
  if (object.type === 'notebook') content = notebookFields(object);
  else if (kind === 'card') {
    const body = { ...object };
    // Title is a separate ranked field, not duplicated by the generic visible-card helper.
    for (const key of ['title', 'label', 'name', 'question', 'prompt']) if (body[key] === title) delete body[key];
    content = fields('body', cardText(body));
  } else content = fields('body', object.kind === 'equation' ? object.latex : object.text || object.label);
  if (content.length === 1 && content[0].text === title) content = [];
  const referenceFields = references.filter(ref => !ref.unavailable).flatMap((ref, i) => fields(`reference:${i}`, [object.type === 'canvas-ref' && ref.title === title ? '' : ref.title, ref.name, ref.path, ref.symbol, ref.page ? `page ${ref.page}` : '', ref.lines ? `lines ${ref.lines.join('-')}` : ''].filter(Boolean).join('\n'), 'reference'));
  const sourceName = object.type === 'repo-code' && object.source?.kind === 'upload' && object.source.name !== title ? fields('name:source', string(object.source.name), 'metadata', { path: object.source.name }) : [];
  const sourceFields = loaded && ['ready', 'partial'].includes(loaded.status) ? array(loaded.units).flatMap((unit, i) => fields(`source:${i}`, unit.text, 'source', unit.loc)) : [];
  return { id: `object:${object.id}`, objectId: object.id, kind, preview: searchPreviewOf(object, kind, references), title: title || (object.type === 'notebook' ? 'Notebook' : object.kind === 'equation' ? 'Equation' : kind === 'card' ? 'Card' : 'Text'), categories, references, rabbitHoles, availability: availabilityFor(object, loaded), sourceKey: loaded?.sourceKey,
    target: { kind: 'object', id: object.id }, fields: [...fields('title', title), ...sourceName, ...content, ...referenceFields, ...rabbitHoles.flatMap((child, i) => fields(`child:${i}`, child.title, 'reference')), ...sourceFields] };
}
// Links (the former Links tab, brief section 7): one result per destination canvas, as the server grouped them (GET
// /api/learn/links, already filtered for this viewer). from: this canvas's references to a target; to: backlinks from a source.
// An unavailable target keeps no title or path, only its origin cards on this canvas.
function linkEntry(direction, key, group) {
  const unavailable = !!group.unavailable, title = unavailable ? 'Unavailable canvas' : string(group.title).trim() || 'Untitled canvas';
  const cards = array(group.refs).map(ref => ({ id: ref.id, object: ref.object, title: string(ref.objectTitle).trim() || 'Untitled card', href: ref.href }));
  return { id: `link:${direction}:${key}`, objectId: null, kind: 'link', preview: { kind: 'picture', label: 'Canvas', canvas: unavailable ? null : canvasName(group.href) }, title, categories: ['links'], references: [], rabbitHoles: [], availability: { status: 'ready' },
    link: { direction, unavailable, href: unavailable ? null : group.href, cards }, location: direction === 'from' ? 'Linked from this canvas' : 'Links here (backlink)',
    target: { kind: 'link', id: key }, fields: [...(unavailable ? [] : fields('title', title)), ...cards.flatMap((card, i) => fields(`card:${i}`, card.title, 'reference'))] };
}
export const createSearchIndex = () => ({ scopeKey: null, revision: null, entries: new Map(), inputs: new Map() });
export function updateSearchIndex(previous, input) {
  const old = previous?.scopeKey === input.scopeKey ? previous : createSearchIndex();
  const entries = new Map(), inputs = new Map(), board = input.board || {}, children = array(input.children);
  const put = (id, dependencies, make) => {
    const before = old.inputs.get(id);
    let entry = before && dependencies.every((value, i) => Object.is(value, before[i])) ? old.entries.get(id) : make();
    if (!entry) return;
    // Geometry/style-only object replacement keeps the cached extracted entry and its preview key.
    const previousEntry = old.entries.get(id);
    if (entry !== previousEntry && previousEntry && JSON.stringify(entry) === JSON.stringify(previousEntry)) entry = previousEntry;
    entries.set(id, entry); inputs.set(id, dependencies);
  };
  const visited = new Set();
  for (const [list, kind] of [['blocks', 'card'], ['exchanges', 'card'], ['items', 'item'], ['shapes', 'shape'], ['links', 'shape']]) for (const object of array(board[list])) {
    if (!object?.id || visited.has(object.id)) continue;
    visited.add(object.id);
    const refs = at(input.references, object.id), loaded = at(input.loadedContent, object.id);
    const childKey = JSON.stringify(children.filter(child => child.origin_block_id === object.id));
    put(`object:${object.id}`, [object, refs, loaded, childKey], () => {
      const entry = objectEntry(object, kind, refs, children, loaded);
      if (entry && list === 'exchanges') entry.fields.push(...fields('answer', string(object.answer)));
      return entry;
    });
  }
  const walk = (blocks, path = []) => array(blocks).forEach((block, position) => {
    const id = block.id || `position:${[...path, position].join('.')}`;
    if (docText([{ ...block, children: [] }]).trim()) put(`document:${id}`, [block], () => ({ id: `document:${id}`, objectId: 'doc', kind: 'document', title: block.type === 'heading' ? docText([{ ...block, children: [] }]).replace(/^#+\s*/, '') : 'Canvas document', categories: ['text', ...(block.type === 'codeBlock' ? ['code'] : [])], references: [], rabbitHoles: [], availability: { status: 'ready' }, target: { kind: 'document', id: 'doc', docBlockId: id }, location: { blockId: id }, fields: fields('body', docText([{ ...block, children: [] }]), 'card', { blockId: id }) }));
    walk(block.children, [...path, position]);
  });
  walk(board.doc?.blocks);
  for (const [direction, groups] of [['from', input.links?.from], ['to', input.links?.to]]) for (const group of array(groups)) {
    const key = direction === 'from' ? group.target : group.source;
    if (key) put(`link:${direction}:${key}`, [group], () => linkEntry(direction, key, group));
  }
  for (const thread of array(input.comments)) {
    if (!thread?.id || thread.unavailable) continue;
    put(`comment:${thread.id}`, [thread], () => ({ id: `comment:${thread.id}`, objectId: thread.objectId || thread.anchor?.objectId || null, kind: 'comment', title: thread.title || 'Comment', resolved: !!thread.resolved, categories: ['comments'], references: [], rabbitHoles: [], availability: { status: 'ready' }, target: { kind: 'comment', id: thread.id, anchor: thread.anchor, objectId: thread.objectId }, fields: array(thread.messages).length ? thread.messages.flatMap((message, i) => fields(`message:${i}`, message.text || message.body)) : fields('body', thread.text || thread.body) }));
  }
  return { scopeKey: input.scopeKey, revision: input.revision, entries, inputs, availability: input.availability };
}
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function querySearchIndex(index, { query = '', filter = 'all', includeResolved = false } = {}) {
  const phrase = String(query).trim(), matcher = phrase ? new RegExp(escape(phrase), 'giu') : null;
  const counts = Object.fromEntries(SEARCH_FILTERS.map(name => [name, 0])), availability = { status: 'ready', loading: 0, partial: 0, unavailable: 0, error: 0 };
  const matches = [];
  for (const entry of index.entries.values()) {
    if (entry.resolved && !includeResolved) continue;
    const status = entry.availability.status;
    if (status in availability && typeof availability[status] === 'number') availability[status]++;
    let occurrenceCount = 0, first = null, rank = 2;
    if (matcher) for (const field of entry.fields) {
      matcher.lastIndex = 0;
      for (let found; (found = matcher.exec(field.text));) {
        occurrenceCount++;
        const score = field.key === 'title' || field.key.startsWith('name:') ? 0 : 1;
        if (!first || score < rank) { first = { field, at: found.index, length: found[0].length }; rank = score; }
      }
    }
    if (matcher && !occurrenceCount) continue;
    const field = first?.field || entry.fields.find(value => value.key !== 'title') || entry.fields[0];
    const start = first?.at || 0, length = first?.length || 0, text = field?.text || '';
    const snippet = { before: text.slice(Math.max(0, start - 45), start), hit: text.slice(start, start + length), after: text.slice(start + length, start + length + 110) };
    const location = field?.location || entry.location;
    const quote = first ? { exact: snippet.hit, prefix: snippet.before, suffix: snippet.after, offset: start, field: field.key } : undefined;
    const { fields: _fields, ...result } = entry;
    const preview = entry.preview?.kind === 'code' ? { ...entry.preview, text: undefined, lines: codeExcerpt(entry.preview, entry, first, matcher) } : entry.preview;
    const value = { ...result, preview, occurrenceCount, snippet, location, match: first ? { field: field.key, kind: field.kind, location } : undefined, target: { ...entry.target, quote, location } };
    counts.all++; for (const category of entry.categories) counts[category]++;
    if (filter === 'all' || entry.categories.includes(filter)) matches.push({ value, rank });
  }
  matches.sort((a, b) => a.rank - b.rank);
  if (availability.loading) availability.status = 'loading';
  else if (availability.error) availability.status = 'error';
  else if (availability.partial || availability.unavailable) availability.status = 'partial';
  const results = matches.map(item => item.value);
  return { results, counts, totalObjects: results.length, totalOccurrences: results.reduce((sum, result) => sum + result.occurrenceCount, 0), availability };
}
