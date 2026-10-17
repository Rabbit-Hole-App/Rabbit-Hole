export const longCode = Array.from({ length: 28 }, (_, i) => `const value_${i} = "${'unchanged_source_'.repeat(12)}";`).join('\n');
export const longText = Array.from({ length: 35 }, (_, i) => `## Section ${i}\n\n${'Readable wrapping text with preserved structure. '.repeat(5)}${i === 33 ? ' FULL_CONTENT_SEARCH_NEEDLE' : ''}`).join('\n\n');
const image = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="800"><rect width="1600" height="800" fill="#b8c8da"/><text x="80" y="400" font-size="80">Layout fixture</text></svg>')}`;
export function layoutBoard(type = 'explanation') {
  const content = {
    explanation: { body: longText },
    snippet: { code: longCode, language: 'javascript', brief: 'Exact source must survive visual wrapping.' },
    table: { columns: ['First readable column', 'Second readable column', 'Third readable column'], rows: Array.from({ length: 28 }, (_, i) => [`row ${i}`, 'Long cell words that wrap while remaining readable', 'Complete cell content']) },
    image: { src: image, alt: 'Layout fixture', caption: 'Aspect ratio must remain two to one.' },
  }[type];
  return { strokes: [], shapes: [], items: [], links: [{ id: 'layout-link', from: 'subject', to: 'neighbor' }], groups: [], areas: [], exchanges: [], blocks: [
    { id: 'subject', type, title: `Layout ${type}`, dx: 0, dy: 0, w: 560, h: 280, ...content },
    { id: 'neighbor', type: 'explanation', title: 'Neighbor must stay put', body: 'Unchanged neighbor content.', dx: 40, dy: 0, w: 400, h: 180 },
  ] };
}
