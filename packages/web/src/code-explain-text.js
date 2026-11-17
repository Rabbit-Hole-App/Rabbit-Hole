// A code-explain card's words as plain text (code-explain-card-spec.md section 6): its title, the question and the prose at the depth it shows (the saved `depth`, else
// standard). The one place canvas-semantics.js (search and AI context), LearningBlocks.jsx (describeBlock) and the search index read it from. Pure, no imports,
// so the main bundle takes it without the card or the contract. CODE_EXPLAIN_SIZE: the card's opening size, which AdaptiveCanvas (CodeExplainNode) and the placement read.
export const CODE_EXPLAIN_SIZE = { w: 640, h: 780 };
export function codeExplainText(block) {
  const shown = block?.depths?.[block.depth] ? block.depth : 'standard', body = block?.depths?.[shown];
  const where = (block?.files || []).map(file => file.path).filter(Boolean).join(', ');
  return [block?.question, body?.prose, where && `Code: ${where}${block?.repo ? ` in ${block.repo}` : ''}`].filter(value => typeof value === 'string' && value.trim()).join('\n');
}
