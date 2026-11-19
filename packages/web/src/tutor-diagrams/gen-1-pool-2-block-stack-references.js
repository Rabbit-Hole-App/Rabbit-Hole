import { derived } from './gen-1-pool-2-block-stack-data.js';

export { derived };

const block = (id, label, dims, role) => ({ id, label, ...(dims ? { dims } : {}), ...(role ? { role } : {}) });
const stack = (title, blocks, caption) => ({ version: 1, diagram: { kind: 'block-stack', title, blocks, caption } });
const makeReference = ({ id, prompt, keywords, useWhen, overview, standard, deep }) => ({
  id, lessons: [], prompts: [prompt], keywords, useWhen, illustrative: true, spec: standard,
  depths: { overview: { spec: overview }, standard: { spec: standard }, deep: { spec: deep } },
});

const data = derived();
const toasterId = 'pool-pop-up-toaster-stages';
const toaster = data[toasterId];
const toasterStages = [
  block('carriage', 'Bread carriage', `${toaster.carriage} s`),
  block('warmup', 'Chamber warm-up', `${toaster.warmup} s`),
  block('browning', 'Browning period', `${toaster.browning} s`, 'changed'),
  block('lift', 'Toast pops up', `${toaster.lift} s`, 'output'),
];
const toasterReference = makeReference({
  id: toasterId,
  prompt: 'What are the timed stages of a pop-up toaster cycle?',
  keywords: ['toaster cycle', 'toaster browning'],
  useWhen: 'Show the ordered stages of a single timed cycle.',
  overview: stack('A pop-up toaster cycle', [
    block('carriage', 'Bread carriage'),
    block('chamber', 'Bread browns in chamber', undefined, 'changed'),
    block('lift', 'Toast pops up', undefined, 'output'),
  ], 'Illustrative cycle. The carriage holds the bread in the chamber until the lift raises it.'),
  standard: stack('Time in each toaster stage', toasterStages,
    'Illustrative timing. Each label gives the time spent in that stage.'),
  deep: stack('Where the toaster cycle spends its time', toasterStages,
    `Illustrative timing. Browning takes ${toaster.browning} of the ${toaster.cycle} seconds. The other stages take ${toaster.outsideBrowning} seconds together.`),
});

const waterId = 'pool-mesh-and-paper-water-filter';
const water = data[waterId];
const filterStages = [
  block('feed', 'Feed cup', `${water.feed} mg grit`),
  block('mesh', 'Mesh screen', `${water.afterMesh} mg grit`, 'changed'),
  block('paper', 'Paper disk', `${water.afterPaper} mg grit`, 'changed'),
  block('cup', 'Collection cup', `${water.afterPaper} mg grit`, 'output'),
];
const filterReference = makeReference({
  id: waterId,
  prompt: 'How much grit gets through the mesh and paper water filter?',
  keywords: ['grit filter pour', 'paper water filter'],
  useWhen: 'Trace the mass of suspended grit through successive filter stages.',
  overview: stack('A mesh and paper filter', [
    block('feed', 'Feed cup'),
    block('screens', 'Mesh and paper', undefined, 'changed'),
    block('cup', 'Collection cup', undefined, 'output'),
  ], 'Illustrative pour. Water carries grit into the filters and then reaches the collection cup.'),
  standard: stack('Grit carried through each filter stage', filterStages,
    'Illustrative pour. The label on each filter shows how much grit passes through it.'),
  deep: stack('Grit captured in a filter pour', filterStages,
    `Illustrative pour. The mesh and disk catch ${water.captured} mg together. The collection cup receives the remaining ${water.afterPaper} mg.`),
});

const parcelId = 'pool-parcel-sorting-line';
const parcel = data[parcelId];
const parcelStages = [
  ['intake', 'Intake belt'],
  ['scanner', 'Barcode scanner'],
  ['chute', 'Route chute', 'changed'],
  ['cart', 'Dispatch cart', 'output'],
].map(([id, label, role], index) => block(id, label, `${parcel.stations[index]} m`, role));
const parcelReference = makeReference({
  id: parcelId,
  prompt: 'How far does a parcel travel along the sorting line from intake to dispatch?',
  keywords: ['parcel sorting line', 'parcel dispatch cart'],
  useWhen: 'Show the ordered stations and cumulative distance along a parcel route.',
  overview: stack('A parcel route through the depot', [
    block('intake', 'Intake belt'),
    block('sorting', 'Sorting station', undefined, 'changed'),
    block('cart', 'Dispatch cart', undefined, 'output'),
  ], 'Illustrative route. The sorting station sends the parcel to its dispatch cart.'),
  standard: stack('Station positions on a parcel sorting line', parcelStages,
    'Illustrative route. Each label gives the distance traveled from the intake.'),
  deep: stack('Distance along the parcel sorting line', parcelStages,
    `Illustrative route. The scanner-to-chute stretch covers ${parcel.longest} m, the longest of ${parcel.stretchCount} stretches. The full route is ${parcel.route} m.`),
});

export const references = [toasterReference, filterReference, parcelReference];
