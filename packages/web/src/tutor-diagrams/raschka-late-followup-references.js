import {
  cappedScores, contextLimits, experts, localLayersPerGlobal, localWindow, macroblockLengths,
  residualGain, routedLayers, scoreCap,
} from './raschka-late-followup-data.js';

const brief = depth => depth === 'brief';
const detailed = depth => depth === 'detailed';
const versioned = diagram => ({ version: 1, diagram });
const stack = (title, blocks) => ({ kind: 'block-stack', title, blocks });
const block = (id, label, role, extra = {}) => ({ id, label, role, ...extra });
const ref = (id, prompt, paraphrase, keywords, useWhen, make) => ({
  id: 'raschka-' + id, lessons: [], prompts: [prompt], paraphrases: [paraphrase], keywords, useWhen,
  ...make('balanced'), depths: { overview: make('brief'), deep: make('detailed') },
});
function compare(title, caption, headings, build) {
  return { spec: versioned({
    kind: 'comparison', variant: 'panels', title, caption,
    panels: headings.map((heading, index) => ({ heading, diagram: stack(heading, build(index)) })),
  }) };
}

const contextExtension = ref('context-cap-same-experts',
  'Does a longer context need to change how many experts process each token?',
  'Can the same decoder keep its expert routing and accept more input tokens?',
  ['longer context need to change how many experts', 'keep its expert routing and accept more input tokens'],
  'Compare two toy context settings with the same backbone, attention schedule and number of selected experts per token. Effective recall needs separate evaluation.',
  depth => compare(brief(depth) ? 'More input, same specialist count' : 'A larger context cap with the same decoder',
    detailed(depth) ? 'Only the input cap changes. Local windows hold ' + localWindow + ' tokens. Each token uses the shared expert and two of six routed experts.' :
      'Both versions choose the same number of specialists for each token.',
    ['Original input', 'Longer input'], index => [
      block('cap', 'Input cap', 'changed', { dims: contextLimits[index] / 1000 + 'k tokens' }),
      block('open', brief(depth) ? 'Opening update' : 'Dense opening', 'feedforward'),
      block('mix', brief(depth) ? 'Near and far lookback' : 'Local and global attention', 'attention',
        detailed(depth) ? { dims: localLayersPerGlobal + ' local, 1 global' } : {}),
      block('ff', brief(depth) ? 'Same specialist count' : 'Shared and routed experts', 'feedforward'),
    ]));

const unevenMacroblocks = ref('uneven-mixer-macroblocks',
  'Why might a decoder use irregular groups of state-space layers between attention layers?',
  'Can I see uneven stretches of recurrent layers with attention in between?',
  ['irregular groups of state space layers between attention layers', 'uneven stretches of recurrent layers'],
  'Use an illustrative schedule with unequal recurrent runs. Every mixer layer is followed by a token update with a shared expert plus selected routed experts.',
  depth => ({
    spec: versioned({
      ...stack(brief(depth) ? 'Different run lengths, same token update' : 'An uneven state-space and attention schedule', [
        block('s1', brief(depth) ? 'First memory run' : 'Opening state-space layers', 'attention', { repeat: macroblockLengths[0] }),
        block('a1', brief(depth) ? 'First direct lookup' : 'First attention layer', 'attention'),
        block('s2', brief(depth) ? 'Middle memory run' : 'Middle state-space layers', 'attention', { repeat: macroblockLengths[1] }),
        block('a2', brief(depth) ? 'Second direct lookup' : 'Second attention layer', 'attention'),
        block('s3', brief(depth) ? 'Final memory run' : 'Final state-space layers', 'attention', { repeat: macroblockLengths[2] }),
      ]),
      caption: detailed(depth) ? 'Each layer pairs its mixer with the same update rule. Use one shared expert and route to ' + experts.selected + ' of ' + experts.available + ' specialists.' :
        'Each memory or lookup layer is followed by a shared specialist and two chosen specialists.',
    }),
  }));

const residualAndCap = ref('residual-gain-and-soft-logit-cap',
  'Why would a decoder scale residual updates by depth and also cap its output scores?',
  'Are a depth-dependent residual gain and a soft logit cap doing the same thing?',
  ['scale residual updates by depth and also cap', 'depth dependent residual gain and a soft logit cap'],
  'Show the residual multiplier on the transformed update, with the identity path unscaled. A second visual applies a soft cap to each output logit independently.',
  depth => ({
    spec: versioned({
      ...stack(brief(depth) ? 'Scale the updates and bound the scores' : 'Residual gain and output soft capping', [
        block('open', brief(depth) ? 'Full opening update' : 'Dense opening update', 'feedforward',
          detailed(depth) ? { dims: 'Gain ' + residualGain(1) } : {}),
        block('sparse', brief(depth) ? 'Smaller specialist updates' : 'Routed expert updates', 'feedforward',
          { repeat: routedLayers, ...(detailed(depth) ? { dims: 'Ends near ' + residualGain(routedLayers + 1).toFixed(2) } : {}) }),
        block('score', brief(depth) ? 'Bounded scores' : 'Soft-capped output scores', 'output', { detail: 2 }),
      ]),
      caption: detailed(depth) ? String.raw`Add $F_j(h)/\sqrt{j}$ to the unchanged stream. The scoring head applies a separate cap.` :
        'Later layers use a smaller update multiplier. The scoring head bounds the final scores.',
      edges: [{ kind: 'residual', from: 'sparse', to: 'sparse' }],
    }),
    detailSpec: versioned({
      kind: 'coordinate-plot', title: brief(depth) ? 'Extreme scores level off' : 'A smooth soft cap on logits',
      caption: detailed(depth) ? String.raw`At $c=4$, $c\tanh(z/c)$ approaches the limits and preserves score order.` :
        'Near zero the scores change almost as before. Extreme scores approach a limit smoothly.',
      x: { label: 'Raw score', min: -12, max: 12, scale: 'linear' },
      y: { label: 'Final score', min: -scoreCap, max: scoreCap },
      series: [{ label: 'Soft cap', kind: 'line', points: cappedScores }],
    }),
  }));

const mixerOnly = ref('indexed-attention-only-diff',
  'What changes if a hybrid decoder swaps only its attention lookup for an index?',
  'Can a decoder keep its recurrent layers and experts while using indexed attention?',
  ['swaps only its attention lookup for an index', 'recurrent layers and experts while using indexed attention'],
  'Compare a toy hybrid backbone to itself with one mixer replaced. Preserve the recurrent run and expert update and mark only the changed attention stage.',
  depth => compare(brief(depth) ? 'Change only the lookup' : 'Indexed attention in the same hybrid backbone',
    detailed(depth) ? 'The index selects a shortlist before attention. The recurrent schedule and the shared plus routed experts are identical.' :
      'Both models keep the memory layers and token updates. Only the direct lookup changes.',
    ['General lookup', 'Indexed lookup'], index => [
      block('state', brief(depth) ? 'Memory layers' : 'Recurrent mixer layers', 'attention', { repeat: 3 }),
      block('att', index === 0 ?
        (brief(depth) ? 'Look at all allowed tokens' : 'Attention over eligible tokens') :
        (brief(depth) ? 'Look at shortlisted tokens' : 'Attention over indexed candidates'), 'changed'),
      block('ff', brief(depth) ? 'Same specialists' : 'Shared and routed experts', 'feedforward'),
    ]));

export const raschkaLateFollowupReferences = [contextExtension, unevenMacroblocks, residualAndCap, mixerOnly];
