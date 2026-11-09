// Builds sets/figure-chapters.json (owner 2026-11-09): 6 of the 212 figure-chapter references per source chapter (8 chapters, 48 prompts), sampled with a fixed seed.
// Reproduce: node scripts/explain-bench/build-figure-chapters-set.mjs   (writes the file; same bytes every run on the same reference library)
// Field read for the learner prompt: reference.prompts[0] (the primary documented prompt; reference.paraphrases[0] is never used).
// Intended kind = reference.spec.diagram.kind (the Balanced = standard worked reference). Balanced is the bench depth key `standard` (the server accepts overview | standard | deep).
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SEED = 'figure-chapters-2026-11-09', PER_CHAPTER = 6;
const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '../..'), TD = join(ROOT, 'packages/web/src/tutor-diagrams');
const load = async (f, name) => (await import(pathToFileURL(join(TD, f)).href))[name];
const mulberry32 = a => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const seedOf = s => createHash('sha256').update(s).digest().readUInt32BE(0);
// Per chapter: sort by id (independent of module order), seeded Fisher-Yates, first 6, back to id order.
export const sample = (refs, chapter) => { const rnd = mulberry32(seedOf(`${SEED}|${chapter}`)), a = [...refs].sort((x, y) => (x.id < y.id ? -1 : 1));
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, PER_CHAPTER).sort((x, y) => (x.id < y.id ? -1 : 1)); };

export async function chapters() {
  const g = await Promise.all([['figure-gallery-early-references.js', 'figureGalleryEarlyReferences'], ['figure-gallery-supplement-references.js', 'figureGallerySupplementReferences'], ['figure-capacity-references.js', 'figureCapacityReferences'],
    ['gallery-checkpoint-references.js', 'galleryCheckpointReferences'], ['figure-gallery-comparisons-references.js', 'galleryComparisonReferences'], ['figure-gallery-hybrid-references.js', 'galleryHybridReferences'],
    ['gallery-architecture-late-references.js', 'references'], ['gallery-architecture-expansion-references.js', 'references'], ['raschka-late-followup-references.js', 'raschkaLateFollowupReferences'], ['gallery-gates-references.js', 'galleryGatesReferences']].map(([f, n]) => load(f, n)));
  return [['Transformer', await load('transformer-figure-references.js', 'transformerFigureReferences')], ['BERT', await load('bert-figure-references.js', 'bertFigureReferences')], ['GPT-2', await load('gpt2-figure-references.js', 'gpt2FigureReferences')],
    ['Word2vec', await load('word2vec-figure-references.js', 'word2vecFigureReferences')], ['Stable Diffusion', await load('stable-diffusion-figure-references.js', 'stableDiffusionFigureReferences')],
    ['Retrieval Transformer', await load('figure-retrieval-references.js', 'retrievalReferences')],
    ['D2L', [...await load('d2l-figure-references.js', 'd2lFigureReferences'), ...await load('d2l-vision-references.js', 'd2lVisionReferences')]], ['Architecture gallery', g.flat()]];
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('build-figure-chapters-set.mjs')) {
  const { describeTutorDiagram } = await import(pathToFileURL(join(TD, 'spec.js')).href), all = await chapters(), prompts = [];
  for (const [chapter, refs] of all) for (const ref of sample(refs, chapter)) {
    const d = ref.spec.diagram, kind = d.kind, json = JSON.stringify(ref.spec);
    prompts.push({ id: ref.id, group: 'figure-chapter', chapter, referenceId: ref.id, referenceKind: kind, referenceVariant: d.variant ?? null, prompt: ref.prompts[0], needsPicture: false, noPicture: true, badKinds: ['figure', 'timeline'], best: [], acceptable: [],
      depths: { standard: { kinds: [kind], acceptableKinds: [], sketch: [`Core: the reference worked diagram for this question (Balanced), as a JSON spec: ${json}`, `Core, as the renderer describes it: ${describeTutorDiagram(ref.spec)}`, 'Optional: wording, example numbers and detail may differ; the structure (kind, elements, relationships, grouping) is what counts.'] } },
      want: `${kind}${d.variant ? ` (${d.variant})` : ''}`, referenceSpec: ref.spec });
  }
  const set = { name: 'figure-chapters', version: { prompts: `F1 2026-11-09 (6 per chapter, seed ${SEED})`, labels: 'F1 2026-11-09 (expected kind = the reference spec.diagram.kind; no acceptable kinds)' },
    measures: 'Live written /explain on the learner prompts Codex documented for the 212 figure-chapter references: selector hit, kind match, structure against the worked reference (judge faithful-ref-v1), factual.',
    written: `2026-11-09 PT by build-figure-chapters-set.mjs: reference.prompts[0] of 6 seeded-sampled references per source chapter; the worked reference is the sketch`, notation: 'As illustrations: per-depth kinds / acceptableKinds / sketch; depth key standard = Balanced.',
    defaultRuns: 1, defaultDepths: ['standard'], estUsdPerCard: 0.012, pass: {}, prompts };
  writeFileSync(join(HERE, 'sets/figure-chapters.json'), JSON.stringify(set, null, 1) + '\n');
  console.log(`wrote ${prompts.length} prompts: ${all.map(([c]) => `${c} ${prompts.filter(p => p.chapter === c).length}/${all.find(([n]) => n === c)[1].length}`).join(', ')}`);
}
