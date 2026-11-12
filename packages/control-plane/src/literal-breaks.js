// Owner 2026-11-09 hotfix (release 117): the author (Gemini, on one card in 422 of the clean-up run) sometimes double-escapes line breaks, so the saved text holds the two
// characters backslash + n where a paragraph boundary belongs and the card shows them. This turns those sequences into real line breaks, in every string of the author's answer
// (body, title, captions, questions), before any other step reads it. LaTeX stays intact: a backslash-n that starts a command (\nabla, \neq, \nu, \newline) is followed by a
// lowercase letter, and only a backslash-n followed by another break, white space, a capital letter, a digit or Markdown line-start punctuation is a line break.
const BS = String.fromCharCode(92);
const BREAK_NEXT = /^[\s\dA-Z#*|`>\-]/;

export function literalBreaksToNewlines(text) {
  if (typeof text !== 'string' || !text.includes(BS)) return text;
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === BS && text[i + 1] === 'r' && text[i + 2] === BS && text[i + 3] === 'n') { out += '\n'; i += 3; continue; }
    if (c === BS && text[i + 1] === 'n') {
      const next = text[i + 2];
      if (next === undefined || next === BS || BREAK_NEXT.test(next)) { out += '\n'; i += 1; continue; }
    }
    out += c;
  }
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
}

// Every string of the author's answer, recursively (the answer is JSON data: objects, arrays, strings). The body and title are trimmed; other strings keep their ends.
export function literalBreaksDeep(value, key = '') {
  if (typeof value === 'string') { const fixed = literalBreaksToNewlines(value); return key === 'body' || key === 'title' ? fixed.trim() : fixed; }
  if (Array.isArray(value)) return value.map(v => literalBreaksDeep(v, key));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, literalBreaksDeep(v, k)]));
  return value;
}
