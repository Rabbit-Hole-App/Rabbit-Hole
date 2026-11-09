// Projection mechanism from The Illustrated Transformer.
// https://jalammar.github.io/illustrated-transformer/#self-attention-in-detail
import { headWidth, heads, inputs, modelWidth, queryIndex, sentence } from './transformer-walkthrough-data.js';

const { queries, keys, values } = heads[0];
const phrase = sentence.join(' ');
const queryToken = sentence[queryIndex];

function projectionSpec({
  inputName, outputNames, caption, showValues = true,
  title = 'One token, three attention projections',
  beforeLabel = 'Input for ' + queryToken, afterLabel = 'Projected vectors',
  operation = 'Multiply by the learned weight matrices',
  inputDimensions = '1 × ' + modelWidth,
  outputDimensions = '1 × ' + headWidth,
}) {
  const strip = (row, dimensions, name, role) => ({
    tensor: { rows: 1, columns: row.length, dimensions, name, ...(showValues ? { values: row } : {}), role },
  });
  return {
    version: 1,
    diagram: {
      kind: 'transformation', title,
      before: { label: beforeLabel, items: [strip(inputs[queryIndex], inputDimensions, inputName, 'input')] },
      after: {
        label: afterLabel,
        items: [queries, keys, values].map((rows, i) => strip(rows[queryIndex], outputDimensions, outputNames[i], 'output')),
      },
      operation,
      links: [{ from: 0, to: 0 }, { from: 0, to: 1 }, { from: 0, to: 2 }],
      caption,
    },
  };
}

export const tensorReferences = [{
  id: 'ml-transformer-qkv-projections', lessons: [],
  prompts: ['How does a transformer get query, key and value vectors from one token?'],
  paraphrases: [
    'How does the word sat turn into three vectors for attention?',
    'Why does one token need three different projections in attention?',
  ],
  keywords: [
    'query key and value vectors', 'qkv projections', 'learned weight matrices',
    'turn into three vectors for attention', 'three different projections in attention',
  ],
  useWhen: 'Start with the embedding of sat plus its position encoding. Apply one separately learned matrix for each of query, key and value. The numbers are from head one of the shared walkthrough.',
  spec: projectionSpec({
    inputName: 'Embedding plus position',
    outputNames: ['Query', 'Key', 'Value'],
    caption: 'One head for “' + phrase + '”. Four input entries and two entries per output are shown.',
  }),
  depths: {
    overview: {
      spec: projectionSpec({
        title: 'Three jobs for the word ' + queryToken,
        beforeLabel: 'Start with the word', afterLabel: 'Make three rows',
        operation: 'Make each row with a different rule',
        inputName: 'Word row',
        outputNames: ['Ask', 'Match', 'Share'],
        inputDimensions: modelWidth + ' entries',
        outputDimensions: headWidth + ' entries',
        showValues: false,
        caption: 'Use ' + queryToken + ' and its place in “' + phrase + '” to make three rows.',
      }),
    },
    deep: {
      spec: projectionSpec({
        inputName: 'Input $x$', outputNames: ['Query $q$', 'Key $k$', 'Value $v$'],
        caption: 'For ' + queryToken + ' in “' + phrase + '”, $q=xW_Q$, $k=xW_K$, and $v=xW_V$. Four input and two head entries are shown.',
      }),
    },
  },
}];
