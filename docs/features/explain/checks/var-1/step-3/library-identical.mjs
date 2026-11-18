// VAR-1 step 3 evidence: no reference of the library carries `vary` or a token, so a seed must change nothing. For every reference (469): the references the author receives for its first
// prompt, with and without a seed, compared as JSON; and the Gemini request hash (round-1/hashes.mjs) is separately identical to main's. Offline.   usage: node library-identical.mjs <treeRoot>
const root = process.argv[2] ?? 'C:/s/var-1';
const cp = p => import(`file:///${root}/packages/control-plane/src/${p}`);
const { diagramReferences } = await import(`file:///${root}/packages/web/src/tutor-diagrams/reference-library.js`);
const { selectDiagramReferences } = await cp('explanation-references.js');
let n = 0, differ = [], withVary = diagramReferences.filter(r => r.vary).length, withToken = diagramReferences.filter(r => /\{\{d:/.test(JSON.stringify(r.spec))).length;
for (const ref of diagramReferences) {
  const prompt = ref.prompts?.[0] ?? ref.keywords?.[0];
  if (!prompt) continue;
  const plain = JSON.stringify(selectDiagramReferences({ prompt, depth: 'standard' })), seeded = JSON.stringify(selectDiagramReferences({ prompt, depth: 'standard', seed: 'any-seed' }));
  n++; if (plain !== seeded) differ.push(ref.id);
}
console.log(`references in the library: ${diagramReferences.length}; with vary: ${withVary}; with a token: ${withToken}; prompts compared: ${n}; differ with a seed: ${differ.length}${differ.length ? ' ' + differ.slice(0, 5).join(',') : ''}`);
process.exit(differ.length || withVary || withToken ? 1 : 0);
