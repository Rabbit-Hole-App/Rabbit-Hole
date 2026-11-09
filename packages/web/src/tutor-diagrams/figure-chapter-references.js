import { transformerFigureReferences } from './transformer-figure-references.js';
import { bertFigureReferences } from './bert-figure-references.js';
import { gpt2FigureReferences } from './gpt2-figure-references.js';
import { word2vecFigureReferences } from './word2vec-figure-references.js';
import { stableDiffusionFigureReferences } from './stable-diffusion-figure-references.js';
import { retrievalReferences } from './figure-retrieval-references.js';
import { d2lFigureReferences } from './d2l-figure-references.js';
import { d2lVisionReferences } from './d2l-vision-references.js';

export const figureChapterReferences = Object.freeze([
  ...transformerFigureReferences,
  ...bertFigureReferences,
  ...gpt2FigureReferences,
  ...word2vecFigureReferences,
  ...stableDiffusionFigureReferences,
  ...retrievalReferences,
  ...d2lFigureReferences,
  ...d2lVisionReferences,
]);
