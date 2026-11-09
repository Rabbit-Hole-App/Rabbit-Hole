import assert from 'node:assert/strict';
import test from 'node:test';
import { referencePool, selectDiagramReferences } from '../src/explanation-references.js';
import { deriveVisualRequirements } from '../src/explanation-visuals.js';
import { prepareArtifactAuthorRequest } from '../src/learn-artifact.js';
import { diagramReferences } from '../../web/src/tutor-diagrams/reference-library.js';
import { figureChapterReferences } from '../../web/src/tutor-diagrams/figure-chapter-references.js';

test('the exclusion removes exactly the 212 figure-chapter references from the pool; the default pool is the whole library', () => {
  assert.equal(figureChapterReferences.length, 212);
  assert.equal(referencePool(false), diagramReferences);
  const pool = referencePool(true), ids = new Set(pool.map(ref => ref.id));
  assert.equal(pool.length, diagramReferences.length - 212);
  assert.ok(figureChapterReferences.every(ref => !ids.has(ref.id)));
  assert.ok(diagramReferences.filter(ref => !figureChapterReferences.includes(ref)).every(ref => ids.has(ref.id)));
});

test('EXPLANATION_EXCLUDE_FIGURE_CHAPTERS=on keeps the figure-chapter references out of the author request; unset and any other value leave it unchanged', () => {
  const ref = figureChapterReferences[0], args = ref.prompts[0], plan = env => prepareArtifactAuthorRequest(env, { command: 'explanation', args, visualRequirements: deriveVisualRequirements(args) });
  const ids = request => request.diagramReferences.map(r => r.id);
  assert.equal(selectDiagramReferences({ prompt: args })[0]?.id, ref.id);
  assert.equal(ids(plan({}))[0], ref.id);
  assert.equal(ids(plan({ EXPLANATION_EXCLUDE_FIGURE_CHAPTERS: 'off' }))[0], ref.id);
  const figureIds = new Set(figureChapterReferences.map(r => r.id));
  assert.ok(ids(plan({ EXPLANATION_EXCLUDE_FIGURE_CHAPTERS: 'on' })).every(id => !figureIds.has(id)));
  assert.ok(selectDiagramReferences({ prompt: args, excludeFigureChapters: true }).every(r => !figureIds.has(r.id)));
});
