export const parameters = Object.freeze({ precision: 3,
  tokenPosition: { vocabulary: [{ id: 0, word: 'moss', row: [1, 0] }, { id: 1, word: 'cedar', row: [0, 1] }], sequence: [0, 1, 0], learnedPositions: [[0, 0], [.5, -.5], [1, .5]], changedPosition: 2, delta: [.25, -.5], activePosition: 2, fixedOverviewPosition: 0, decoderBlocks: ['decoderA', 'decoderB'] },
  sinusoidal: { positions: [0, 2, 4], selectedPosition: 2, frequencies: [{ id: 'fast', label: 'Fast', numerator: 1, denominator: 1 }, { id: 'slow', label: 'Slow', numerator: 1, denominator: 3 }], groupedOrder: ['fast_sin', 'slow_sin', 'fast_cos', 'slow_cos'], amplitude: 1 },
});
export function derived() {
  const p = parameters, t = p.tokenPosition, round = x => +x.toFixed(p.precision), width = t.vocabulary[0].row.length;
  const positionRows = (variant, edited = false) => t.sequence.map((tokenId, position) => {
    const token = t.vocabulary.find(row => row.id === tokenId), E = [...token.row];
    const P = variant === 'Fixed' ? [Math.sin(position), Math.cos(position)] : t.learnedPositions[position].map((x, j) => x + (edited && position === t.changedPosition ? t.delta[j] : 0));
    const sum = E.map((x, i) => x + P[i]);return { position, tokenId, word: token.word, E, P, sum, display: { E: E.map(round), P: P.map(round), sum: sum.map(round) } };
  });
  const makeCase = (variant, edited = false) => { const rows = positionRows(variant, edited), columns = rows.map(r => 'p' + r.position + ' ' + r.word + ' #' + r.tokenId);
    const gridRows = ['E', 'P', 'sum'].flatMap(key => Array.from({ length: width }, (_, j) => ({ label: (key === 'sum' ? 'Sum' : key) + j, cells: rows.map(row => row.display[key][j]) })));
    return { variant, edited, rows, columns, gridRows }; };
  const fixed = makeCase('Fixed'), learned = makeCase('Learned'), probe = makeCase('Learned', true), values = [fixed, learned, probe].flatMap(c => c.gridRows.flatMap(row => row.cells));
  const s = p.sinusoidal, channels = s.frequencies.flatMap(f => ['sin', 'cos'].map(fn => ({ id: f.id + '_' + fn, label: f.label + ' ' + fn, function: fn, frequencyId: f.id })));
  const rawRows = s.positions.map(position => channels.map(channel => { const f = s.frequencies.find(row => row.id === channel.frequencyId);return s.amplitude * Math[channel.function](position * f.numerator / f.denominator); })), displayRows = rawRows.map(row => row.map(round));
  const groupedChannels = s.groupedOrder.map(id => channels.find(row => row.id === id)), groupedRows = displayRows.map(row => groupedChannels.map(c => row[channels.findIndex(old => old.id === c.id)]));
  return { parameters: p,
    tokenPosition: { fixed, learned, probe, width, range: { min: Math.min(...values), max: Math.max(...values) }, repeatPositions: t.sequence.map((id, i) => t.sequence.filter(value => value === id).length > 1 ? i : null).filter(i => i !== null) },
    sinusoidal: { channels, rawRows, displayRows, groupedChannels, groupedRows, selectedPosition: s.selectedPosition, selectedIndex: s.positions.indexOf(s.selectedPosition), labels: s.positions.map(position => 'p' + position), range: { min: -s.amplitude, max: s.amplitude } },
    counts: { features: width, positions: t.sequence.length, decoderBlocks: t.decoderBlocks.length, channels: channels.length, samples: s.positions.length } };
}
