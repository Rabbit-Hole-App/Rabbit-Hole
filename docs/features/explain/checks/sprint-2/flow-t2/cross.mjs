const root = process.argv[2];
const lib = await import(`${root}/packages/web/src/tutor-diagrams/reference-library.js`);
const { layoutFlow } = await import(`${root}/packages/web/src/tutor-diagrams/flow.js`);
const moe = lib.diagramReferences.find(r => r.id === 'ml-moe-top-two-experts').spec.diagram;
const g = layoutFlow(moe, 408).geometry;
const path = new Set((moe.highlightPath ?? []).flatMap(p => p.slice(1).map((id, i) => p[i] + '>' + id)));
const segs = e => e.points.slice(1).map((p, i) => [e.points[i], p]);
const cross = ([a, b], [c, d]) => { const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); const s1 = o(a, b, c), s2 = o(a, b, d), s3 = o(c, d, a), s4 = o(c, d, b); return s1 * s2 < 0 && s3 * s4 < 0; };
let n = 0; const hits = [];
for (const h of g.edges.filter(e => path.has(e.from + '>' + e.to))) for (const o of g.edges) { if (o === h || (o.from === h.from && 0)) continue; if (path.has(o.from + '>' + o.to) && o.from + o.to < h.from + h.to) continue; for (const s of segs(h)) for (const t of segs(o)) if (cross(s, t)) { n++; hits.push(h.from + '>' + h.to + ' x ' + o.from + '>' + o.to); } }
console.log('crossings of a highlighted wire by another wire:', n, hits.join('; '));
const nodes = g.nodes.map(n => n.id + ':' + n.text?.length); 
