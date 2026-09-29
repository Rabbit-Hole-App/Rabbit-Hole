// The canvas + Insert palette (user decision 2026-09-28): a manual-authoring
// surface, grouped the way learners think, showing production-ready tools
// only. Anything not yet stable - paid generation until its confirmation step
// exists, narration, the reference animation - stays behind the dev flag.
// Ids are canvas block types; 'notebook' is the embedded Jupyter workspace.

export const INSERT_GROUPS = [
  { title: 'Check understanding', items: ['challenge', 'explainBack', 'quiz', 'flashcards'] },
  { title: 'Explain', items: ['explanation', 'table'] },
  { title: 'Code', items: ['snippet', 'code', 'notebook'] },
  { title: 'Visualize', items: ['graph', 'plot', 'flow', 'walkthrough', 'animation'] },
  { title: 'Sources', items: ['paper', 'image', 'video'] },
];
// Behind More...: advanced and specialized, still production-ready.
export const MORE_ITEMS = ['mermaid', 'knowledge', 'vector', 'whiteboard', 'model3d'];
// Dev builds only, until stable (paid ones need the confirmation step first).
export const DEV_ONLY_ITEMS = ['imageGenerate', 'videoGenerate', 'mathAnimation', 'scene', 'audio', 'referenceAttention'];

// Learner-facing names where the block's own label is an internal one.
const NAMES = { knowledge: 'Knowledge graph', notebook: 'Notebook', mathAnimation: 'Maths animation (paid)', imageGenerate: 'Image generate (paid)', videoGenerate: 'Video generate (paid)', scene: 'Blender scene (paid)' };
export const insertName = (id, types) => NAMES[id] || types[id]?.label || id;

// What the palette shows: the groups, then More... (plus dev-only tools in a
// dev build), filtered by the search text across everything visible.
export function paletteSections(types, { dev = false, filter = '' } = {}) {
  const query = filter.trim().toLowerCase();
  const keep = id => (id === 'notebook' || types[id]) && (!query || insertName(id, types).toLowerCase().includes(query));
  const sections = INSERT_GROUPS.map(group => ({ title: group.title, items: group.items.filter(keep) }));
  sections.push({ title: 'More', items: [...MORE_ITEMS, ...(dev ? DEV_ONLY_ITEMS : [])].filter(keep) });
  return sections.filter(section => section.items.length);
}
