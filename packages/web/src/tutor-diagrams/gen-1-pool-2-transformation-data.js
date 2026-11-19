import { derivedAfterItems } from './derived.js';

export const grantInputs = {
  budget: 600,
  projects: [
    { label: 'Seed swap', ratings: [0.25, 0.25] },
    { label: 'Tool shed', ratings: [1, 0.5] },
    { label: 'Raised beds', ratings: [1.5, 1] },
  ],
};

export const teaInputs = {
  temperature: 2,
  ingredients: [
    { label: 'Apple', ratings: [2, 1] },
    { label: 'Peach', ratings: [1, 0] },
    { label: 'Berry', ratings: [0, 0] },
  ],
};

function scoreList(options, temperature) {
  const scores = options.map(({ ratings }) => ratings.reduce((total, rating) => total + rating, 0));
  const before = { items: options.map(({ label }, index) => `${label}: ${scores[index]}`) };
  const op = 'softmax';
  const shares = derivedAfterItems({ op, before, t: temperature });
  const leader = scores.indexOf(Math.max(...scores));
  return { items: before.items, scores, shares, leader };
}

export function derived() {
  const grant = scoreList(grantInputs.projects);
  const tea = scoreList(teaInputs.ingredients, teaInputs.temperature);
  const teaUnscaled = scoreList(teaInputs.ingredients);
  const asPercent = share => Math.round(Number(share) * 100);

  return {
    grant: {
      ...grant,
      budget: grantInputs.budget,
      leaderDollars: Math.round(grantInputs.budget * Number(grant.shares[grant.leader])),
    },
    tea: {
      ...tea,
      temperature: teaInputs.temperature,
      leaderPercent: asPercent(tea.shares[tea.leader]),
      unscaledLeaderPercent: asPercent(teaUnscaled.shares[tea.leader]),
    },
  };
}
