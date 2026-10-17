// A code file's shiki language id from its name (repo-graph Release 2, C:/s/spec/repo-graph-r2-plan.md): code cards highlight
// with it (code-lang.js highlightCode) and a dropped file is offered as a Code card when it names one. 'text' is plain.
const BY_EXTENSION = {
  py: 'python', pyi: 'python', js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx', ts: 'typescript', mts: 'typescript',
  tsx: 'tsx', json: 'json', sh: 'bash', bash: 'bash', zsh: 'bash', sql: 'sql', html: 'html', htm: 'html', css: 'css', scss: 'scss',
  c: 'c', h: 'c', cc: 'cpp', cpp: 'cpp', cxx: 'cpp', hpp: 'cpp', hh: 'cpp', java: 'java', kt: 'kotlin', go: 'go', rs: 'rust',
  rb: 'ruby', php: 'php', cs: 'csharp', swift: 'swift', scala: 'scala', r: 'r', jl: 'julia', lua: 'lua', md: 'markdown', markdown: 'markdown',
  jsonl: 'jsonl', ini: 'ini', kts: 'kotlin',
  yaml: 'yaml', yml: 'yaml', toml: 'toml', xml: 'xml', dockerfile: 'docker', makefile: 'make', ipynb: 'json', txt: 'text',
};

export function codeLanguage(name) {
  const base = String(name || '').split('/').pop().toLowerCase();
  if (base === 'dockerfile' || base === 'makefile') return BY_EXTENSION[base];
  const ext = base.includes('.') ? base.split('.').pop() : '';
  return BY_EXTENSION[ext] || 'text';
}

// A name a Code card is offered for: a known language (plain .txt included, so a dropped notes file is still a card).
export const isCodeFile = name => codeLanguage(name) !== 'text' || /\.txt$/i.test(String(name || ''));
