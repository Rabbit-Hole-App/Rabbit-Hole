'use strict';
// Minimal TOML subset for small.toml: [section], key = "str" | number | bool | ["a", "b"].
// ponytail: comment strip breaks on # inside strings — small.toml values never contain #.

function parse(text) {
  const root = {};
  let cur = root;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const sec = line.match(/^\[(.+)\]$/);
    if (sec) {
      cur = root[sec[1]] = root[sec[1]] || {};
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
    if (!kv) throw new Error(`small.toml: cannot parse line: ${raw.trim()}`);
    cur[kv[1]] = value(kv[2].trim());
  }
  return root;
}

function value(v) {
  if (v.startsWith('[')) {
    const inner = v.slice(1, v.lastIndexOf(']')).trim();
    return inner ? inner.split(',').map((s) => value(s.trim())) : [];
  }
  if (v.startsWith('"') || v.startsWith("'")) return v.slice(1, -1);
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v !== '' && !isNaN(Number(v))) return Number(v);
  return v;
}

module.exports = { parse };
