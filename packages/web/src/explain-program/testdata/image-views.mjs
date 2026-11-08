// Offline example for the trusted, repository-owned photo. The state keeps only the selected region ID.
export const imageViewsFixture = {
  manifest: {
    title: 'Inspect two patches in one photograph',
    summary: 'Select a region in the overview to see the same crop at two panel sizes.',
    description: 'A full photograph with two selectable rectangles and two details of the selected rectangle.',
    assumptions: ['Both details use the exact same pixels from the same photograph.'],
    inputs: [], readouts: [], capabilities: [],
    viewport: { width: 840, height: 360 },
    actions: [{ id: 'clear', label: 'Clear selection' }],
    targets: [{ id: 'study.overview.wide', label: 'Wide patch' }, { id: 'study.overview.tall', label: 'Tall patch' }],
  },
  source: String.raw`
const regions = [
  { id: 'wide', x: 0.125, y: 0.25, w: 0.5, h: 0.25 },
  { id: 'tall', x: 0.625, y: 0.125, w: 0.25, h: 0.5 },
];
const views = [
  { id: 'overview', mode: 'overview', x: 20, y: 56, w: 280, h: 200 },
  { id: 'large', mode: 'detail', x: 320, y: 56, w: 180, h: 260 },
  { id: 'small', mode: 'detail', x: 530, y: 56, w: 260, h: 100 },
];
export function initialState() { return { selected: null }; }
export function reduce({ state, event }) {
  if (event.type === 'action' && event.action === 'clear') return initialState();
  if (event.type !== 'select') return state;
  const region = regions.find(region => 'study.overview.' + region.id === event.target);
  return region ? { selected: region.id } : state;
}
export function evaluate({ state }) {
  const objects = [
    sdk.text('overview-label', 20, 32, 'Full photograph'),
    sdk.text('large-label', 320, 32, 'Selected patch'),
    sdk.text('small-label', 530, 32, 'Same patch at a smaller size'),
    ...sdk.imageViews('study', { asset: 'vlm-patch-source', views, regions, selected: state.selected }),
  ];
  return { frame: sdk.frame(objects, { width: 840, height: 360 }), quantities: {} };
}
`,
};
