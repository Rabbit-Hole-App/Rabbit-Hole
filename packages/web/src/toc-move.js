// Where a Table of contents heading can move one step, for the row menu's Move up / Move down (the keyboard alternative to dragging).
// list: the manual outline in order ({ id, level }). Each target is the beforeId canvasApi.moveSection(id, beforeId) takes (the same one a drop
// computes: the entry to insert before, or null for the end), and moveSection carries the heading's own sub-sections with it. Moves stay among
// siblings: a heading never moves out of, or into, another heading's section, so its level and parent never change.
// -> { up: { before } | null, down: { before } | null }; null when there is no sibling that way.
const levelOf = entry => entry.level || 1;
const endOf = (list, start) => {
  let end = start + 1;
  while (end < list.length && levelOf(list[end]) > levelOf(list[start])) end += 1;
  return end;
};
export function moveTargets(list, id) {
  const at = (list || []).findIndex(entry => entry.id === id);
  if (at < 0) return { up: null, down: null };
  const level = levelOf(list[at]);
  let previous = at - 1;
  while (previous >= 0 && levelOf(list[previous]) > level) previous -= 1; // skip the previous sibling's own sub-sections
  const up = previous >= 0 && levelOf(list[previous]) === level ? { before: list[previous].id } : null;
  const next = endOf(list, at);
  const down = next < list.length && levelOf(list[next]) === level ? { before: list[endOf(list, next)]?.id ?? null } : null;
  return { up, down };
}
