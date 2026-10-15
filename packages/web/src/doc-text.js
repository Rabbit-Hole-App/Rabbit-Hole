// The canvas document's words for Chat (BlockNote-on-Canvas MVP, brief section 12): a deterministic plain text of the native
// BlockNote JSON (board state doc.blocks), read from the live editor so unsaved text rides. Context plumbing only - never a
// saved representation (the JSON is), never a model call.

// Inline content: styled text as written, a link as "text (url)", any other inline node by its own text or content.
const inline = content => (Array.isArray(content) ? content : []).map(node => {
  if (typeof node === 'string') return node;
  if (node?.type === 'link') { const text = inline(node.content); return node.href && text !== node.href ? `${text} (${node.href})` : text; }
  return typeof node?.text === 'string' ? node.text : inline(node?.content);
}).join('');

// A table cell is inline content, or (0.54) a tableCell holding it.
const cell = value => inline(Array.isArray(value) ? value : value?.content);
const MEDIA = new Set(['image', 'file', 'video', 'audio']);

function lines(blocks, depth, out) {
  const pad = '  '.repeat(depth);
  let number = 0;
  for (const block of Array.isArray(blocks) ? blocks : []) {
    const type = block?.type, props = block?.props || {};
    number = type === 'numberedListItem' ? (Number.isInteger(props.start) && number === 0 ? props.start : number + 1) : 0;
    const text = type === 'table' ? '' : inline(block?.content);
    if (type === 'heading') out.push(`${pad}${'#'.repeat(Math.min(6, Math.max(1, props.level || 1)))} ${text}`);
    else if (type === 'bulletListItem' || type === 'toggleListItem') out.push(`${pad}- ${text}`);
    else if (type === 'numberedListItem') out.push(`${pad}${number}. ${text}`);
    else if (type === 'checkListItem') out.push(`${pad}[${props.checked ? 'x' : ' '}] ${text}`);
    else if (type === 'quote') out.push(`${pad}> ${text}`);
    else if (type === 'codeBlock') out.push(`${pad}\`\`\`${props.language && props.language !== 'text' ? props.language : ''}`, ...text.split('\n').map(line => `${pad}${line}`), `${pad}\`\`\``);
    else if (type === 'divider') out.push(`${pad}---`);
    else if (type === 'table') for (const row of block?.content?.rows || []) out.push(`${pad}| ${(row?.cells || []).map(cell).join(' | ')} |`);
    else if (MEDIA.has(type)) out.push(`${pad}[${type}${props.caption || props.name ? `: ${props.caption || props.name}` : ''}]`);
    else if (text.trim()) out.push(`${pad}${text}`);
    lines(block?.children, depth + 1, out);
  }
  return out;
}

// '' for an absent or empty document (an empty paragraph adds nothing).
export const docText = blocks => lines(blocks, 0, []).filter(line => line.trim()).join('\n');
