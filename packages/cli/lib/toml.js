'use strict';
// Minimal TOML subset for small.toml: [section], key = "str" | number | bool | ["a", "b"]
// | { k = v, ... } (one level, for [inputs]/[outputs]).
// ponytail: comment strip breaks on # inside strings - small.toml values never contain #.

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

// Split on top-level commas only - commas inside quotes ("a,b") or brackets stay put.
function splitTop(s) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let cur = '';
  for (const ch of s) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    if (ch === '[' || ch === '{') depth++;
    if (ch === ']' || ch === '}') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((p) => p.trim());
}

function value(v) {
  if (v.startsWith('{')) {
    const obj = {};
    for (const part of splitTop(v.slice(1, v.lastIndexOf('}')))) {
      const kv = part.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
      if (!kv) throw new Error(`small.toml: cannot parse inline table entry: ${part}`);
      obj[kv[1]] = value(kv[2].trim());
    }
    return obj;
  }
  if (v.startsWith('[')) {
    const inner = v.slice(1, v.lastIndexOf(']')).trim();
    return inner ? splitTop(inner).map((s) => value(s)) : [];
  }
  if (v.startsWith('"') || v.startsWith("'")) return v.slice(1, -1);
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v !== '' && !isNaN(Number(v))) return Number(v);
  return v;
}

module.exports = { parse };
