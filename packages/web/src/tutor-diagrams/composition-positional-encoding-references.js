import { derived } from './topic-positional-encoding-data.js';
import manifest from './topic-embeddings-sources.json' with { type: 'json' };
const d = derived(), p = d.parameters, t = d.tokenPosition, tp = p.tokenPosition, s = d.sinusoidal, sp = p.sinusoidal;
const spec = diagram => ({ version: 1, diagram });
const strip = (label, values) => ({ label, tensor: { rows: 1, columns: values.length, dimensions: '1 × ' + values.length, values } });
const fixedRow = t.fixed.rows[tp.fixedOverviewPosition];
const fixed = { kind: 'transformation', title: 'Fixed variant: add equal-width input rows', before: { label: 'Token and fixed position', items: [strip(fixedRow.word + ' id ' + fixedRow.tokenId, fixedRow.display.E), strip('Position ' + fixedRow.position, fixedRow.display.P)] }, after: { label: 'Combined input', items: [strip('Same position', fixedRow.display.sum)] }, operation: 'Add token and fixed-position features', links: [{ from: 0, to: 0, label: 'token row' }, { from: 1, to: 0, label: 'position row' }],
  caption: `Fixed toy $P_p=(\\sin p,\\cos p)$, position $${fixedRow.position}$. Learned P uses a separate supplied table.` };
const additionGrid = (row, probe = false) => ({ kind: 'heatmap', title: probe ? 'Edit learned position' : 'Repeated tokens, learned positions', rowLabel: 'Feature', columnLabel: 'Position / id', columns: row.columns, rows: row.gridRows, range: t.range,
  highlights: row.gridRows.flatMap((_, r) => t.repeatPositions.map(column => ({ row: r, column }))),
  caption: probe ? `$\\Delta S=\\Delta P=(${tp.delta})$ only at p${tp.changedPosition}.`
    : 'Learned $S_p=E[id_p]+P[p]$. P uses positions.' });
const architecture = (row, position) => { const active = row.rows[position];return { kind: 'block-stack', title: row.variant + ' input before the repeated decoder group', blocks: [
  { id: 'indices', label: active.word + ' id ' + active.tokenId + ' / position ' + active.position, merge: 'add', inputs: [{ label: `Model E table $E[${active.tokenId},:]$` }, { label: row.variant === 'Fixed' ? `Fixed $P[${active.position}]$ function` : `Model P table $P[${active.position},:]$` }] },
  { id: 'combined', label: 'Combined input', diagram: { kind: 'tensor', tensor: strip('', active.display.sum).tensor } },
  { id: 'decoder', label: 'Toy decoder block', repeat: tp.decoderBlocks.length }],
  caption: `${row.variant} toy, ${active.word} id $${active.tokenId}$ at $p=${active.position}$. Combined vector enters the stack; lookup inputs stay outside decoder repeats.` }; };
const rate = f => f.denominator === 1 ? String(f.numerator) : f.numerator + '/' + f.denominator;
const plot = overview => ({ kind: 'coordinate-plot', title: overview ? 'One paired sinusoidal frequency' : 'Paired fast and slow sampled position features', x: { label: 'Position index', min: sp.positions[0], max: sp.positions.at(-1) }, y: { label: 'Position feature', min: s.range.min, max: s.range.max },
  series: s.channels.slice(0, overview ? 2 : s.channels.length).map((channel, j) => ({ label: channel.label, kind: 'line', points: sp.positions.map((x, i) => ({ x, y: s.displayRows[i][j] })) })), annotations: [{ kind: 'reference-line', label: 'Selected position', axis: 'x', value: s.selectedPosition }],
  caption: `Toy samples $p=(${sp.positions})$, frequencies $(${sp.frequencies.map(rate)})$. Lines connect samples; selected $p=${s.selectedPosition}$ matches the grid.` });
const signalGrid = (grouped = false) => ({ kind: 'heatmap', title: grouped ? 'Group display columns, preserve channel values' : 'Interleave each frequency with its cosine partner', rowLabel: 'Position', columnLabel: 'Frequency partner', columns: (grouped ? s.groupedChannels : s.channels).map(c => c.label), rows: (grouped ? s.groupedRows : s.displayRows).map((cells, i) => ({ label: s.labels[i], cells })), range: s.range,
  highlights: s.channels.map((_, column) => ({ row: s.selectedIndex, column })),
  caption: grouped ? "Display-only order: $P'_{p,\\pi(j)}=P_{p,j}$. Values follow channel ids; no model/basis equivalence claim."
    : `Same rounded samples as the plot; selected $p=${s.selectedPosition}$ matches all paired coordinates. Position rows and channel ids stay attached.` });
const designs = [
  { id: 'ml-positional-encoding-token-plus-position', keywords: ['repeated token addition', 'model lookup inputs'], useWhen: 'Show repeated token addition, indexed learned position rows and model lookup inputs outside repeats; not fixed/learned conflation, layer-local tables or an unrelated architectural reference.',
    paraphrases: ['Show repeated token addition with separate token and position ids.', 'Keep model lookup inputs outside the repeated decoder group.', 'Which learned rows change repeated token addition at another position?', 'Compare named fixed and learned model lookup inputs.', 'Change one learned position row in repeated token addition.'],
    depths: { overview: { spec: spec(fixed), detailSpec: spec(architecture(t.fixed, tp.fixedOverviewPosition)) }, standard: { spec: spec(additionGrid(t.learned)), detailSpec: spec(architecture(t.learned, tp.activePosition)) }, deep: { spec: spec(additionGrid(t.probe, true)), detailSpec: spec(architecture(t.probe, tp.activePosition)) } } },
  { id: 'ml-positional-encoding-sinusoidal-positions', keywords: ['paired position frequencies', 'channel display permutation'], useWhen: 'Show all paired position frequencies with a matching sampled row and channel display permutation; not one-frequency-only, missing cosines, learned tables, continuous exact curves or model equivalence.',
    paraphrases: ['Show paired position frequencies and their matching selected row.', 'Keep numeric values attached during a channel display permutation.', 'Compare both sine and cosine in paired position frequencies.', 'Why is channel display permutation different from changing the model basis?', 'Match all four paired position frequencies at the selected sampled position.'],
    depths: { overview: { spec: spec(plot(true)) }, standard: { spec: spec(plot(false)), detailSpec: spec(signalGrid()) }, deep: { spec: spec(signalGrid(true)), detailSpec: spec(signalGrid()) } } },
];
export const references = Object.freeze(designs.map(({ id, ...design }) => { const row = manifest.references.find(entry => entry.referenceId === id);return { id, topic: row.topic, lessons: row.lessons, sources: [row.source, ...row.alsoCovers].map(source => ({ kind: 'figure-brief', path: source.brief, revision: manifest.sourceRevision })), prompts: [row.source.summary, ...row.alsoCovers.map(source => source.summary), ...design.paraphrases], ...design, ...design.depths.standard }; }));
export { derived };
