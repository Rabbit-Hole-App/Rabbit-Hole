import { checkpointRecipes, decoderWidth, routes, visualWidth } from './gallery-checkpoint-data.js';

const spec = diagram => ({ version: 1, diagram });
const brief = depth => depth === 'brief';
const detailed = depth => depth === 'detailed';
const reference = (id, prompts, paraphrases, keywords, useWhen, make, detail) => ({
  id: 'figure-' + id, lessons: [], prompts, paraphrases, keywords, useWhen,
  spec: spec(make('balanced')),
  depths: { overview: { spec: spec(make('brief')) },
    deep: { spec: spec(make('detailed')), ...(detail ? { detailSpec: spec(detail()) } : {}) } },
});
const row = (heading, ...cells) => ({ heading, cells: cells.map(String) });
const matrix = (title, caption, columns, rows) => ({ kind: 'matrix', title, caption, columns, rows });
const flow = (title, caption, nodes, edges) => ({
  kind: 'flow', title, caption,
  nodes: nodes.map(([id, label, role = 'process']) => ({ id, label, role })),
  edges: edges.map(([from, to]) => ({ from, to })),
});
const blocks = items => items.map(([label, role], index) => ({ id: 'b' + index, label, role }));
const tuple = values => '(' + values.join(',') + ')';

const specialization = reference('shared-decoder-checkpoint-specialization',
  ['Can reasoning and coding checkpoints use exactly the same inference decoder blocks?'],
  ['When post-training specializes a checkpoint, can its decoder topology stay the same?'],
  ['reasoning and coding checkpoints use exactly the same inference decoder blocks', 'post training specializes a checkpoint can its decoder topology stay the same'],
  'Show one illustrative dense-to-sparse decoder stack shared by the example checkpoint family. In a separate training track at Detailed, distinguish the coding and reasoning training signals. The example makes no claim that different published families share one stack.',
  depth => ({
    kind: 'block-stack', title: brief(depth) ? 'Different training, same building blocks' : 'One inference layout across specialized checkpoints',
    caption: detailed(depth) ? 'One architecture $f_\\theta$ can have several learned weights $\\theta$. A training reward is not an inference block.' :
      'A coding copy and a reasoning copy can use the same sequence of blocks. Their training can change the numbers inside.',
    blocks: blocks([
      [brief(depth) ? 'Word lookup' : 'Token embeddings', 'embedding'],
      [brief(depth) ? 'Context mixing' : 'Grouped-query attention', 'attention'],
      [brief(depth) ? 'Early shared update' : 'Early dense feed-forward', 'feedforward'],
      [brief(depth) ? 'Later selected updates' : 'Later routed feed-forward', 'feedforward'],
      [brief(depth) ? 'Word scores' : 'Next-token scores', 'output'],
    ]),
  }),
  () => matrix('Specialization happens during training',
    'These are illustrative recipes for copies of one model. All three use the same inference blocks.',
    ['Example training signal', 'Inference layout'],
    checkpointRecipes.map(({ name, signal }) => row(name, signal, 'Same block order'))));

const multimodal = reference('modality-frontends-text-decoder',
  ['How do multimodal input encoders feed one shared text decoder?'],
  ['What happens before a shared text decoder can read image and text inputs?'],
  ['multimodal input encoders feed one shared text decoder', 'before a shared text decoder can read image and text inputs'],
  'Separate vision encoding and feature projection from text embedding. The shared causal text decoder receives decoder-width representations after both front ends. Do not imply the figure lists the exact modules of a named product.',
  depth => flow(brief(depth) ? 'Different input readers, one text writer' : 'Modality front ends feed a shared text decoder',
    detailed(depth) ? 'Toy image features have width $' + visualWidth + '$. The projection makes them width $' + decoderWidth +
      '$, matching the text states consumed by the decoder.' :
      'Image and text readers work separately. Their outputs meet at the shared decoder, which writes text.',
    [
      ['a', 'Read image and text inputs', 'fork'],
      ['v', 'Encode the image'],
      ['p', brief(depth) ? 'Match the image feature size' : 'Project visual features to decoder width'],
      ['t', 'Read text token embeddings'],
      ['m', brief(depth) ? 'Join the prepared inputs' : 'Assemble decoder token states', 'merge'],
      ['o', 'Generate text with the shared decoder', 'outcome'],
    ],
    [['a', 'v'], ['a', 't'], ['v', 'p'], ['p', 'm'], ['t', 'm'], ['m', 'o']]));

const identityShortcut = reference('learned-and-identity-shortcut',
  ['How does a shortcut MoE combine a learned expert with an identity route?'],
  ['What does an identity expert return in a LongCat-style shortcut mixture?'],
  ['shortcut moe combine a learned expert with an identity route', 'identity expert return in a longcat style shortcut mixture'],
  'Start from a token state that may include nearby-token embedding features. Run a dense branch separately from the shortcut. In the selected shortcut, one learned expert computes an update and the identity route contributes the unchanged input.',
  depth => flow(brief(depth) ? 'One shortcut route keeps the input' : 'Mix a learned expert and an identity route',
    detailed(depth) ? 'Two coordinates: $' + routes.weights[0] + tuple(routes.learned) + '+' +
      routes.weights[1] + tuple(routes.input) + '=' + tuple(routes.shortcut) + '$. Add this shortcut mix to the separate dense branch.' :
      'The unchanged state still contributes without running an expert network. The dense output is computed separately.',
    [
      ['a', 'Read token and nearby-word features'],
      ['c', 'Choose shortcut routes', 'fork'],
      ['d', 'Run the learned expert'],
      ['e', 'Pass the state unchanged'],
      ['f', 'Mix the shortcut routes', 'merge'],
      ['h', 'Add the shortcut to the dense output', 'outcome'],
    ],
    [['a', 'c'], ['c', 'd'], ['c', 'e'], ['d', 'f'], ['e', 'f'], ['f', 'h']]),
  () => matrix('The dense and shortcut outputs add',
    'The dense path runs separately. Add its two shown coordinates to the weighted shortcut result.',
    ['First entry', 'Second entry'],
    [row('Dense path', ...routes.dense), row('Shortcut sum', ...routes.shortcut), row('Combined', ...routes.combined)]));

export const galleryCheckpointReferences = [specialization, multimodal, identityShortcut];
