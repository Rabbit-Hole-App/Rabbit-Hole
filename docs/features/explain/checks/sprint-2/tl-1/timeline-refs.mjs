import { diagramReferences } from 'file:///C:/s/teaching-palette/packages/web/src/tutor-diagrams/reference-library.js';
import gallery from 'file:///C:/s/teaching-palette/packages/web/src/tutor-diagrams/kind-gallery.json' with { type: 'json' };
for (const r of diagramReferences.filter(r => r.spec.diagram.kind === 'timeline')) { const d = r.spec.diagram; console.log(r.id, '| keys', Object.keys(d).join(','), '| times', (d.events ?? d.lanes?.flatMap(l => l.events ?? []) ?? []).map(e => e.time).join(' ; ').slice(0, 80)); }
const g = gallery.find(s => (s.diagram ?? s).kind === 'timeline'); const gd = g.diagram ?? g; console.log('gallery times:', gd.events?.map(e => e.time).join(' ; '));
