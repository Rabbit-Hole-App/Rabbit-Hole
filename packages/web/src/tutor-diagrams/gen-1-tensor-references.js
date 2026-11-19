import { bookletJobs, granolaBatches, stereoFrame } from './gen-1-tensor-data.js';

function tensor(tensorData, name, role, title, caption) {
  return { spec: { version: 1, diagram: { kind: 'tensor', title, tensor: { ...tensorData, name, role }, caption } } };
}

const audio = (title, caption) => tensor(stereoFrame.tensor, 'Channel voltage (mV)', 'input', title, caption);
const audioDepths = {
  overview: audio('Read stereo samples by channel',
    'The top row is the left channel. The bottom row is the right channel. Each column is the same instant for both.'),
  standard: audio('Stereo samples at regular intervals',
    `Moving right advances time by ${stereoFrame.sampleIntervalUs} μs per column. Signed values give voltage relative to neutral.`),
  deep: audio('Channel and time are separate axes',
    `Read across a row to trace a channel or down a column to compare channels. The last sample is ${stereoFrame.frameSpanUs} μs after the first.`),
};

const granola = (title, caption) => tensor(granolaBatches.tensor, 'Oats and raisins (g)', 'input', title, caption);
const granolaDepths = {
  overview: granola('Compare granola batch sizes',
    'Read oats on the left and raisins on the right. Both amounts rise in the larger batches below.'),
  standard: granola('Ingredient amounts by batch size',
    `The rows use portion scales of ${granolaBatches.scales.join(', ')} from top to bottom. The columns are oats and raisins in grams.`),
  deep: granola('The same scale applies to both ingredients',
    `Multiply ${granolaBatches.oatsGrams} g of oats and ${granolaBatches.raisinsGrams} g of raisins by the row's scale. The bottom row totals ${granolaBatches.largestBatchGrams} g.`),
};

const booklets = (title, caption) => tensor(bookletJobs.tensor, 'Pages per job', 'output', title, caption);
const bookletDepths = {
  overview: booklets('Read the booklet print queue',
    'Read down the column to see the finished page count for each job in queue order.'),
  standard: booklets('Store page counts as a column',
    `There is a row for each print job. Multiply the number of folded sheets by ${bookletJobs.pagesPerSheet} pages per sheet.`),
  deep: booklets('Sum over the print-job axis',
    `Add the rows to get ${bookletJobs.totalPages} pages across the queue. This also equals ${bookletJobs.totalSheets} sheets times ${bookletJobs.pagesPerSheet} pages per sheet.`),
};

export const references = [
  {
    id: 'pool-stereo-audio-frame',
    lessons: [],
    prompts: ['How do I read a frame of stereo audio samples arranged by channel?'],
    keywords: ['frame of stereo audio samples', 'stereo sample channel grid'],
    useWhen: 'Show a stereo audio frame with channels in rows and aligned sample times in columns.',
    ...audioDepths.standard,
    depths: audioDepths,
  },
  {
    id: 'pool-granola-batch-ingredients',
    lessons: [],
    prompts: ['How do I use a tensor to compare ingredient amounts for the granola batches?'],
    keywords: ['ingredient amounts for the granola batches', 'granola batch ingredient grid'],
    useWhen: 'Use rows for granola batch sizes and columns for ingredient amounts scaled together.',
    ...granolaDepths.standard,
    depths: granolaDepths,
  },
  {
    id: 'pool-booklet-press-pages',
    lessons: [],
    prompts: ['How can the booklet press page counts be stored in a tensor column?'],
    keywords: ['booklet press page counts', 'booklet print queue tensor'],
    useWhen: 'Use a column tensor to keep one derived page count for each booklet print job in queue order.',
    ...bookletDepths.standard,
    depths: bookletDepths,
  },
];
