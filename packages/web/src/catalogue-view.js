// packages/web/src/catalogue-view.js
// The route catalogue as the Tutor shows it: ONE template for every codebase (owner 2026-11-15: user-friendly, not verbose, easy to read, a schema so every repository reads the same).
// Pure: no React, no storage. The catalogue document (schemas/catalogue.json) is the input; the view below is the schema; the text is its markdown.
//
// CatalogueView = {
//   name:  string,                                   the repository's short name
//   hardware: string,                                'CPU'
//   can:   [{ n: 1.., routeId, title, effort, recommended }]   what can be done here, numbered, recommended first as the catalogue sorts it
//   cannot:[{ title, reason }]                       what cannot, one rule-derived reason each (a short phrase, never a command or a path)
// }
// The text it renders:
//   **name**: what you can do here
//
//   1. ⭐ **Title** · Quick
//   2. **Title** · Quick
//
//   **Not on this canvas**
//   - Title: needs a GPU
const STAR = '⭐';
const first = (text, max = 90) => { const s = String(text || '').trim(); return s.length > max ? `${s.slice(0, max - 1).trimEnd()}` : s; };
// 'Quick — just Python' -> 'Quick'
const effortWord = effort => String(effort || '').split(/\s+[—-]\s+/)[0].trim();
const noStop = text => String(text || '').trim().replace(/[.\s]+$/, '');
const lowerFirst = text => (text ? text[0].toLowerCase() + text.slice(1) : text);

export function catalogueView(doc, name) {
  const routes = doc?.routes || [];
  const can = routes.filter(route => route.practical).map((route, i) => ({ n: i + 1, routeId: route.routeId, title: noStop(route.title), effort: effortWord(route.effort), recommended: !!route.recommended }));
  const cannot = routes.filter(route => !route.practical).map(route => ({ title: noStop(route.title), reason: route.reason ? lowerFirst(first(noStop(route.reason), 110)) : '' }));
  return { name, hardware: doc?.hardware === 'cpu' || !doc?.hardware ? 'CPU' : String(doc.hardware).toUpperCase(), can, cannot };
}

const canLine = item => `${item.n}. ${item.recommended ? `${STAR} ` : ''}**${item.title}**${item.effort ? ` · ${item.effort}` : ''}`;
const cannotLine = item => `- ${item.title}${item.reason ? `: ${item.reason}` : ''}`;

// The not-here block, shared by the can and zero messages; empty when nothing is out of reach.
export const cannotBlock = (view, heading = 'Not on this canvas') => (view.cannot.length ? [`**${heading}**`, ...view.cannot.map(cannotLine)].join('\n') : '');

// Several practical ways: the numbered list, then what is out of reach.
export function chooseText(view) {
  return [`**${view.name}**: what you can do here`, view.can.map(canLine).join('\n'), cannotBlock(view)].filter(Boolean).join('\n\n');
}

// Exactly one practical way: say it, then what is out of reach.
export function oneText(view) {
  const only = view.can[0];
  return [`**${view.name}**: one way to use it on a ${view.hardware}`, canLine({ ...only, n: 1 }), 'Setting that up now.', cannotBlock(view)].filter(Boolean).join('\n\n');
}

// Nothing practical: what running it needs, as a list.
export function zeroText(view, summary = '') {
  return [`**${view.name}**: it can't run on this canvas`, summary ? first(noStop(summary), 160) + '.' : '', cannotBlock(view, 'What it needs'), 'You can still read the code, trace a feature, or learn a concept through it.'].filter(Boolean).join('\n\n');
}
