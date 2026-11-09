const spec = (kind, title, fields) => ({ version: 1, diagram: { kind, title, ...fields } });
const pair = (id, corrected, path, message, damage, keeps, fields = []) => {
  const broken = structuredClone(corrected);
  damage(broken.diagram);
  return { id, broken, path: ['diagram', ...path], message, corrected, keeps, fields };
};

const order = spec('flow', 'Check a delivery address', {
  caption: 'Flagged addresses are held. The highlighted path follows a valid address.',
  nodes: [
    { id: 'open', label: 'Open order', role: 'process' },
    { id: 'review', label: 'Review address', role: 'decision' },
    { id: 'ship', label: 'Ship order', role: 'outcome' },
    { id: 'hold', label: 'Hold order', role: 'outcome' },
  ],
  edges: [
    { from: 'open', to: 'review', label: 'Delivery details' },
    { from: 'review', to: 'ship', label: 'Address valid' },
    { from: 'review', to: 'hold', label: 'Address flagged' },
  ],
  highlightPath: ['open', 'review', 'ship'],
});
const orderWords = ['Open order', 'Review address', 'Ship order', 'Hold order', 'Address valid', 'Address flagged'];
const highlight = (id, path, message, route) => pair(id, order, ['highlightPath', ...path], message, d => {
  d.highlightPath = route;
}, orderWords, [[['highlightPath'], ['open', 'review', 'ship']]]);

const retry = spec('sequence', 'Retry a background job', {
  caption: 'The timer tells the worker to run the retry after backoff.',
  actors: [{ id: 'worker', label: 'Job worker' }, { id: 'timer', label: 'Retry timer' }],
  messages: [{ from: 'timer', to: 'worker', label: 'Backoff elapsed' }],
});
const retryWords = ['Job worker', 'Retry timer', 'Backoff elapsed'];
const retryMessage = [[['messages', 0], { from: 'timer', to: 'worker', label: 'Backoff elapsed' }]];

const fallingObject = spec('figure', 'Weight on a falling object', {
  figure: 'free-body', unit: 'N',
  callouts: [{ anchor: 'body', label: 'Object', detail: 'Without air resistance, gravity pulls down with 10 N.' }],
  vectors: [{ direction: 'down', magnitude: 10, label: 'Weight' }],
});
const supportedLoad = spec('figure', 'Forces on a stationary load', {
  figure: 'free-body', unit: 'N',
  caption: 'Upward tension and downward weight both measure 10 N.',
  callouts: [{ anchor: 'up', label: 'Support cable' }],
  vectors: [
    { direction: 'up', magnitude: 10, label: 'Cable tension' },
    { direction: 'down', magnitude: 10, label: 'Weight' },
  ],
});

const folders = spec('tree', 'Workspace folders', {
  caption: 'Workspace contains Documents, which contains Drafts.',
  nodes: [
    { id: 'workspace', label: 'Workspace' },
    { id: 'docs', label: 'Documents', parent: 'workspace' },
    { id: 'drafts', label: 'Drafts', parent: 'docs' },
  ],
});
const binary = spec('tree', 'Binary search split', {
  layout: 'binary',
  nodes: [
    { id: 'pivot', label: 'Key 5' },
    { id: 'lower', label: 'Key 2', parent: 'pivot', side: 'left' },
    { id: 'higher', label: 'Key 8', parent: 'pivot', side: 'right' },
  ],
});
const binaryWords = ['Key 5', 'Key 2', 'Key 8'];
const binarySlots = [
  [['layout'], 'binary'], [['nodes', 0], { id: 'pivot', label: 'Key 5' }],
  [['nodes', 1, 'side'], 'left'], [['nodes', 2, 'side'], 'right'],
];

const logging = spec('relationship', 'Archive a temperature reading', {
  caption: 'The sensor sends its reading to the archive.',
  nodes: [{ id: 'sensor', label: 'Temperature sensor' }, { id: 'archive', label: 'Reading archive' }],
  edges: [{ from: 'sensor', to: 'archive', label: 'Sends a reading' }],
});
const loggingWords = ['Temperature sensor', 'Reading archive', 'Sends a reading'];
const loggingEdge = [[['edges', 0], { from: 'sensor', to: 'archive', label: 'Sends a reading' }]];

const observation = spec('coordinate-plot', 'One temperature reading', {
  caption: 'Sample time spans 4 to 8 seconds.',
  x: { label: 'Time', min: 4, max: 8, unit: 's' }, y: { label: 'Temperature', min: 0, max: 10, unit: '°C' },
  series: [{ label: 'Measured temperature', kind: 'scatter', points: [{ x: 4, y: 7 }] }],
});
const observationWords = ['Time', 'Temperature', 'Measured temperature', '°C'];

// Each fixture damages a valid example at one rule, retaining enough context
// to recover the intended roles, readings, relationships, or amounts.
export const additionalCorrections = [
  pair('flow-duplicate-node-id', order, ['nodes'], /Flow nodes need unique IDs/, d => {
    d.nodes[3].id = 'ship';
  }, orderWords, [[['nodes', 3, 'id'], 'hold'], [['edges', 2, 'to'], 'hold']]),
  pair('flow-outcome-with-outgoing-edge', order, ['nodes', 0], /outcome cannot have outgoing edges/, d => {
    d.nodes[0].role = 'outcome';
  }, orderWords, [[['nodes', 0, 'role'], 'process'], [['nodes', 2, 'role'], 'outcome']]),
  pair('flow-process-with-two-branches', order, ['nodes', 1], /process can have at most one outgoing edge/, d => {
    d.nodes[1].role = 'process';
  }, orderWords, [[['nodes', 1, 'role'], 'decision']]),
  pair('flow-duplicate-branch-label', order, ['nodes', 1], /distinct, non-empty labels/, d => {
    d.edges[2].label = ' address valid ';
  }, orderWords, [[['edges', 1, 'label'], 'Address valid'], [['edges', 2, 'label'], 'Address flagged']]),
  highlight('flow-highlight-repeats-node', [], /cannot repeat a node/, ['open', 'review', 'review', 'ship']),
  highlight('flow-highlight-unknown-node', [1], /names an unknown node/, ['open', 'reveiw', 'ship']),
  highlight('flow-highlight-reverses-edge', [1], /follow existing edges in their direction/, ['review', 'open', 'ship']),
  highlight('flow-highlight-misses-root', [0], /must start at the start node/, ['review', 'ship']),
  highlight('flow-highlight-misses-terminal', [1], /must end at a node with no outgoing edge/, ['open', 'review']),

  pair('sequence-duplicate-actor-id', retry, ['actors'], /actors need unique IDs/, d => {
    d.actors[1].id = 'worker';
  }, retryWords, [[['actors', 1, 'id'], 'timer'], ...retryMessage]),
  pair('sequence-message-unknown-actor', retry, ['messages', 0], /refers to an unknown actor/, d => {
    d.messages[0].from = 'timre';
  }, retryWords, retryMessage),
  pair('sequence-unbracketed-self-message', retry, ['messages', 0], /self-message.*ordinary/, d => {
    d.messages[0].from = 'worker';
  }, retryWords, retryMessage),

  pair('figure-free-body-without-vectors', fallingObject, ['vectors'], /needs force vectors/, d => {
    delete d.vectors;
  }, ['Object', 'Without air resistance', 'gravity pulls down with 10 N.', 'Weight'], [
    [['vectors', 0], { direction: 'down', magnitude: 10, label: 'Weight' }], [['unit'], 'N'],
  ]),
  pair('figure-vectors-on-cross-section', spec('figure', 'Heat through a wall', {
    figure: 'cross-section', caption: 'Heat flow is 12 W to the right.',
    callouts: [{ anchor: 'core', label: 'Insulation' }],
  }), ['figure'], /Only free-body figures take vectors and units/, d => {
    delete d.caption;
    d.unit = 'W';
    d.vectors = [{ direction: 'right', magnitude: 12, label: 'Heat flow' }];
  }, ['Insulation', 'Heat flow is 12 W to the right.']),
  pair('figure-duplicate-vector-direction', supportedLoad, ['vectors'], /Vector directions must be unique/, d => {
    d.vectors[1].direction = 'up';
  }, ['Support cable', 'Cable tension', 'Weight', '10 N'], [
    [['vectors', 0], { direction: 'up', magnitude: 10, label: 'Cable tension' }],
    [['vectors', 1], { direction: 'down', magnitude: 10, label: 'Weight' }],
  ]),
  pair('figure-callout-to-inactive-direction', supportedLoad, ['callouts', 0, 'anchor'], /anchor present in this figure/, d => {
    d.callouts[0].anchor = 'right';
  }, ['Support cable', 'Cable tension', 'Weight'], [[['callouts', 0, 'anchor'], 'up']]),
  pair('figure-duplicate-callout-anchor', spec('figure', 'The cell nucleus', {
    figure: 'cell', caption: 'Gene regulation starts here with transcription.',
    callouts: [{ anchor: 'nucleus', label: 'DNA storage', detail: 'The nucleus holds DNA.' }],
  }), ['callouts', 1, 'anchor'], /Each anchor has at most one callout/, d => {
    delete d.caption;
    d.callouts.push({ anchor: 'nucleus', label: 'Gene regulation', detail: 'Transcription starts here.' });
  }, ['DNA storage', 'The nucleus holds DNA.', 'Gene regulation starts here with transcription.']),

  pair('tree-duplicate-node-id', folders, ['nodes'], /Tree nodes need unique IDs/, d => {
    d.nodes[2].id = 'docs';
  }, ['Workspace', 'Documents', 'Drafts'], [[['nodes', 2, 'id'], 'drafts'], [['nodes', 2, 'parent'], 'docs']]),
  pair('tree-parent-cycle', folders, ['nodes', 1, 'parent'], /parents cannot form a cycle/, d => {
    d.nodes[1].parent = 'drafts';
  }, ['Workspace', 'Documents', 'Drafts'], [[['nodes', 1, 'parent'], 'workspace'], [['nodes', 2, 'parent'], 'docs']]),
  pair('tree-side-without-binary-layout', binary, ['nodes', 1, 'side'], /side requires the binary layout/, d => {
    delete d.layout;
  }, binaryWords, binarySlots),
  pair('tree-root-with-side', binary, ['nodes', 0, 'side'], /root cannot have a side/, d => {
    d.nodes[0].side = 'left';
  }, binaryWords, binarySlots),
  pair('tree-child-without-side', binary, ['nodes', 1, 'side'], /child needs a left or right side/, d => {
    delete d.nodes[1].side;
  }, binaryWords, binarySlots),
  pair('tree-duplicate-child-slot', binary, ['nodes', 2, 'side'], /at most one left child/, d => {
    d.nodes[2].side = 'left';
  }, binaryWords, binarySlots),

  pair('relationship-duplicate-node-id', logging, ['nodes'], /Relationship nodes need unique IDs/, d => {
    d.nodes[1].id = 'sensor';
  }, loggingWords, [[['nodes', 1, 'id'], 'archive'], ...loggingEdge]),
  pair('relationship-unknown-node', logging, ['edges', 0], /Relationship refers to an unknown node/, d => {
    d.edges[0].to = 'arhcive';
  }, loggingWords, loggingEdge),
  pair('relationship-self-edge', logging, ['edges', 0], /relationship needs two different nodes/, d => {
    d.edges[0].to = 'sensor';
  }, loggingWords, loggingEdge),

  pair('number-line-equal-bounds', spec('number-line', 'Pressure review range', {
    min: 2, max: 6, caption: 'Review pressure from 2 through 6 bar.',
    markers: [{ value: 2, label: 'Minimum pressure' }],
  }), ['max'], /maximum must be greater than the minimum/, d => {
    d.max = 2;
  }, ['Minimum pressure', '2 through 6 bar'], [[['max'], 6], [['markers', 0, 'value'], 2]]),
  pair('number-line-no-marker-or-interval', spec('number-line', 'Pressure alarm', {
    min: 0, max: 10, caption: 'The alarm triggers at 8 bar.', markers: [{ value: 8, label: 'Alarm threshold' }],
  }), ['markers'], /Add at least one marker or interval/, d => {
    d.markers = [];
  }, ['Alarm threshold', '8 bar'], [[['markers', 0, 'value'], 8]]),
  pair('number-line-marker-outside-range', spec('number-line', 'Measured pressure', {
    min: 0, max: 5, markers: [{ value: 5, label: 'Pressure reading' }],
  }), ['markers', 0, 'value'], /Marker is outside the range/, d => {
    d.max = 4;
  }, ['Pressure reading'], [[['max'], 5], [['markers', 0, 'value'], 5]]),
  pair('number-line-markers-share-value', spec('number-line', 'Two pressure readings', {
    min: 0, max: 8, markers: [{ value: 4, label: 'Opening reading and closing reading' }],
  }), ['markers', 1, 'value'], /Markers need distinct values/, d => {
    d.markers = [{ value: 4, label: 'Opening reading' }, { value: 4, label: 'Closing reading' }];
  }, ['Opening reading', 'closing reading'], [[['markers', 0, 'value'], 4]]),
  pair('number-line-reversed-interval', spec('number-line', 'Pressure tolerance', {
    min: 0, max: 10, markers: [], caption: 'The interval excludes 3 and includes 8.',
    intervals: [{ from: 3, to: 8, startClosed: false, endClosed: true, label: 'Allowed pressure' }],
  }), ['intervals', 0], /increasing interval within the range/, d => {
    d.intervals[0] = { from: 8, to: 3, startClosed: true, endClosed: false, label: 'Allowed pressure' };
  }, ['Allowed pressure', 'excludes 3 and includes 8'], [
    [['intervals', 0], { from: 3, to: 8, startClosed: false, endClosed: true, label: 'Allowed pressure' }],
  ]),

  pair('plot-equal-axis-bounds', observation, ['x', 'max'], /maximum must be greater than the minimum/, d => {
    d.x.max = 4;
  }, observationWords, [[['x', 'max'], 8], [['series', 0, 'points'], [{ x: 4, y: 7 }]]]),
  pair('plot-line-with-one-point', observation, ['series', 0, 'points'], /line needs at least two points/, d => {
    d.series[0].kind = 'line';
  }, observationWords, [[['series', 0, 'kind'], 'scatter'], [['series', 0, 'points'], [{ x: 4, y: 7 }]]]),

  pair('matrix-ragged-row', spec('matrix', 'Temperature readings', {
    caption: 'Sensor B did not log an evening reading.',
    columns: ['Morning', 'Noon', 'Evening'],
    rows: [
      { heading: 'Sensor A', cells: ['18 °C', '21 °C', '20 °C'] },
      { heading: 'Sensor B', cells: ['17 °C', '20 °C', 'No reading'] },
    ],
  }), ['rows', 1, 'cells'], /cells must match the number of columns/, d => {
    d.rows[1].cells.pop();
  }, ['Morning', 'Noon', 'Evening', 'Sensor A', 'Sensor B', '18 °C', '21 °C', '20 °C', '17 °C', 'No reading'], [
    [['rows', 1, 'cells'], ['17 °C', '20 °C', 'No reading']],
  ]),
  pair('transformation-link-outside-item-list', spec('transformation', 'Convert mass and volume', {
    before: { label: 'Given quantities', items: ['2 kg', '1 L'] },
    after: { label: 'Converted quantities', items: ['2,000 g', '1,000 mL'] },
    operation: 'Convert to smaller metric units',
    links: [{ from: 0, to: 0, label: 'Mass conversion' }, { from: 1, to: 1, label: 'Volume conversion' }],
  }), ['links', 0], /Mapping indices must refer to existing items/, d => {
    d.links[0].to = 2;
  }, ['2 kg', '1 L', '2,000 g', '1,000 mL', 'Mass conversion', 'Volume conversion'], [
    [['links'], [{ from: 0, to: 0, label: 'Mass conversion' }, { from: 1, to: 1, label: 'Volume conversion' }]],
  ]),

  pair('account-without-postings', spec('t-account', 'Cash received from a sale', {
    account: 'Cash', unit: 'USD', caption: 'Cash receives 25 USD for a sale.',
    debits: [{ label: 'Cash sale', amount: 25 }], credits: [],
  }), ['debits'], /Add at least one posting/, d => {
    d.debits = [];
  }, ['Cash', 'Cash sale', '25 USD'], [[['debits', 0], { label: 'Cash sale', amount: 25 }]]),
  pair('account-negative-posting', spec('t-account', 'Cash paid for stationery', {
    account: 'Cash', unit: 'USD', debits: [], credits: [{ label: 'Stationery purchase', amount: 12.5 }],
  }), ['debits', 0, 'amount'], /Debit and credit amounts must be nonnegative/, d => {
    d.debits = [{ label: 'Stationery purchase', amount: -12.5 }];
    d.credits = [];
  }, ['Cash', 'USD', 'Stationery purchase'], [[['debits'], []], [['credits', 0, 'amount'], 12.5]]),
  pair('account-posting-precision', spec('t-account', 'Accrued service fee', {
    account: 'Accrued fees', unit: 'cents', caption: 'Accrue exactly 1.125 USD.',
    debits: [], credits: [{ label: 'Service fee', amount: 112.5 }],
  }), ['credits', 0, 'amount'], /Use at most two decimal places/, d => {
    d.unit = 'USD';
    d.credits[0].amount = 1.125;
  }, ['Accrued fees', 'Service fee', '1.125 USD', 'cents'], [[['unit'], 'cents'], [['credits', 0, 'amount'], 112.5]]),
  pair('waterfall-change-precision', spec('waterfall', 'Balance after a processing fee', {
    unit: 'cents', opening: 125, caption: 'The processing fee is 0.125 USD.',
    changes: [{ label: 'Processing fee', amount: -12.5 }],
  }), ['changes', 0, 'amount'], /Use at most two decimal places/, d => {
    d.unit = 'USD';
    d.opening = 1.25;
    d.changes[0].amount = -0.125;
  }, ['Processing fee', '0.125 USD', 'cents'], [[['unit'], 'cents'], [['opening'], 125], [['changes', 0, 'amount'], -12.5]]),

  pair('diagram-multiline-label', retry, ['actors', 0, 'label'], /nonblank, single-line diagram text/, d => {
    d.actors[0].label = 'Job worker\nRun the retry';
  }, [...retryWords, 'run the retry'], retryMessage),
  pair('diagram-malformed-id', folders, ['nodes', 2, 'id'], /Use a simple ID starting with a letter/, d => {
    d.nodes[2].id = '2 drafts';
  }, ['Workspace', 'Documents', 'Drafts'], [[['nodes', 2, 'id'], 'drafts'], [['nodes', 2, 'parent'], 'docs']]),
];
