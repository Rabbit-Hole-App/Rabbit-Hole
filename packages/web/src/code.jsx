// Tiny per-line tokenizer for the file peek - comments, strings, keywords,
// numbers. React spans only, no HTML. ponytail: no multi-line strings, and
// python keywords double for toml well enough.
const PY_TOKEN = /(#.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|\b(def|class|import|from|return|if|elif|else|for|while|try|except|finally|with|as|in|not|and|or|None|True|False|lambda|raise|pass|break|continue|global|yield|assert|del|is|print)\b|\b(\d+(?:\.\d+)?)\b/g;
const TOKEN_COLOR = { c: 'var(--tok-c)', s: 'var(--tok-s)', k: 'var(--tok-k)', n: 'var(--tok-n)' };

export function colorLine(line) {
  const out = [];
  let last = 0;
  for (const m of line.matchAll(PY_TOKEN)) {
    if (m.index > last) out.push(line.slice(last, m.index));
    const kind = m[1] ? 'c' : m[2] ? 's' : m[3] ? 'k' : 'n';
    out.push(<span key={m.index} style={{ color: TOKEN_COLOR[kind] }}>{m[0]}</span>);
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out.length ? out : ' ';
}
