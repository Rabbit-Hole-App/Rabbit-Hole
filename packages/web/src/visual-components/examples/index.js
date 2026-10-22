// Small bundled examples: valid specs a component author (T17) may show as
// composition guidance. Never factual authority; never runtime branches.
import attentionStepsQ2 from './attention-steps-q2.json' with { type: 'json' };
import decoderStack from './decoder-stack.json' with { type: 'json' };
import gqa32to8 from './gqa-32-to-8.json' with { type: 'json' };
import hybridAttention from './hybrid-attention.json' with { type: 'json' };
import mamba2MainPath from './mamba2-main-path.json' with { type: 'json' };
import moe8top2 from './moe-8-top2.json' with { type: 'json' };
import pendulumLaw from './pendulum-law.json' with { type: 'json' };
import pipeline from './pipeline.json' with { type: 'json' };
import requestPathParts from './request-path-parts.json' with { type: 'json' };
import rinseCycles from './rinse-cycles.json' with { type: 'json' };

export const EXAMPLES = Object.freeze({
  'attention-steps-q2': attentionStepsQ2,
  'decoder-stack': decoderStack, 'gqa-32-to-8': gqa32to8, 'hybrid-attention': hybridAttention, 'mamba2-main-path': mamba2MainPath, 'moe-8-top2': moe8top2, 'pendulum-law': pendulumLaw, pipeline, 'request-path-parts': requestPathParts, 'rinse-cycles': rinseCycles,
});
