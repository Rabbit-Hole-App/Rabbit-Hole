import fs from 'node:fs';
const c = JSON.parse(fs.readFileSync('cards.json', 'utf8')), f = JSON.parse(fs.readFileSync('scripts.json', 'utf8')), g = JSON.parse(fs.readFileSync('scripts-gemini.json', 'utf8'));
for (const x of c) {
  const math = (x.body.match(/\$/g) || []).length / 2, lab = x.visualLabels.filter(l => /\$|\^|\\/.test(l)).length;
  console.log(x.n, x.id, x.depthLabel, 'bodyLatexSpans', math, 'labelsWithMath', lab, '| FW reasoning', f[x.n - 1].usage.completion_tokens_details?.reasoning_tokens, 'of', f[x.n - 1].usage.completion_tokens, '| GM completion', g[x.n - 1].usage.completion_tokens, 'finish', f[x.n - 1].finish, g[x.n - 1].finish);
}
for (const i of [0, 3, 4, 5, 6, 8, 9, 10, 11]) { console.log('\n##', c[i].n, c[i].id); console.log(c[i].body); console.log('LABELS:', JSON.stringify(c[i].visualLabels)); }
