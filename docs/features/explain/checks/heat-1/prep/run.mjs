import fs from 'node:fs';
const T = 'file:///C:/s/var-1/packages/web/src/tutor-diagrams/';
const { parseTutorDiagram, tutorDiagramSchema } = await import(T + 'spec.js');
const P = await import('file:///C:/s/var-1/packages/control-plane/src/learn-primitives.js');
for (const f of ['causal-mask-card.json', 'causal-mask-card-diag-allowed-all-zero.json']) {
  const spec = JSON.parse(fs.readFileSync('C:/s/heat1-prep/' + f, 'utf8'));
  let ok = true, err = null;
  try { parseTutorDiagram(spec); } catch (e) { ok = false; err = e.issues?.map(i => i.message) ?? e.message; }
  console.log(f, 'parseTutorDiagram ok =', ok, err ?? '');
}
const body = fs.readFileSync('C:/s/heat1-prep/causal-mask-card.body.md', 'utf8');
console.log('diagramProblem =', P.diagramProblem(body));
console.log('numbersIssue =', P.numbersIssue({ body }));
console.log('exports with Problem:', Object.keys(P).filter(k => /problem|issue/i.test(k)).join(','));
try { console.log('explanationProblem(detailed) =', P.explanationProblem({ body, title: 'x' }, 'detailed', 'How does the transformer decoder avoid looking ahead at later words?')); } catch (e) { console.log('explanationProblem threw', e.message); }
