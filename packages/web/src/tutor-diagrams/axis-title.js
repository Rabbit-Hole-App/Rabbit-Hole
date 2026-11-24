// "Label (unit)", unless the label already ends with that unit, bare or in parentheses ("Time (ms)" + "ms" stays "Time (ms)").
export function titleWithUnit(label, unit) {
  const text = String(unit ?? '').trim();
  if (!text) return label;
  const name = String(label);
  const end = name.trimEnd().toLowerCase(), tail = text.toLowerCase();
  const bare = end.endsWith(tail) && !(/[\p{L}\p{N}]/u.test(tail[0]) && /[\p{L}\p{N}]/u.test(end.at(-tail.length - 1) ?? ' '));
  return bare || end.endsWith(`(${tail})`) ? name : `${name} (${text})`;
}
