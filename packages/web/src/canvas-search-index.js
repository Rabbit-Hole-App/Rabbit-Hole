// Current-canvas Search. Pure and unbudgeted: callers supply only already-authorized live data.
// No fetch, model, OCR, persisted mutation, or inference from URL-looking prose.
import { cardText } from './canvas-semantics.js';
import { docText } from './doc-text.js';
import { pdfRef } from './pdf-source.js';
import { validSources } from './card-sources.js';

export const SEARCH_FILTERS = ['all', 'cards', 'text', 'comments', 'references', 'code', 'rabbit-holes'];
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
  if (object.type === 'canvas-ref' && object.target && !refs.some(ref => ref.target === object.target)) refs.push({ kind: 'canvas', target: object.target });
  if (object.type === 'repo-code' && object.source?.kind === 'repository') refs.push({ kind: 'code', ...object.source });
  const pdf = pdfRef(object);
  if (pdf) refs.push({ ...pdf, kind: 'pdf', title: pdf.name, page: pdf.range?.page });
  if (object.type === 'paper' && object.paper?.id) refs.push({ kind: 'paper', id: object.paper.id, title: object.title, page: object.paper.page, arxiv: object.paper.id });
  const seen = new Set();
  return refs.map(safeReference).filter(ref => { const key = referenceKey(ref); if (seen.has(key)) return false; seen.add(key); return true; });
}
function notebookFields(object) {
  return array(object.ipynb?.cells).flatMap((cell, position) => {
    const location = { cell: cell.id || String(position + 1), path: object.ipynb_path || 'notebook.ipynb' };
    const source = Array.isArray(cell.source) ? cell.source.join('') : string(cell.source);
    // Text outputs are already stored. Images/HTML are not turned into searchable text.
    const outputs = array(cell.outputs).map(output => output.output_type === 'stream' ? [].concat(output.text || '').join('') : output.output_type === 'error' ? `${output.ename || ''}: ${output.evalue || ''}` : [].concat(output.data?.['text/plain'] || '').join('')).filter(Boolean);
    return [...fields(`cell:${position}`, source, 'card', location), ...outputs.flatMap((text, i) => fields(`cell:${position}:output:${i}`, text, 'card', location))];
  });
}
function availabilityFor(object, loaded) {
  if (loaded) return { status: loaded.status || (loaded.complete === false ? 'partial' : 'ready'), ...(loaded.limited ? { limited: loaded.limited, message: loaded.limited } : loaded.message ? { message: loaded.message } : {}) };
  if (object.type === 'repo-code' || object.type === 'file' || object.type === 'pdf') return { status: 'partial', message: 'Only the file name is available to Search.' };
  return { status: 'ready' };
}
function objectEntry(object, kind, suppliedRefs, children, loaded) {
  if (!object?.id || object.redacted || object.unavailable) return null;
  // An explicitly denied source may not retain private filename/path metadata in the index.
  if ((object.type === 'repo-code' || object.type === 'repo-graph') && loaded?.status === 'unavailable') return null;
  const resolvedCanvas = object.type === 'canvas-ref' ? array(suppliedRefs).find(ref => ref.target === object.target) : null;
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
  const referenceFields = references.filter(ref => !ref.unavailable).flatMap((ref, i) => fields(`reference:${i}`, [ref.title, ref.name, ref.path, ref.symbol, ref.page ? `page ${ref.page}` : '', ref.lines ? `lines ${ref.lines.join('-')}` : ''].filter(Boolean).join('\n'), 'reference'));
  const sourceFields = loaded && ['ready', 'partial'].includes(loaded.status) ? array(loaded.units).flatMap((unit, i) => fields(`source:${i}`, unit.text, 'source', unit.loc)) : [];
  return { id: `object:${object.id}`, objectId: object.id, kind, ...(kind === 'card' ? { previewKey: object.id } : {}), title: title || (object.type === 'notebook' ? 'Notebook' : object.kind === 'equation' ? 'Equation' : kind === 'card' ? 'Card' : 'Text'), categories, references, rabbitHoles, availability: availabilityFor(object, loaded), sourceKey: loaded?.sourceKey,
    target: { kind: 'object', id: object.id }, fields: [...fields('title', title), ...content, ...referenceFields, ...rabbitHoles.flatMap((child, i) => fields(`child:${i}`, child.title, 'reference')), ...sourceFields] };
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
        const score = field.key === 'title' ? 0 : 1;
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
    const value = { ...result, occurrenceCount, snippet, location, match: first ? { field: field.key, kind: field.kind, location } : undefined, target: { ...entry.target, quote, location } };
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
