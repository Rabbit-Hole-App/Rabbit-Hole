import { derived } from './gen-1-pool-2-transformation-data.js';

const { grant, tea } = derived();

function transformation({ id, prompts, keywords, useWhen, title, captions, inputs, scoreLabel, shareLabel, operation, leaderLabel }) {
  const depths = Object.fromEntries(Object.entries(captions).map(([level, caption]) => [level, {
    spec: {
      version: 1,
      diagram: {
        kind: 'transformation',
        title,
        caption,
        before: { label: scoreLabel, items: inputs.items },
        after: { label: shareLabel },
        operation,
        op: 'softmax',
        ...(inputs.temperature === undefined ? {} : { t: inputs.temperature }),
        ...(level === 'overview' ? {} : {
          links: [{ from: inputs.leader, to: inputs.leader, label: leaderLabel }],
        }),
      },
    },
  }]));
  return { id, lessons: [], prompts, keywords, shortKeywords: keywords, useWhen, depths, spec: depths.standard.spec };
}

export const references = Object.freeze([
  transformation({
    id: 'pool-garden-grant-softmax',
    prompts: ['Show how softmax turns community garden grant scores into shares.'],
    keywords: ['garden grant scores', 'garden grant shares'],
    useWhen: 'Compute budget shares from project ratings with softmax.',
    title: 'Split a community garden grant',
    captions: {
      overview: 'Illustrative. Each row shows a project score and its share of the grant.',
      standard: 'Illustrative. Exponentiating separates the scores. Dividing by the sum gives each project a share of the same budget.',
      deep: `Illustrative. At the displayed share, raised beds get ${grant.leaderDollars} dollars of a ${grant.budget}-dollar grant.`,
    },
    inputs: grant,
    scoreLabel: 'Project scores',
    shareLabel: 'Grant shares',
    operation: 'Exponentiate, then divide by the sum',
    leaderLabel: 'Largest grant share',
  }),
  transformation({
    id: 'pool-fruit-tea-blend-softmax',
    prompts: ['How does softmax with temperature turn fruit tea tasting scores into a blend?'],
    keywords: ['fruit tea blend', 'tea tasting scores'],
    useWhen: 'Convert tasting scores to a fruit blend with temperature-scaled softmax.',
    title: 'Mix a fruit tea from tasting scores',
    captions: {
      overview: 'Illustrative. Read each ingredient score next to its share of the blend.',
      standard: 'Illustrative. Dividing before exponentiation pulls the scores closer, so the leading flavor gets less of the blend.',
      deep: `Illustrative. Scaling the scores brings apple from ${tea.unscaledLeaderPercent}% to ${tea.leaderPercent}% of the blend.`,
    },
    inputs: tea,
    scoreLabel: 'Tasting scores',
    shareLabel: 'Blend shares',
    operation: `Divide scores by ${tea.temperature}, then apply softmax`,
    leaderLabel: 'Largest blend share',
  }),
]);

export { derived };
