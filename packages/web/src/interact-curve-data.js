// Pure family/template declarations shared with validation without a cycle.
export const independent = Object.freeze({ id: 'x', domain: Object.freeze([-6, 6]) });
export const bounds = Object.freeze([0, 1]);
export const templates = Object.freeze(['curve-one', 'curve-compare', 'curve-readouts']);
export const curveRoles = Object.freeze(['y', 'slope', 'yAtMarker']);
const common = [
  ['heading', 40, 'scene heading; at Detailed write the formula here'],
  ['state.default', 32, 'subtitle at default steepness'],
  ['state.gentler', 32, 'subtitle below default steepness'],
  ['state.steeper', 32, 'subtitle above default steepness'],
  ['axis.x', 24, 'horizontal axis label'], ['axis.y', 24, 'vertical axis label'],
  ['marker.heading', 24, 'marker location callout heading'],
  ['marker.at', 24, 'prefix before the marker input coordinate'],
];
const legend = [['legend.curve', 24, 'curve legend label'], ['legend.tangent', 24, 'tangent legend label']];
export const curveWords = Object.freeze({
  'curve-one': Object.freeze([...common, ['marker.note', 40, 'plain-word callout about the marker output']]),
  'curve-compare': Object.freeze([...common, ...legend]),
  'curve-readouts': Object.freeze([...common, ...legend]),
});
// Direction checks are data: evaluate a quantity at fixed x or at another input.
export const effects = Object.freeze([
  Object.freeze({ input: 'k', quantity: 'slope', at: 'x0', direction: 'increasing' }),
  Object.freeze({ input: 'x0', quantity: 'y', direction: 'decreasing' }),
  Object.freeze({ input: 'xMarker', quantity: 'yAtMarker', direction: 'increasing' }),
]);
