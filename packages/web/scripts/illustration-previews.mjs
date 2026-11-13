import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  batch1FollowupReferences, estimationEvaluationReferences, illustrationReferences, transformerWalkthroughReferences,
} from '../src/tutor-diagrams/reference-library.js';
import { figureChapterReferences } from '../src/tutor-diagrams/figure-chapter-references.js';
import { lessonDecisionTreesReferences } from '../src/tutor-diagrams/lesson-decision-trees-references.js';
import { figureChapterSingleSpecs } from '../src/tutor-diagrams/figure-chapter-single-specs.js';
import kindGalleryDepths from '../src/tutor-diagrams/kind-gallery-depths.json' with { type: 'json' };
import { ILLUSTRATION_KINDS } from '../src/tutor-diagrams/illustration-kinds.js';
import { blockStackNaturalWidth } from '../src/tutor-diagrams/block-stack-layout.js';
import { tokenLinksNaturalWidth } from '../src/tutor-diagrams/token-links-layout.js';
import { layouts } from '../src/tutor-diagrams/layouts.js';
import { panelsNaturalWidth } from '../src/tutor-diagrams/ml-composition-layouts.js';
import { renderTutorDiagram } from '../src/tutor-diagrams/TutorDiagram.js';
import { convergingFlow, sequenceBoundarySelfMessages, sequenceSelfMessage } from './batch-1-followup-fixtures.mjs';

const depthNames = { overview: 'brief', standard: 'balanced', deep: 'detailed' };

export function* illustrationSpecs() {
  const references = [
    ...illustrationReferences, ...transformerWalkthroughReferences, ...batch1FollowupReferences, ...figureChapterReferences,
    ...lessonDecisionTreesReferences, ...estimationEvaluationReferences,
  ];
  for (const ref of new Set(references)) {
    yield { id: ref.id, spec: ref.spec, ...(ref.detailSpec ? { detail: true } : {}) };
    if (ref.detailSpec) yield { id: `${ref.id}-detail`, spec: ref.detailSpec };
    for (const [key, { spec, detailSpec }] of Object.entries(ref.depths ?? {})) {
      const id = `${ref.id}-${depthNames[key]}`;
      yield { id, spec, ...(detailSpec ? { detail: true } : {}) };
      if (detailSpec) yield { id: `${id}-detail`, spec: detailSpec };
    }
  }
  for (const [id, { spec }] of Object.entries(figureChapterSingleSpecs)) yield { id: `${id}-single`, spec };
  for (const { kind, ...depths } of kindGalleryDepths) {
    if (!ILLUSTRATION_KINDS.includes(kind)) continue;
    for (const [key, spec] of Object.entries(depths)) {
      const suffix = key === 'standard' ? '' : `-${depthNames[key]}`;
      yield { id: `shape-${kind}${suffix}`, spec };
    }
  }
  yield { id: 'flow-converging-arrivals', spec: convergingFlow };
  yield { id: 'sequence-self-message', spec: sequenceSelfMessage };
  yield { id: 'sequence-boundary-self-messages', spec: sequenceBoundarySelfMessages };
}

function naturalWidth(diagram, { compact = false } = {}) {
  if (diagram.kind === 'token-links') return tokenLinksNaturalWidth(diagram, { compact });
  if (diagram.kind === 'block-stack') return blockStackNaturalWidth(diagram);
  if (diagram.kind === 'comparison' && diagram.variant === 'panels') {
    return Math.min(960, panelsNaturalWidth(diagram.panels.map(panel => naturalWidth(panel.diagram, { compact: true }))));
  }
  return layouts[diagram.kind](diagram, 320).width;
}

export function* illustrationCases() {
  for (const { id, spec, detail } of illustrationSpecs()) {
    const sizes = { 408: 408, natural: Math.max(320, naturalWidth(spec.diagram)), 960: 960 };
    const row = spec.diagram.kind === 'block-stack' && spec.diagram.orientation === 'horizontal';
    if (row || (detail && spec.diagram.callouts?.length)) sizes[320] = 320;
    for (const [size, available] of Object.entries(sizes)) yield { key: `${id}/${size}`, id, size, spec, available };
  }
}

export function exportIllustrationPreviews(out) {
  const output = resolve(out), records = {};
  for (const { id, key, size, spec, available } of illustrationCases()) {
    if (!records[id]) {
      mkdirSync(join(output, id), { recursive: true });
      writeFileSync(join(output, id, 'spec.json'), JSON.stringify(spec, null, 2) + '\n');
      records[id] = { kind: spec.diagram.kind, renders: {} };
    }
    const { element, width, height } = renderTutorDiagram(spec, available);
    writeFileSync(join(output, `${key}.svg`), renderToStaticMarkup(element) + '\n');
    records[id].renders[size] = { requested: available, width, height };
  }
  writeFileSync(join(output, 'manifest.json'), JSON.stringify(records, null, 2) + '\n');
  return records;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = process.argv[2];
  if (!out) throw new Error('Usage: node packages/web/scripts/illustration-previews.mjs <output-directory>');
  console.log(`Exported ${Object.keys(exportIllustrationPreviews(out)).length} illustration specs to ${resolve(out)}`);
}
