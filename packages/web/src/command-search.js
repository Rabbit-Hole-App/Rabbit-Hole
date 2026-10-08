// The search both Slash commands sheets share (CommandList.jsx): commands whose name or description contains what is
// typed. A leading / is ignored. Pure, and apart from the sheets' demos, so the Agent Bar's sheet loads nothing of Learn's.
export const filterSections = (sections, query) => {
  const typed = query.trim().replace(/^\//, '').toLowerCase();
  if (!typed) return sections;
  return sections.map(section => ({ ...section, items: section.items.filter(item => `${item.name} ${item.desc}`.toLowerCase().includes(typed)) }))
    .filter(section => section.items.length);
};
