const spec = (kind, title, fields) => ({ version: 1, diagram: { kind, title, ...fields } });
const nodes = entries => entries.map(([id, label, role = 'process']) => ({ id, label, role }));
const edges = entries => entries.map(([from, to, label]) => ({ from, to, ...(label ? { label } : {}) }));
const flow = (title, steps, routes) => spec('flow', title, { nodes: nodes(steps), edges: edges(routes) });
const repair = (broken, edit) => {
  const corrected = structuredClone(broken);
  edit(corrected.diagram);
  return corrected;
};
const pair = (id, broken, path, message, edit, keeps, fields = []) => ({
  id, broken, path: ['diagram', ...path], message, corrected: repair(broken, edit), keeps, fields,
});

const twoRoots = flow('Pack a parcel',
  [['order', 'Read order'], ['label', 'Print label'], ['pack', 'Pack parcel', 'outcome']],
  [['label', 'pack', 'Label attached']]);
const oneBranch = flow('Ship an approved parcel',
  [['check', 'Check approval', 'decision'], ['ship', 'Ship parcel', 'outcome']],
  [['check', 'ship', 'Approved']]);
const loop = flow('Correct an address',
  [['read', 'Read order'], ['check', 'Check address'], ['fix', 'Request correction']],
  [['read', 'check', 'Order details'], ['check', 'fix', 'Address needs correction'], ['fix', 'check', 'Recheck corrected address']]);
const unreachable = flow('Archive a repaired ticket',
  [['open', 'Open ticket'], ['archive', 'Archive ticket', 'outcome'], ['check', 'Check attachment'], ['fix', 'Repair attachment']],
  [['open', 'archive', 'Archive requested'], ['check', 'fix', 'Attachment damaged'], ['fix', 'check', 'Verify repaired attachment']]);
const selfEdge = flow('Recheck a parcel seal',
  [['inspect', 'Inspect seal'], ['store', 'Store parcel', 'outcome']],
  [['inspect', 'inspect', 'Inspect again'], ['inspect', 'store', 'Seal checked']]);
const unknown = flow('Send a receipt',
  [['send', 'Send receipt'], ['receive', 'Receive receipt', 'outcome']],
  [['send', 'receve', 'Receipt payload']]);
const repeated = flow('Transmit an order',
  [['read', 'Read order'], ['send', 'Send order', 'outcome']],
  [['read', 'send', 'Order ID'], ['read', 'send', 'Delivery date']]);
const longLabel = flow('Store a checked parcel',
  [['check', 'Check the parcel seal and scan the tracking label before storage'], ['store', 'Store parcel', 'outcome']],
  [['check', 'store', 'Parcel checked']]);

const treeRoots = spec('tree', 'Warehouse rooms', {
  nodes: [{ id: 'site', label: 'Warehouse' }, { id: 'stock', label: 'Stockroom' }],
  caption: 'The warehouse contains the stockroom.',
});
const unknownParent = spec('tree', 'Packing area rooms', {
  nodes: [{ id: 'site', label: 'Warehouse' }, { id: 'stock', label: 'Stockroom', parent: 'packing' }],
  caption: 'The warehouse packing area contains the stockroom.',
});
const timelineEvent = spec('timeline', 'Parcel shipment', {
  layout: 'scaled-lanes', domain: { min: 0, max: 4, unit: 'day' },
  lanes: [{ id: 'shipping', label: 'Shipping', events: [{ id: 'arrive', label: 'Parcel arrives', time: 5 }] }],
});
const unlinked = spec('relationship', 'Reading storage', {
  layout: 'graph', nodes: [{ id: 'sensor', label: 'Sensor' }, { id: 'monitor', label: 'Monitor' }, { id: 'archive', label: 'Archive' }],
  edges: edges([['sensor', 'monitor', 'Sends readings']]),
  caption: 'The monitor stores readings in the archive.',
});
const repeatedPair = spec('relationship', 'Two sensor readings', {
  nodes: [{ id: 'sensor', label: 'Sensor' }, { id: 'monitor', label: 'Monitor' }],
  edges: edges([['sensor', 'monitor', 'Sends a reading'], ['sensor', 'monitor', 'Sends a reading']]),
});
const outOfAxis = spec('coordinate-plot', 'Measured response', {
  x: { label: 'Time', min: 0, max: 2 }, y: { label: 'Response', min: 0, max: 2 },
  series: [{ label: 'Observed', kind: 'line', points: [{ x: 0, y: 0 }, { x: 2, y: 4, label: 'Result' }] }],
});

// Expected repairs are static fixture values. Each retains the original
// payload, operation, relationship or observation that caused the error.
export const correctionCorpus = [
  pair('flow-two-roots', twoRoots, ['nodes'], /exactly one root/, d => {
    d.edges.unshift(...edges([['order', 'label', 'Use order details']]));
  }, ['Read order', 'Print label', 'Pack parcel', 'Label attached']),
  pair('flow-one-branch-decision', oneBranch, ['nodes', 0], /decision needs two or three/, d => {
    d.nodes[0].role = 'process';
  }, ['Check approval', 'Ship parcel', 'Approved'], [
    [['nodes', 0, 'role'], 'process'],
    [['edges', 0], oneBranch.diagram.edges[0]],
  ]),
  pair('flow-loop', loop, ['edges'], /cycle or unreachable/, d => {
    d.nodes.push(...nodes([['retry', 'Recheck corrected address', 'outcome']]));
    d.edges[2].to = 'retry';
    d.caption = 'Run the address check again after receiving the correction.';
  }, ['Read order', 'Check address', 'Request correction', 'Recheck corrected address']),
  pair('flow-unreachable', unreachable, ['edges'], /cycle or unreachable/, d => {
    d.nodes.push(...nodes([['verify', 'Verify repaired attachment']]));
    d.edges = edges([
      ['open', 'check', 'Inspect before archiving'], ['check', 'fix', 'Attachment damaged'],
      ['fix', 'verify', 'Verify repaired attachment'], ['verify', 'archive', 'Archive requested'],
    ]);
  }, ['Open ticket', 'Archive ticket', 'Check attachment', 'Repair attachment', 'Verify repaired attachment', 'Archive requested']),
  pair('flow-self-edge', selfEdge, ['edges', 0], /connect a node to itself/, d => {
    d.nodes.splice(1, 0, ...nodes([['again', 'Inspect seal again']]));
    d.edges = edges([['inspect', 'again', 'Inspect again'], ['again', 'store', 'Seal checked']]);
  }, ['Inspect seal', 'Inspect again', 'Seal checked', 'Store parcel']),
  pair('flow-unknown-node', unknown, ['edges', 0], /unknown node/, d => {
    d.edges[0].to = 'receive';
  }, ['Send receipt', 'Receive receipt', 'Receipt payload']),
  pair('flow-repeated-edge', repeated, ['edges', 1], /repeat the same directed node pair/, d => {
    d.edges = edges([['read', 'send', 'Order ID and delivery date']]);
  }, ['Read order', 'Send order', 'Order ID', 'delivery date']),
  pair('flow-label-over-limit', longLabel, ['nodes', 0, 'label'], /at most 60 characters/, d => {
    d.nodes = nodes([['check', 'Check the parcel seal'], ['scan', 'Scan the tracking label'], ['store', 'Store parcel', 'outcome']]);
    d.edges = edges([['check', 'scan'], ['scan', 'store', 'Parcel checked']]);
  }, ['Check the parcel seal', 'Scan the tracking label', 'Store parcel', 'Parcel checked']),
  pair('tree-two-roots', treeRoots, ['nodes'], /tree needs one root/, d => {
    d.nodes[1].parent = 'site';
  }, ['Warehouse', 'Stockroom'], [[['nodes', 1, 'parent'], 'site']]),
  pair('tree-unknown-parent', unknownParent, ['nodes', 1, 'parent'], /parent refers to an unknown node/, d => {
    d.nodes.push({ id: 'packing', label: 'Packing area', parent: 'site' });
  }, ['Warehouse', 'Stockroom', 'Packing area'], [[['nodes', 1, 'parent'], 'packing']]),
  pair('timeline-event-outside-range', timelineEvent, ['lanes', 0, 'events', 0, 'time'], /within the declared domain/, d => {
    d.domain.max = 5;
  }, ['Parcel arrives', 'Shipping'], [[['lanes', 0, 'events', 0, 'time'], 5]]),
  pair('relationship-unlinked-node', unlinked, ['nodes'], /Every relationship node needs a link/, d => {
    d.edges.push(...edges([['monitor', 'archive', 'Stores readings']]));
  }, ['Sensor', 'Monitor', 'Archive', 'Sends readings', 'Stores readings']),
  pair('relationship-repeated-labelled-pair', repeatedPair, ['edges', 1], /labeled relationship cannot repeat/, d => {
    d.edges = edges([['sensor', 'monitor', 'Sends two readings']]);
  }, ['Sensor', 'Monitor', 'Sends two readings']),
  pair('plot-point-outside-axes', outOfAxis, ['series', 0, 'points', 1], /outside the axis bounds/, d => {
    d.y.max = 4;
  }, ['Observed', 'Result'], [[['series', 0, 'points', 1], { x: 2, y: 4, label: 'Result' }]]),
];
