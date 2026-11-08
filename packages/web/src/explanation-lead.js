// Where a written Explanation's illustration goes: right after the opening paragraph. -> { lead, rest } as Markdown strings; the card draws lead, the figure, then rest.
// The opening paragraph is the first run of prose lines (after any heading) up to a blank line outside a code fence. A body that opens with a fence, a table or a list has no
// opening paragraph, so the figure goes first (lead is '').
export function splitLead(body) {
  const lines = String(body ?? '').split('\n');
  let i = 0;
  while (i < lines.length && (!lines[i].trim() || /^\s*#{1,6}\s/.test(lines[i]))) i++;
  if (i >= lines.length || /^\s*(```|\||[-*+]\s|\d+[.)]\s|>)/.test(lines[i])) return { lead: '', rest: lines.join('\n') };
  let end = i;
  while (end < lines.length && lines[end].trim() && !/^\s*(```|\||[-*+]\s|\d+[.)]\s)/.test(lines[end])) end++;
  return { lead: lines.slice(0, end).join('\n'), rest: lines.slice(end).join('\n').replace(/^\n+/, '') };
}
