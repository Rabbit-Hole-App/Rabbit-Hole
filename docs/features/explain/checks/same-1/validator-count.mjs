// Offline count: which library references and gallery specs carry a list-form transformation with fewer than 2 items on a side.
// usage: node validator-count.mjs <treeRoot> [broad|narrow]   (a checkout of main / feat/same-1). narrow (default, Reviewer's rule): rejected only when exactly ONE text item before and ONE text item after.
// broad (v1, validator-count-v1-broad.md): fewer than 2 items on a side, unless any item is a tensor.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const root = process.argv[2], mode = process.argv[3] ?? 'narrow';
const { diagramReferences } = await import(pathToFileURL(`${root}/packages/web/src/tutor-diagrams/reference-library.js`).href);
const td = `${root}/packages/web/src/tutor-diagrams`;
const gallery = JSON.parse(fs.readFileSync(`${td}/kind-gallery.json`, 'utf8'));
const depthGallery = JSON.parse(fs.readFileSync(`${td}/kind-gallery-depths.json`, 'utf8'));
const found = [];
const walk = (node, path, onHit) => {
  if (typeof node === 'string') { if (/^\s*\{/.test(node)) { try { walk(JSON.parse(node), path, onHit); } catch { /* not JSON */ } } return; }
  if (Array.isArray(node)) return node.forEach((x, i) => walk(x, `${path}.${i}`, onHit));
  if (!node || typeof node !== 'object') return;
  if (node.kind === 'transformation' && node.variant !== 'visual' && Array.isArray(node.before?.items) && Array.isArray(node.after?.items)) onHit(node, path);
  for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`, onHit);
};
const check = (source, id, root_) => walk(root_, '', (d, path) => {
  const tensor = [...d.before.items, ...d.after.items].some(i => typeof i !== 'string');
  const b = d.before.items.length, a = d.after.items.length;
  found.push({ source, id, path, before: b, after: a, tensorExempt: tensor, rejected: mode === 'broad' ? !tensor && (b < 2 || a < 2) : b === 1 && a === 1 && !tensor });
});
for (const r of diagramReferences) check('reference', r.id, r);
gallery.forEach((s, i) => check('gallery', `kind-gallery[${i}] ${s.diagram?.kind}`, s));
(Array.isArray(depthGallery) ? depthGallery : Object.entries(depthGallery).map(([k, v]) => ({ k, ...v }))).forEach((s, i) => check('gallery-depths', `kind-gallery-depths[${i}] ${s.diagram?.kind ?? s.k}`, s));
const rejected = found.filter(f => f.rejected);
console.log(JSON.stringify({ references: diagramReferences.length, transformationListDiagramsFound: found.length, tensorExempt: found.filter(f => f.tensorExempt).length, rejected: rejected.length, rejectedBy: Object.fromEntries(['reference', 'gallery', 'gallery-depths'].map(s => [s, rejected.filter(f => f.source === s).length])), list: rejected, allFound: found.map(f => `${f.source}:${f.id}${f.path} ${f.before}->${f.after}${f.tensorExempt ? ' tensor' : ''}`) }, null, 1));
