import { doubleGlazing, gravity, hangingSign, slidingCrate } from './gen-1-figure-data.js';

function drawing(base, title, callouts, caption) {
  return { spec: { version: 1, diagram: { kind: 'figure', ...base, title, callouts, caption } } };
}

const sign = { figure: 'free-body', unit: 'N', vectors: hangingSign.vectors };
const signDepths = {
  overview: drawing(sign, 'A hanging shop sign', [
    { anchor: 'body', label: 'Shop sign' },
    { anchor: 'up', label: 'Cable pull' },
    { anchor: 'down', label: 'Weight' },
  ], 'The sign hangs still as the cable pull balances its weight.'),
  standard: drawing(sign, 'Forces on a hanging shop sign', [
    { anchor: 'body', label: 'Shop sign', detail: `Mass is ${hangingSign.mass} kg in this worked case.` },
    { anchor: 'up', label: 'Cable tension', detail: 'The cable pulls vertically upward.' },
    { anchor: 'down', label: 'Weight', detail: 'Gravity pulls downward.' },
  ], 'Equal forces in opposite directions keep the sign in equilibrium.'),
  deep: drawing(sign, 'Why the hanging sign stays still', [
    { anchor: 'body', label: 'Shop sign', detail: `The sign has a mass of ${hangingSign.mass} kg.` },
    { anchor: 'up', label: 'Cable tension', detail: 'Tension equals the weight while the sign hangs still.' },
    { anchor: 'down', label: 'Weight', detail: `Multiply the mass by the assumed gravity of ${gravity} N per kg.` },
  ], `The net vertical force is ${hangingSign.netVertical} N.`),
};

const crate = { figure: 'free-body', unit: 'N', vectors: slidingCrate.vectors };
const crateDepths = {
  overview: drawing(crate, 'A shipping crate sliding right', [
    { anchor: 'body', label: 'Shipping crate' },
    { anchor: 'right', label: 'Push' },
    { anchor: 'left', label: 'Sliding friction' },
  ], 'The crate speeds up to the right because the push exceeds friction.'),
  standard: drawing(crate, 'Forces on a sliding shipping crate', [
    { anchor: 'body', label: 'Shipping crate', detail: 'The crate is already sliding to the right.' },
    { anchor: 'right', label: 'Push', detail: 'The push is horizontal.' },
    { anchor: 'left', label: 'Sliding friction', detail: 'Friction acts opposite the motion.' },
    { anchor: 'up', label: 'Floor support', detail: 'Support and weight balance vertically.' },
  ], `The net horizontal force is ${slidingCrate.netHorizontal} N to the right.`),
  deep: drawing(crate, 'What speeds up the shipping crate', [
    { anchor: 'body', label: 'Shipping crate', detail: `The crate has a mass of ${slidingCrate.mass} kg.` },
    { anchor: 'right', label: 'Push', detail: 'Subtract friction from the push to get the net horizontal force.' },
    { anchor: 'left', label: 'Sliding friction', detail: `Multiply the floor support force by ${slidingCrate.frictionCoefficient}.` },
    { anchor: 'up', label: 'Floor support', detail: 'The crate has no vertical acceleration.' },
  ], `A net ${slidingCrate.netHorizontal} N to the right increases speed by ${slidingCrate.acceleration} meters per second each second.`),
};

const windowSection = { figure: 'cross-section' };
const glazingLayers = doubleGlazing.layers.map(({ anchor, label, thickness }) =>
  ({ anchor, label: `${label} · ${thickness} mm` }));
const measuredLayers = doubleGlazing.layers.map(({ anchor, label, thickness }) =>
  ({ anchor, label, detail: `${thickness} mm thick in this worked section.` }));
const glazingDepths = {
  overview: drawing(windowSection, 'Inside a double-glazed window',
    glazingLayers, 'Glass panes enclose a sealed air gap.'),
  standard: drawing(windowSection, 'Double glazing in cross-section',
    measuredLayers, `The panes and gap span ${doubleGlazing.totalThickness} mm in this schematic example.`),
  deep: drawing(windowSection, 'Thickness through double glazing', [
    ...measuredLayers,
    { anchor: 'interface', label: 'Glass meets air', detail: `The gap starts ${doubleGlazing.interfaceDepth} mm from the outside face.` },
  ], `The sealed gap accounts for ${doubleGlazing.gapPercent}% of the section’s ${doubleGlazing.totalThickness} mm thickness.`),
};

export const references = [
  {
    id: 'pool-hanging-shop-sign',
    lessons: [],
    prompts: ['How do cable tension and weight balance on a hanging shop sign?'],
    keywords: ['hanging shop sign', 'shop sign tension'],
    useWhen: 'Draw opposite vertical forces on a rectangular sign suspended by a cable.',
    ...signDepths.standard,
    depths: signDepths,
  },
  {
    id: 'pool-sliding-shipping-crate',
    lessons: [],
    prompts: ['Which forces act on a sliding shipping crate pushed along a level floor?'],
    keywords: ['sliding shipping crate', 'shipping crate friction'],
    useWhen: 'Draw horizontal push and sliding friction with vertical floor support and weight.',
    ...crateDepths.standard,
    depths: crateDepths,
  },
  {
    id: 'pool-double-glazed-window',
    lessons: [],
    prompts: ['What is the order of glass and air in the cross-section of a double-glazed window?'],
    keywords: ['double-glazed window', 'double glazing section'],
    useWhen: 'Show the glass panes and air gap of double glazing as flat adjacent layers.',
    ...glazingDepths.standard,
    depths: glazingDepths,
  },
];
