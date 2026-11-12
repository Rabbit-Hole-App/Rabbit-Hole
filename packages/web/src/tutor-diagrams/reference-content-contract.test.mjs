import test from 'node:test';
import assert from 'node:assert/strict';
import kindGallery from './kind-gallery.json' with { type: 'json' };
import { diagramReferences } from './reference-library.js';
import { lintDiagramContent } from './content-contract.js';

test('all reference diagrams and gallery shapes follow the authored content contracts', () => {
  const records = [...diagramReferences, ...kindGallery.map(spec => ({ id: `shape-${spec.diagram.kind}`, spec }))];
  const findings = records.flatMap(({ id, spec }) => lintDiagramContent(spec).map(issue => ({ id, ...issue })));
  assert.deepEqual(findings, [], findings.map(({ id, rule, path, message }) =>
    `${id} ${rule} ${path.join('.')}: ${message}`).join('\n'));
});
