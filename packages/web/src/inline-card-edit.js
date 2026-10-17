// Editable card data only: never source files, assessment state or layout. Shared by context and validation.
export const CARD_EDIT_MAX = 4000;
const FIELDS = { explanation: ['title', 'body', 'more'], table: ['title', 'caption', 'columns', 'rows'], snippet: ['title', 'brief', 'code'], heading: ['text'] };
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const strings = value => Array.isArray(value) && value.every(entry => typeof entry === 'string');
const structureSafe = content => Object.entries(content).every(([key, value]) => {
  if (key === 'more') return Array.isArray(value) && value.every(section => plain(section) && Object.keys(section).every(k => ['label', 'text'].includes(k)) && typeof section.label === 'string' && typeof section.text === 'string');
  if (key === 'columns') return strings(value) && value.length > 0;
  if (key === 'rows') return Array.isArray(value) && Array.isArray(content.columns) && value.every(row => strings(row) && row.length === content.columns.length);
  return typeof value === 'string';
});
// Existing Markdown links/footnotes have no claim-level association schema. Code examples are data,
// not citations: ignore fenced and inline code, and never inspect the snippet's code field.
export function hasCardCitations(content) {
  const prose = Object.entries(content || {}).filter(([key]) => key !== 'code').flatMap(([key, value]) => {
    if (key === 'more') return (Array.isArray(value) ? value : []).flatMap(section => [section?.label, section?.text]);
    if (key === 'rows') return (Array.isArray(value) ? value : []).flat();
    return Array.isArray(value) ? value : [value];
  }).filter(value => typeof value === 'string');
  return prose.some(text => {
    let fence = null;
    const visible = text.split('\n').filter(line => {
      const marker = line.trimStart().match(/^(`{3,}|~{3,})/);
      if (fence) {
        if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !line.trim().slice(marker[1].length).trim()) fence = null;
        return false;
      }
      if (marker) { fence = marker[1]; return false; }
      return true;
    }).join('\n').replace(/(`+)[\s\S]*?\1(?!`)/g, '');
    return /(?<!!)\[[^\]\n]*\]\s*(?:\([^\n]*\)|\[[^\]\n]*\])|\[\^[^\]\n]+\]|^\s{0,3}\[[^\]\n]+\]:\s*\S/m.test(visible.replace(/\x5c\[/g, ''));
  });
}
const fail = reason => ({ ok: false, reason, error: reason });
export function cardEditSpec(block) {
  if (!block || typeof block.type !== 'string' || !Object.hasOwn(FIELDS, block.type)) return fail('This card has no safe structured editing path. Explain is available.');
  if (block.locked) return fail('This card is locked.');
  if (block.fileRef || block.source || block.anchor) return fail('This source-backed card cannot be rewritten in place. Its original source stays unchanged.');
  // Existing SourcesDisclosure combines evidence and provenance without claim spans or stable citation IDs.
  // ponytail: sourced rewriting needs a claim-aware schema; keeping these sources would imply unverified support.
  if ((block.sources?.length || block.citations?.length)) return fail('This card has citations whose statement associations cannot be preserved safely. Explain is available.');
  const fields = FIELDS[block.type];
  const content = Object.fromEntries(fields.filter(key => Object.hasOwn(block, key)).map(key => [key, block[key]]));
  if (hasCardCitations(content)) return fail('This card contains linked references or footnote citations whose statement associations cannot be preserved safely. Explain is available.');
  if (!Object.keys(content).length || !structureSafe(content)) return fail('This card has content structure that cannot be rewritten safely. Explain is available.');
  return { ok: true, type: block.type, fields: Object.keys(content), content };
}
export function cardEditFields(content = {}) {
  const fields = [];
  const labels = { title: 'Title', body: 'Body', brief: 'Introduction', caption: 'Caption', text: 'Text', code: 'Code' };
  for (const [key, label] of Object.entries(labels)) if (Object.hasOwn(content, key)) fields.push({ key, label, text: content[key], code: key === 'code' });
  if (Array.isArray(content.more)) content.more.forEach((section, index) => fields.push({ key: `section-${index}`, label: section.label || `Section ${index + 1}`, text: section.text }));
  if (Array.isArray(content.columns)) {
    const cell = value => String(value).replace(/\|/g, '\\|').replace(/\n/g, ' ');
    fields.push({ key: 'table', label: 'Table', text: [content.columns.map(cell).join(' | '), content.columns.map(() => '---').join(' | '), ...(content.rows || []).map(row => row.map(cell).join(' | '))].join('\n') });
  }
  return fields;
}
export const cardEditText = content => cardEditFields(content).map(field => `${field.label}\n${field.text}`).join('\n\n');
export function cardEditComparison(before, after) {
  const old = cardEditFields(before), next = cardEditFields(after);
  return [...new Set([...old.map(field => field.key), ...next.map(field => field.key)])].map(key => {
    const a = old.find(field => field.key === key), b = next.find(field => field.key === key);
    return { key, label: b?.label || a.label, previousLabel: a?.label, before: a?.text ?? '', after: b?.text ?? '', code: b?.code || a?.code || false };
  });
}
export function validateCardContent(block, content) {
  const spec = cardEditSpec(block);
  if (!spec.ok) return spec;
  if (!plain(content) || Object.keys(content).length !== spec.fields.length || Object.keys(content).some(key => !spec.fields.includes(key))) return fail('The edit must preserve the card content fields and cannot change its identity, sources or layout.');
  if (hasCardCitations(content)) return fail('The revision introduces linked references or footnote citations that cannot be grounded safely.');
  if (JSON.stringify(content).length > CARD_EDIT_MAX) return fail(`The revised card exceeds the ${CARD_EDIT_MAX}-character structured edit budget. Shorten the requested revision.`);
  for (const [key, value] of Object.entries(content)) {
    if (key === 'more') {
      if (!Array.isArray(value) || value.some(section => !plain(section) || Object.keys(section).some(k => !['label', 'text'].includes(k)) || typeof section.label !== 'string' || typeof section.text !== 'string')) return fail('Explanation sections need their existing label and Markdown text structure.');
    } else if (key === 'columns') {
      if (!strings(value) || !value.length) return fail('A table needs text column headings.');
    } else if (key === 'rows') {
      if (!Array.isArray(value) || !Array.isArray(content.columns) || value.some(row => !strings(row) || row.length !== content.columns.length)) return fail('Table rows must retain a cell for every column.');
    } else if (typeof value !== 'string') return fail('The card text must stay text, including its Markdown and equations.');
  }
  const after = { ...block, ...content };
  // A displayed run belongs to the previous code, never to a proposed new program. No execution here.
  if (block.type === 'snippet' && content.code !== block.code && Object.hasOwn(block, 'output')) after.output = '';
  return { ok: true, after };
}
export function cardEditSelectionReason(ids, board) {
  for (const id of ids) {
    const block = (board.blocks || []).find(entry => entry.id === id);
    if (block) { const spec = cardEditSpec(block); if (!spec.ok) return spec.reason; }
    else if ((board.exchanges || []).some(entry => entry.id === id)) return 'Conversation cards cannot be rewritten in place. Explain is available.';
  }
  return null;
}
