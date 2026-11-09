// Fixed lesson 08 teaching data. The existing comparison, matrix and histogram
// templates own layout, typography and the shared teaching palette.
export const references = [
  {
    id: 'ml-ordinal-encoding', lessons: ['08'],
    prompts: ['How do I turn low, medium, and high categories into numbers without losing their order?'],
    keywords: ['ordinal encoding', 'ordered categories', 'ordered category', 'category rank', 'numeric codes', 'category ordering'],
    useWhen: 'Map categories with a meaningful order through an explicit codebook, then encode the same identifiable sample rows. Explain that ordinal codes do not measure equal spacing and should not impose a ranking on nominal categories.',
    spec: { version: 1, diagram: {
      kind: 'comparison', variant: 'panels', title: 'Ordinal encoding preserves a real order',
      panels: [{ heading: 'Choose the codebook', diagram: {
        kind: 'matrix', layout: 'teaching', title: 'Low, then Medium, then High',
        columns: ['Level', 'Code'],
        rows: [
          { id: 'low', heading: '1st', cells: ['Low', '0'] },
          { id: 'medium', heading: '2nd', cells: ['Medium', '1'] },
          { id: 'high', heading: '3rd', cells: ['High', '2'] },
        ],
        caption: 'The levels have a known ranking before encoding. Codes show rank, not measured equal spacing.',
      } }, { heading: 'Encode six sample rows', diagram: {
        kind: 'matrix', layout: 'teaching', title: 'Apply one codebook to every row',
        columns: ['Level', 'Code'],
        rows: [
          { id: 'a', heading: 'A', cells: ['Low', '0'] },
          { id: 'b', heading: 'B', cells: ['High', '2'] },
          { id: 'c', heading: 'C', cells: ['Medium', '1'] },
          { id: 'd', heading: 'D', cells: ['Medium', '1'] },
          { id: 'e', heading: 'E', cells: ['Low', '0'] },
          { id: 'f', heading: 'F', cells: ['High', '2'] },
        ],
        emphasis: { columns: [1] },
        caption: 'A through F stay in the same order; repeated levels receive the same code.',
      } }],
      caption: 'Keep this codebook for later rows. Do not impose an order on nominal categories such as colors.',
    } },
  },
  {
    id: 'ml-value-binning', lessons: ['08'],
    prompts: ['Can you show which bins contain these values, including values exactly on an edge?'],
    keywords: ['value binning', 'bin edge', 'bin edges', 'bin boundary', 'bucket', 'discretization', 'bin membership', 'equal-width bins', 'quantization', 'quantize', 'quantized'],
    useWhen: 'Assign raw numeric values to ordered intervals and show the matching counts. State the left-closed, right-open convention and the inclusive final endpoint, so values exactly on an edge have unambiguous membership.',
    spec: { version: 1, diagram: {
      kind: 'comparison', variant: 'panels', title: 'Binning maps each value to one interval',
      panels: [{ heading: 'Assign each sample', diagram: {
        kind: 'matrix', layout: 'teaching', title: 'Value to bin code',
        columns: ['Value', 'Bin'],
        rows: [
          { id: 'a', heading: 'A', cells: ['5', '0'] },
          { id: 'b', heading: 'B', cells: ['12', '1'] },
          { id: 'c', heading: 'C', cells: ['19', '1'] },
          { id: 'd', heading: 'D', cells: ['20', '2'] },
          { id: 'e', heading: 'E', cells: ['26', '2'] },
          { id: 'f', heading: 'F', cells: ['39', '3'] },
          { id: 'g', heading: 'G', cells: ['40', '3'] },
        ],
        emphasis: { rows: ['d', 'g'] },
        caption: '20 goes in 20–30 (bin 2); 40 goes in the last bin, 30–40 (bin 3). Each row keeps its sample ID.',
      } }, { heading: 'Count the same seven values', diagram: {
        kind: 'histogram', title: 'Count the same seven values', xLabel: 'Value',
        binEdges: [0, 10, 20, 30, 40], measure: 'count',
        series: [{ label: 'Samples', values: [1, 2, 2, 2] }],
        caption: 'The counts sum to seven. A boundary value enters the bin starting there; the rightmost endpoint stays in the last bin.',
      } }],
      caption: 'Bins are left-closed, right-open, except the final bin includes 40. Bin codes run from 0 to 3 in interval order.',
    } },
  },
];
