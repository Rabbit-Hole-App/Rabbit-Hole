// Headings and citations are navigation/evidence, not explanation blocks.
export function isAnswerMetadata(text) {
  const plain = text.trim().replace(/^\*\*|\*\*$/g, '');
  return /^Page\s+\d+\s*(?:[.:|\u00b7\u2013\u2014-])/i.test(plain) || /^(?:Sources?|Papers read):\s/i.test(plain) || /^(?:`?[\w./-]+\.(?:py|toml|txt|md|json|csv|cfg|ini|yaml|yml)(?::\d+(?:[-\u2013]\d+)?)?`?|runbook)$/i.test(plain);
}

// Split by the model's paragraphs, preserving fenced code and display math.
// An equation/code block stays with the prose immediately introducing it.
export function answerBlocks(text) {
  const parts = [], lines = String(text).split('\n');
  let current = [], fence = false, math = null;
  const flush = () => { if (current.join('\n').trim()) parts.push(current.join('\n').trim()); current = []; };
  for (const line of lines) {
    const t = line.trim();
    if (!fence && !math && isAnswerMetadata(t)) { flush(); parts.push(t); continue; }
    if (t.startsWith('```')) fence = !fence;
    if (!fence) {
      if (math) { if (t.includes(math)) math = null; }
      else if (t.startsWith('$$') && !t.slice(2).includes('$$')) math = '$$';
      else if (t.startsWith('\\[') && !t.slice(2).includes('\\]')) math = '\\]';
    }
    if (!t && !fence && !math) flush(); else current.push(line);
  }
  flush();
  const blocks = [];
  for (const part of parts) {
    if (/^(\$\$|\\\[|```)/.test(part) && blocks.length && !isAnswerMetadata(blocks[blocks.length - 1])) blocks[blocks.length - 1] += '\n\n' + part;
    else blocks.push(part);
  }
  return blocks;
}
