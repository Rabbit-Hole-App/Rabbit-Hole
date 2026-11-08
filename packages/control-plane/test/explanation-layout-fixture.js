// EXP-13 card layout v2 (docs/features/explain.md "Card layout v2"): test bodies in the new layout, prose, a visual, prose. The visual's title takes the
// first words of the prose before it, so it always names something from the text around it (the relevance check).
const words = text => (String(text).match(/[\p{L}\p{N}]+/gu) || []).slice(0, 6).join(' ') || 'Idea';
export const cycleSpec = (title = 'Idea') => ({ version: 1, diagram: { kind: 'cycle', title: title.slice(0, 90), steps: ['Start', 'Change', 'Repeat'] } });
export const diagramFence = spec => '```rh-diagram\n' + (typeof spec === 'string' ? spec : JSON.stringify(spec)) + '\n```';
export const illustrationFence = (fields = {}) => '```rh-illustration\n' + JSON.stringify({ version: 1, id: 'pic', prompt: 'A clear picture of the idea', alt: 'The idea drawn', caption: 'The idea in one picture', ...fields }) + '\n```';
// prose ▸ diagram ▸ after; `visual` replaces the default diagram fence (a whole fence string).
export const withVisual = (prose, { after = 'That is the idea.', visual = null } = {}) => `${prose}\n\n${visual ?? diagramFence(cycleSpec(words(prose)))}\n\n${after}`;
