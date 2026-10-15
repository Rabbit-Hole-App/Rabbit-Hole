// Stand-ins for lane CODE's interface (C:/s/spec/repo-graph-r2-plan.md, "Interfaces between lanes"), so a dropped code
// file can become a repo-code card before CODE lands. On merge, LearnPage and learn-file-import.js import the real ones
// (codeLanguage from code-language.js, insertCodeCard from CODE's helper) and this file is deleted.

// The shiki language id for a file name, or null when it is not a common source or config file.
const BY_EXTENSION = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx', py: 'python',
  rb: 'ruby', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin', scala: 'scala', swift: 'swift', c: 'c', h: 'c',
  cc: 'cpp', cpp: 'cpp', hpp: 'cpp', cs: 'csharp', php: 'php', lua: 'lua', r: 'r', dart: 'dart', sh: 'shellscript',
  bash: 'shellscript', zsh: 'shellscript', sql: 'sql', html: 'html', css: 'css', scss: 'scss', vue: 'vue', svelte: 'svelte',
  json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml', ini: 'ini', xml: 'xml', md: 'markdown',
};
const BY_NAME = { dockerfile: 'docker', makefile: 'make' };
export const codeLanguage = (name) => {
  const base = String(name || '').split(/[/\\]/).pop().toLowerCase();
  return BY_NAME[base] || BY_EXTENSION[/\.([^.]+)$/.exec(base)?.[1]] || null;
};

// Places the card at the drop point (or where the learner is looking) in one undo step and returns its id.
export const insertCodeCard = (api, block, point = null) => api?.insertImported(block, point) ?? null;
