// D1 limits that node:sqlite does not enforce (developers.cloudflare.com/d1/platform/limits, checked 2026-11-06):
// a LIKE/GLOB pattern over 50 bytes, more than 100 bound parameters, a statement over 100 KB, a bound string/BLOB over 2 MB.
// The D1 stand-ins call checkD1Limits(sql, args) when a statement is bound; it throws the way D1 does.
// ponytail: a pattern built inside the SQL (`'%' || ? || '%'`) and the 32-argument SQL-function limit are not checked.
export const D1_LIMITS = Object.freeze({ likeBytes: 50, params: 100, statementBytes: 100_000, valueBytes: 2_000_000 });

// Placeholders in order of appearance, outside string literals and comments: ?, ?N. (:name and @name are not used with D1.)
function placeholders(sql) {
  const found = [], skip = /'(?:[^']|'')*'|"(?:[^"]|"")*"|--[^\n]*|\/\*[\s\S]*?\*\//y, ph = /\?(\d*)/y;
  let next = 1;
  for (let i = 0; i < sql.length;) {
    skip.lastIndex = i;
    if (skip.test(sql)) { i = skip.lastIndex; continue; }
    ph.lastIndex = i;
    const m = ph.exec(sql);
    if (m) { const n = m[1] ? Number(m[1]) : next; next = Math.max(next, n) + 1; found.push({ at: i, n }); i = ph.lastIndex; } else i += 1;
  }
  return found;
}

export function checkD1Limits(sql, args = []) {
  const fail = message => { throw new Error(`D1_ERROR (stand-in): ${message}`); };
  if (Buffer.byteLength(sql) > D1_LIMITS.statementBytes) fail(`statement is ${Buffer.byteLength(sql)} bytes, over the ${D1_LIMITS.statementBytes} byte limit`);
  const marks = placeholders(sql), count = Math.max(args.length, ...marks.map(m => m.n), 0);
  if (count > D1_LIMITS.params) fail(`${count} bound parameters, over the ${D1_LIMITS.params} limit (too many SQL variables)`);
  for (const value of args) if ((typeof value === 'string' || value instanceof Uint8Array) && Buffer.byteLength(value) > D1_LIMITS.valueBytes) fail(`a bound value is ${Buffer.byteLength(value)} bytes, over the ${D1_LIMITS.valueBytes} byte row limit`);
  for (const m of sql.matchAll(/\b(?:LIKE|GLOB)\s+(?:'((?:[^']|'')*)'|(\?(\d*)))/gi)) {
    const pattern = m[1] !== undefined ? m[1].replaceAll("''", "'") : args[(m[3] ? Number(m[3]) : marks.find(p => p.at === m.index + m[0].length - m[2].length)?.n) - 1];
    if (typeof pattern === 'string' && Buffer.byteLength(pattern) > D1_LIMITS.likeBytes) fail(`LIKE or GLOB pattern is ${Buffer.byteLength(pattern)} bytes, over the ${D1_LIMITS.likeBytes} byte limit (pattern too complex): ${pattern.slice(0, 60)}`);
  }
}
