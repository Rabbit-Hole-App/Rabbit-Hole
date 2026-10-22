// Small bundled examples: valid specs a component author (T17) may show as
// composition guidance. Never factual authority; never runtime branches.
import decoderStack from './decoder-stack.json' with { type: 'json' };
import hybridAttention from './hybrid-attention.json' with { type: 'json' };
import pendulumLaw from './pendulum-law.json' with { type: 'json' };
import pipeline from './pipeline.json' with { type: 'json' };
import rinseCycles from './rinse-cycles.json' with { type: 'json' };

export const EXAMPLES = Object.freeze({
  'decoder-stack': decoderStack, 'hybrid-attention': hybridAttention, 'pendulum-law': pendulumLaw, pipeline, 'rinse-cycles': rinseCycles,
});
