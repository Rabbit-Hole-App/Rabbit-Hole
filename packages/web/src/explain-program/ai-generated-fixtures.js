// ACTUAL /interactive outputs, loaded through the same dev fixture mechanism as the hand-authored examples but kept in their own list.
// Each entry is a card the real backend (brief, author, review, repair) produced from the prompts in docs/features/explain-on-canvas/handoff/ai-example-regeneration-results.md.
// The source and manifest are exactly as the backend saved them (testdata/generated-ai-*.json); nothing here was edited or copied from ai-*-fixture.js.
// A job that FAILED has no accepted card. The last program the backend produced and the reviewer rejected is still real generated output, so it is listed too, under an id ending in -rejected:
// not an accepted result, only a way to run and look at what the pipeline could not get past review without another model call. Their records (findings, failure, cost) stay in testdata.
import convolution from './testdata/generated-ai-convolution.json' with { type: 'json' };
import attention from './testdata/generated-ai-attention.json' with { type: 'json' };
import gradientRun1 from './testdata/generated-ai-gradient-run1.json' with { type: 'json' };
import gradientRun2 from './testdata/generated-ai-gradient-run2.json' with { type: 'json' };
import treeSplit from './testdata/generated-ai-tree-split.json' with { type: 'json' };
import treeSplitRouted from './testdata/generated-ai-tree-split-routed.json' with { type: 'json' };
import classifierThreshold from './testdata/generated-ai-classifier-threshold.json' with { type: 'json' };
import regressionFit from './testdata/generated-ai-regression-fit.json' with { type: 'json' };
import { VISUAL_PROGRAM_STAMPS } from './stamps.js';

// The stamps the backend sealed each card with, by SDK version: loading a generated card must reproduce its stored tuple.
const STAMPS = { 'sdk-2': VISUAL_PROGRAM_STAMPS };

const fixtureOf = (name, record) => {
  const { artifact } = record;
  if (!STAMPS[artifact.sdkVersion]) throw new Error(`generated card ${name} was sealed with ${artifact.sdkVersion}, which has no stamps here`);
  return { id: `fixture-generated-ai-${name}`, manifest: artifact.manifest, source: artifact.source, stamps: STAMPS[artifact.sdkVersion], generated: { jobId: record.job.jobId, prompt: record.prompt } };
};

const rejectedOf = (name, record) => {
  const { rejectedCandidate } = record;
  if (!STAMPS[rejectedCandidate.sealed.sdkVersion]) throw new Error(`rejected candidate ${name} was sealed with ${rejectedCandidate.sealed.sdkVersion}, which has no stamps here`);
  return { id: `fixture-generated-ai-${name}-rejected`, manifest: rejectedCandidate.manifest, source: rejectedCandidate.source, stamps: STAMPS[rejectedCandidate.sealed.sdkVersion],
    generated: { jobId: record.job.jobId, prompt: record.prompt, rejected: true, stopReason: record.job.stopReason } };
};

export const AI_GENERATED_RECORDS = { convolution, attention, 'tree-split': treeSplitRouted, 'classifier-threshold': classifierThreshold };
export const AI_REJECTED_RECORDS = { 'gradient-run1': gradientRun1, 'gradient-run2': gradientRun2, 'tree-split': treeSplit, 'regression-fit': regressionFit };
export const AI_GENERATED_FIXTURES = [
  ...Object.entries(AI_GENERATED_RECORDS).map(([name, record]) => fixtureOf(name, record)),
  ...Object.entries(AI_REJECTED_RECORDS).map(([name, record]) => rejectedOf(name, record)),
];
