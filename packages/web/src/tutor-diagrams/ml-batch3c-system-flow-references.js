export const references = [
  {
    id: 'ml-churn-goal-prediction-decision',
    lessons: ['19'],
    prompts: ['How does a churn prediction turn into an action that helps reduce cancellations?'],
    keywords: ['churn prediction', 'reducing churn', 'churn goal', 'cancellation probability', 'retention offer'],
    useWhen: 'Separate the business goal, the per-user probability of cancelling within the next 30 days and the decision made each night. Rank eligible users by predicted risk before allocating retention offers.',
    spec: {
      version: 1,
      diagram: {
        kind: 'flow', title: 'From churn goal to action',
        nodes: [
          { id: 'goal', label: 'Reduce cancellations', role: 'process' },
          { id: 'predict', label: 'Predict each user’s 30-day cancellation probability', role: 'process' },
          { id: 'offer', label: 'Send retention offers nightly to the highest-risk 5%', role: 'outcome' },
        ],
        edges: [
          { from: 'goal', to: 'predict', label: 'Prediction target' },
          { from: 'predict', to: 'offer', label: 'Rank by risk' },
        ],
        caption: 'With 1,000 eligible users, 5% allows 50 offers. Use a random holdout to estimate the effect on cancellations.',
      },
    },
  },
  {
    id: 'ml-batch-score-fallback',
    lessons: ['19'],
    prompts: ['How should a churn system keep working if its nightly scoring job fails?'],
    keywords: ['batch scoring failure', 'failed batch scoring', 'nightly scoring job', 'last good scores', 'churn fallback'],
    useWhen: 'On a successful batch, use the new scores. On failure, check whether a saved successful score set exists and is at most 25 hours old. If the set is missing or older, use the inactivity rule with the same nightly offer cap.',
    spec: {
      version: 1,
      diagram: {
        kind: 'flow', title: 'Churn scoring fallback',
        nodes: [
          { id: 'batch', label: 'Did nightly scoring succeed?', role: 'decision' },
          { id: 'fresh', label: 'Use the new scores', role: 'outcome' },
          { id: 'usable', label: 'Can we reuse scores?', role: 'decision' },
          { id: 'last-good', label: 'Use last good scores', role: 'outcome' },
          { id: 'rule', label: 'Apply rule for users idle at least 14 days', role: 'outcome' },
        ],
        edges: [
          { from: 'batch', to: 'fresh', label: 'Batch succeeded' },
          { from: 'batch', to: 'usable', label: 'Batch failed' },
          { from: 'usable', to: 'last-good', label: 'Present and at most 25 h old' },
          { from: 'usable', to: 'rule', label: 'Missing or over 25 h old' },
        ],
        caption: 'Keep the nightly offer cap at 5% of eligible users on all three routes.',
      },
    },
  },
];
