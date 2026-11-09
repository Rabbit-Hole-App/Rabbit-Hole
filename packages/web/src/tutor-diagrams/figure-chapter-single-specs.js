import { centre, centreIndex, maskedContextChoices, sentence } from './word2vec-figure-data.js';
import { contextLimits, experts, localLayersPerGlobal, localWindow } from './raschka-late-followup-data.js';
import { d2lVisionReferences } from './d2l-vision-references.js';

const matrix = (title, caption, columns, rows) => ({ version: 1, diagram: {
  kind: 'matrix', layout: 'teaching', title, caption, columns,
  rows: rows.map(([heading, ...cells], index) => ({ id: `r${index}`, heading, cells })),
} });

const responseMaps = d2lVisionReferences.find(ref => ref.id === 'd2l-convolution-filter-maps').spec.diagram.panels;
const filterRows = responseMaps.flatMap(({ diagram }, index) => diagram.rows.map(row => ({
  ...row, label: `Filter ${index + 1}, ${row.label}`,
})));

const left = sentence.slice(0, centreIndex).join(' ');
const right = sentence.slice(centreIndex + 1).join(' ');
const same = value => [value, value];

export const figureChapterSingleSpecs = {
  'ml-word2vec-right-context-clue': {
    useWhen: 'Hold the blank fixed and compare the candidate words before and after revealing the right context.',
    spec: matrix('Compare left-only and two-sided clues',
      'The later words rule out “glows” as an ordinary fit. The observed middle word is “' + centre + '”.',
      ['Before later words', 'After later words'], [
        ['Shown text', left + ' [blank]', left + ' [blank] ' + right],
        ['Plausible words', maskedContextChoices.join(', '), maskedContextChoices.slice(0, 2).join(', ')],
      ]),
  },
  'ml-word2vec-vocabulary-versus-pair': {
    useWhen: 'Show the different inputs, scored candidates and normalization rules of the two objectives in matching rows.',
    spec: matrix('Full vocabulary versus sampled pair objective',
      'Full softmax scores every word. Negative sampling scores one observed neighbor and a few sampled alternatives.',
      ['Full softmax', 'Negative sampling'], [
        ['Input', 'One center word', 'Center and candidate'],
        ['What gets scored', 'All vocabulary choices', 'Observed and sampled pairs'],
        ['Score treatment', 'Normalize the scores together', 'Check each pair separately'],
      ]),
  },
  'ml-stable-diffusion-denoiser-inputs': {
    useWhen: 'Compare input fields and the noise output side by side. Keep the state, timestep and output shape fixed.',
    spec: matrix('Unconditioned and text-conditioned denoising',
      'Text conditioning can change the noise estimate. Its shape still matches the noisy latent.',
      ['Without text', 'With text'], [
        ['State', 'Current noisy latent', 'Current noisy latent'],
        ['Step', 'Current timestep', 'Current timestep'],
        ['Text condition', 'Absent', 'Prompt embeddings'],
        ['Output', 'Noise estimate', 'Noise estimate'],
      ]),
  },
  'ml-stable-diffusion-training-versus-generation': {
    useWhen: 'Align the starting state, direction of noise changes and result for training-example creation and image generation.',
    spec: matrix('Forward training and reverse generation',
      'Encode a clean image to build a labeled example. For generation, start from noise and decode the final latent once.',
      ['Build training examples', 'Generate a new image'], [
        ['Start', 'Encode a clean image', 'Draw a noisy latent'],
        ['Noise step', 'Sample a timestep and add noise', 'Repeat noise prediction and updates'],
        ['Result', 'Keep added noise as the label', 'Decode the final latent into pixels'],
      ]),
  },
  'figure-retro-fact-versus-pattern': {
    useWhen: 'Use one table to contrast a continuation supported by surrounding words with a factual answer supplied by a retrieved notice.',
    spec: matrix('Language pattern or source evidence', 'Familiar wording suggests an ending. The archive notice supplies a specific opening day.',
      ['Prompt fragment', 'Useful clue', 'Ending'], [
        ['Language pattern', 'When it rains, it [blank]', 'Familiar expression', 'pours'],
        ['Retrieved fact', 'Cedar Archive opens [blank]', 'Archive notice', 'Tuesday'],
      ]),
  },
  'd2l-convolution-filter-maps': {
    useWhen: 'Put both sets of response rows in one heatmap. Keep the patch order and color range common to both filters.',
    spec: { version: 1, diagram: {
      kind: 'heatmap', title: 'Different filters on the same field',
      caption: 'Both filters slide over the same windows. The second row of each filter contains its strongest response.',
      columns: responseMaps[0].diagram.columns, range: responseMaps[0].diagram.range, rows: filterRows,
      highlights: responseMaps.flatMap(({ diagram }, index) => diagram.highlights.map(cell => ({
        ...cell, row: cell.row + index * diagram.rows.length,
      }))),
    } },
  },
  'raschka-context-cap-same-experts': {
    useWhen: 'Compare configured input caps. Match the opening FFN, attention schedule, local window and number of active experts per token.',
    spec: { version: 1, diagram: {
      kind: 'matrix', layout: 'teaching', title: 'A longer input cap with the same expert count',
      columns: ['Original input', 'Longer input'],
      rows: [
        { id: 'cap', heading: 'Input cap', cells: contextLimits.map(limit => limit / 1000 + 'k tokens') },
        { id: 'open', heading: 'Opening feed-forward', cells: same('Dense update') },
        { id: 'attn', heading: 'Attention schedule', cells: same(localLayersPerGlobal + ' local, 1 global') },
        { id: 'window', heading: 'Local window', cells: same(localWindow + ' tokens') },
        { id: 'expert', heading: 'Experts per token', cells: same(experts.shared + ' shared, ' + experts.selected + ' of ' + experts.available + ' routed') },
      ],
      emphasis: { rows: ['cap'] },
      caption: 'Only the configured input cap changes. Each setting uses the same number of specialists per token.',
    } },
  },
  'raschka-indexed-attention-only-diff': {
    useWhen: 'Align both toy decoders by stage. Show that indexing changes the eligible attention candidates while preserving the recurrent run and expert update.',
    spec: { version: 1, diagram: {
      kind: 'matrix', layout: 'teaching', title: 'Only the attention lookup changes',
      columns: ['General lookup', 'Indexed lookup'],
      rows: [
        { id: 'state', heading: 'Recurrent mixer run', cells: same('3 layers') },
        { id: 'attn', heading: 'Attention lookup', cells: ['All eligible tokens', 'Indexed shortlist'] },
        { id: 'expert', heading: 'Expert update', cells: same('Shared and routed experts') },
      ],
      emphasis: { rows: ['attn'] },
      caption: 'The index selects candidates before attention. Both variants keep the three recurrent layers and the same expert update.',
    } },
  },
};
