// Pure family/template declarations shared with validation without a cycle.
export const independent = Object.freeze({ id: 'x', domain: Object.freeze([-6, 6]) });
export const bounds = Object.freeze([0, 1]);
export const templates = Object.freeze(['curve-one', 'curve-compare', 'curve-readouts']);
export const curveRoles = Object.freeze(['y', 'slope', 'yAtMarker']);
const common = [
  ['heading', 40, 'scene heading; at Detailed write the formula here'],
  ['state.default', 24, 'subtitle at default steepness'],
  ['state.gentler', 24, 'subtitle below default steepness'],
  ['state.steeper', 24, 'subtitle above default steepness'],
  ['axis.x', 24, 'horizontal axis label'], ['axis.y', 24, 'vertical axis label'],
  ['marker.heading', 16, 'marker location callout heading'],
  ['marker.at', 8, 'prefix before the marker input coordinate'],
  ['readout.y', 24, 'label of the output value in the readouts row'],
];
const legend = [['legend.curve', 12, 'curve legend label'], ['legend.tangent', 12, 'tangent legend label'], ['readout.slope', 24, 'label of the slope value in the readouts row']];
export const curveWords = Object.freeze({
  'curve-one': Object.freeze([...common, ['marker.note', 18, 'plain-word callout about the marker output']]),
  'curve-compare': Object.freeze([...common, ...legend]),
  'curve-readouts': Object.freeze([...common, ...legend]),
});
// Direction checks are data: evaluate a quantity at fixed x or at another input.
export const effects = Object.freeze([
  Object.freeze({ input: 'k', quantity: 'slope', at: 'x0', direction: 'increasing' }),
  Object.freeze({ input: 'x0', quantity: 'y', direction: 'decreasing' }),
  Object.freeze({ input: 'xMarker', quantity: 'yAtMarker', direction: 'increasing' }),
]);
