// Small bundled examples: valid specs a component author (T17) may show as
// composition guidance. Never factual authority; never runtime branches.
import pendulumLaw from './pendulum-law.json' with { type: 'json' };
import pipeline from './pipeline.json' with { type: 'json' };

export const EXAMPLES = Object.freeze({ 'pendulum-law': pendulumLaw, pipeline });
