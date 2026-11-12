import { attentionReads, latentExperts, outputGate, recurrentGate } from './gallery-gates-data.js';

const brief = depth => depth === 'brief';
const detailed = depth => depth === 'detailed';
const spec = diagram => ({ version: 1, diagram });
const row = (heading, ...cells) => ({ heading, cells: cells.map(String) });
const matrix = (title, caption, columns, rows) => ({ kind: 'matrix', title, caption, columns, rows });
const tuple = values => '$(' + values.join(',') + ')$';
const reference = (id, prompts, paraphrases, keywords, useWhen, make, detail) => ({
  id: 'figure-' + id, lessons: [], prompts, paraphrases, keywords, useWhen,
  spec: spec(make('balanced')),
  depths: { overview: { spec: spec(make('brief')) },
    deep: { spec: spec(make('detailed')), ...(detail ? { detailSpec: spec(detail()) } : {}) } },
});
const flow = (title, caption, nodes, edges) => ({
  kind: 'flow', title, caption,
  nodes: nodes.map(([id, label, role = 'process']) => ({ id, label, role })),
  edges: edges.map(([from, to]) => ({ from, to })),
});

const gate = recurrentGate;
const recurrent = reference('recurrent-channel-decay',
  ['How does a channel-wise carry gate change a recurrent delta-rule write?'],
  ['Why does Kimi Delta Attention keep a different amount of old memory in each key row?'],
  ['channel wise carry gate change a recurrent delta rule write', 'kimi delta attention keep a different amount of old memory'],
  'Isolate a toy delta-rule update. Different alpha values decay different key rows before computing the write correction, while beta scales the correction. This gate is separate from any gate applied to the attention readout.',
  depth => matrix(brief(depth) ? 'Some memory rows keep more than others' : 'Channel-wise carry before a recurrent write',
    detailed(depth) ? 'Use $A=\\operatorname{diag}(\\alpha)S$ and $S^+=A+\\beta k(v-A^\\top k)^\\top$. Here $k=' +
      '(' + gate.key.join(',') + ')$, $v=(' + gate.target.join(',') + ')$, $\\beta=' + gate.strength + '$.' :
      'Each key row has its own keep amount. The write then adds a correction to the retained memory.' +
      (brief(depth) ? ' One entry per row is shown.' : ''),
    ['Old', 'Keep', 'Carry', 'Write', 'New'],
    gate.previous.map((previous, i) => {
      const display = values => brief(depth) ? values[0] : tuple(values);
      return row('Key row ' + (i + 1), display(previous), gate.keep[i], display(gate.carried[i]),
        display(gate.correction[i]), display(gate.next[i]));
    })));

const attention = reference('attention-output-gate',
  ['Where does the output gate act after attention has read the token values?'],
  ['How does a sigmoid gate on an attention output differ from a gate inside the feed-forward network?'],
  ['output gate act after attention has read the token values', 'sigmoid gate on an attention output differ from a gate inside'],
  'Apply the token-derived gate after the attention read and before the output projection. Local, full and sparse token selection affect which read is produced. The FFN gate and the residual stream gate are separate operations.',
  depth => ({
    kind: 'block-stack',
    title: brief(depth) ? 'Turn down parts of the attention result' : 'Gate the attention read before projecting it',
    caption: detailed(depth) ? 'For attention read $a$, use $y=W_o(g\\odot a)$ with token-derived $g$. Position selection happens first.' :
      'The attention read is already computed. The gate scales it before projection. The feed-forward block comes separately.',
    blocks: [
      { id: 'read', label: brief(depth) ? 'Result from reading earlier tokens' : 'Attention weighted read', role: 'attention' },
      { id: 'gate', label: brief(depth) ? 'Per-entry scale' : 'Elementwise output gate', role: 'attention', merge: 'multiply',
        inputs: [{ label: brief(depth) ? 'Token-based scales' : 'Token-derived sigmoid' }] },
      { id: 'out', label: brief(depth) ? 'Final attention update' : 'Attention output projection', role: 'output' },
    ],
  }),
  () => matrix('Different reads, same gating operation',
    'Hold the toy gate $g=' + '(' + outputGate.join(',') + ')$ fixed to isolate the operation. Real gates can vary across layers and tokens.',
    ['Read values', 'After gate'],
    attentionReads.map(({ scope, values, gated }) => row(scope, tuple(values), tuple(gated)))));

const latent = latentExperts;
const expertNorm = reference('latent-expert-output-normalization',
  ['How does a routed latent expert bank normalize each output before mixing?'],
  ['Why normalize each selected LatentMoE expert output before the weighted sum?'],
  ['routed latent expert bank normalize each output before mixing', 'normalize each selected latentmoe expert output before the weighted sum'],
  'Select experts from the residual-width input, feed only selected experts a reduced representation, normalize each result, then mix and project back. Include no always-on expert. The worked example omits learned RMSNorm scales and epsilon.',
  depth => flow(brief(depth) ? 'Rescale each chosen expert before mixing' : 'Normalize latent expert outputs before mixing',
    detailed(depth) ? 'Use $' + latent.widths[0] + '\\to' + latent.widths[1] + '\\to' + latent.widths[0] +
      '$ toy widths. Sum $\\sum_i w_i\\operatorname{RMSNorm}(e_i)$ over the selected experts only.' :
      'Only the chosen experts run. Normalize each result on its own, mix the results, then return to the wider state.',
    [
      ['a', brief(depth) ? 'Choose which experts run' : 'Select experts from the full-width state'],
      ['b', brief(depth) ? 'Send a smaller state to the chosen routes' : 'Send one reduced latent to selected routes', 'fork'],
      ['c', 'Run expert A'], ['d', 'Run expert B'],
      ['e', brief(depth) ? 'Scale result A' : 'Normalize expert A output'],
      ['f', brief(depth) ? 'Scale result B' : 'Normalize expert B output'],
      ['g', 'Mix the weighted results', 'merge'],
      ['h', brief(depth) ? 'Return to the original width' : 'Project the sum to residual width', 'outcome'],
    ],
    [['a','b'], ['b','c'], ['b','d'], ['c','e'], ['d','f'], ['e','g'], ['f','g'], ['g','h']]),
  () => matrix('Normalize before the weighted sum',
    'Omit learned scales and epsilon. The mixed latent ' + tuple(latent.mixed) + ' projects to ' + tuple(latent.projected) + '.',
    ['Raw output', 'Unit RMS', 'Weighted'],
    latent.experts.map(({ raw, normalized, weighted }, i) =>
      row('Expert ' + (i === 0 ? 'A' : 'B') + ' weight ' + latent.weights[i], tuple(raw), tuple(normalized), tuple(weighted)))));

export const galleryGatesReferences = [recurrent, attention, expertNorm];
