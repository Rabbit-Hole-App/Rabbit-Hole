// A Code box's language and its syntax colors (docs/features/canvas-editing.md section 3). shiki is imported only when
// a board draws a Code box, so the canvas chunk never carries it.

export const CODE_LANGS = [
  ['python', 'Python'], ['javascript', 'JavaScript'], ['typescript', 'TypeScript'], ['json', 'JSON'], ['bash', 'Bash'],
  ['sql', 'SQL'], ['html', 'HTML'], ['css', 'CSS'], ['c', 'C'], ['cpp', 'C++'], ['java', 'Java'], ['go', 'Go'],
  ['rust', 'Rust'], ['markdown', 'Markdown'], ['text', 'Plain text'],
];

// No lang, or one not in the list: Python.
export const codeLang = item => (CODE_LANGS.some(([id]) => id === item?.lang) ? item.lang : 'python');

// A new list with one box's language; the list it came from is left as it was (the undo step's snapshot).
export const withCodeLang = (items, id, lang) => items.map(item => (item.id === id ? { ...item, lang } : item));

// shiki's token lines as runs whose text joins back to exactly `text`: colors only, never font, size, weight or style,
// so the box keeps its size and line wraps. A token in the theme's plain color takes none and keeps the box's own.
export function colorRuns(lines, fg) {
  const runs = [];
  lines.forEach((line, index) => {
    if (index) runs.push({ t: '\n' });
    for (const token of line) {
      const color = token.htmlStyle?.color;
      runs.push(color && color.toLowerCase() !== String(fg).toLowerCase() ? { t: token.content, color, dark: token.htmlStyle['--shiki-dark'] } : { t: token.content });
    }
  });
  return runs;
}

// The colored runs for `text` in `lang`, or null for Plain text, an empty box or a failed load (the box stays plain).
// ponytail: the cache keeps every highlighted text for the tab's life; bound it if a board ever holds thousands.
const cache = new Map();
export function highlightCode(text, lang) {
  if (lang === 'text' || !text) return Promise.resolve(null);
  const key = `${lang}\n${text}`;
  if (!cache.has(key)) {
    cache.set(key, import('shiki')
      .then(({ codeToTokens }) => codeToTokens(text, { lang, themes: { light: 'github-light', dark: 'github-dark' } }))
      .then(({ tokens, fg }) => { const runs = colorRuns(tokens, fg); return runs.map(run => run.t).join('') === text ? runs : null; })
      .catch(() => null));
  }
  return cache.get(key);
}
