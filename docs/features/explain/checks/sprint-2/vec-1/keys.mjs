const lib = await import('file:///C:/s/sprint2-flow/packages/web/src/tutor-diagrams/reference-library.js');
const r = [...lib.diagramReferences, ...lib.illustrationReferences].find(r => r.id === 'figure-recurrent-channel-decay');
console.log('KEYS', Object.keys(r).join(','), '|', Object.keys(r.depths ?? {}).join(','), '|', Object.keys(r.depths?.deep ?? {}).join(','));
