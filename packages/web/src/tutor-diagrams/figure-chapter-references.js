import { transformerFigureReferences } from './transformer-figure-references.js';
import { bertFigureReferences } from './bert-figure-references.js';
import { gpt2FigureReferences } from './gpt2-figure-references.js';
import { word2vecFigureReferences } from './word2vec-figure-references.js';
import { stableDiffusionFigureReferences } from './stable-diffusion-figure-references.js';
import { retrievalReferences } from './figure-retrieval-references.js';
import { d2lFigureReferences } from './d2l-figure-references.js';
import { d2lVisionReferences } from './d2l-vision-references.js';
import { figureGalleryEarlyReferences } from './figure-gallery-early-references.js';
import { figureGallerySupplementReferences } from './figure-gallery-supplement-references.js';
import { figureCapacityReferences } from './figure-capacity-references.js';
import { galleryCheckpointReferences } from './gallery-checkpoint-references.js';
import { galleryComparisonReferences } from './figure-gallery-comparisons-references.js';
import { galleryHybridReferences } from './figure-gallery-hybrid-references.js';
import { references as galleryLateReferences } from './gallery-architecture-late-references.js';
import { references as galleryExpansionReferences } from './gallery-architecture-expansion-references.js';
import { raschkaLateFollowupReferences } from './raschka-late-followup-references.js';
import { galleryGatesReferences } from './gallery-gates-references.js';

export const figureChapterReferences = Object.freeze([
  ...transformerFigureReferences,
  ...bertFigureReferences,
  ...gpt2FigureReferences,
  ...word2vecFigureReferences,
  ...stableDiffusionFigureReferences,
  ...retrievalReferences,
  ...d2lFigureReferences,
  ...d2lVisionReferences,
  ...figureGalleryEarlyReferences,
  ...figureGallerySupplementReferences,
  ...figureCapacityReferences,
  ...galleryCheckpointReferences,
  ...galleryComparisonReferences,
  ...galleryHybridReferences,
  ...galleryLateReferences,
  ...galleryExpansionReferences,
  ...raschkaLateFollowupReferences,
  ...galleryGatesReferences,
]);
