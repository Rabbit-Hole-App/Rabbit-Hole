import { references as statistical } from './ml-statistical-references.js';

// Extend the existing aligned distribution with its worked PSI calculation.
const { binEdges, series } = statistical.find(ref => ref.id === 'aligned-distribution-drift').spec.diagram;

export const references = [
  {
    id: 'ml-psi-bin-contributions',
    lessons: ['20'],
    prompts: ['How do I calculate the population stability index one bin at a time?'],
    keywords: ['population stability index', 'psi', 'calculate psi', 'psi calculation', 'psi contributions', 'bin contributions'],
    useWhen: 'Show both distributions on shared bin edges, the natural-log contribution per bin, and the summed PSI. State any zero-share handling explicitly.',
    spec: {
      version: 1,
      diagram: {
        kind: 'comparison', variant: 'panels', title: 'PSI adds the shifts across common bins',
        panels: [
          {
            heading: 'Compare shares on fixed bins',
            diagram: {
              kind: 'histogram', title: 'Reference and current distributions',
              xLabel: 'Feature value', binEdges, measure: 'proportion',
              series: [{ ...series[0], label: 'Reference' }, series[1]],
              caption: 'Both distributions use the same bin edges. Each set of shares sums to 1.',
            },
          },
          {
            heading: 'Calculate and add the contributions',
            diagram: {
              kind: 'matrix', layout: 'teaching', title: 'One term for each shared bin',
              columns: ['Ref.', 'Current', 'PSI part'],
              rows: [
                { id: 'bin-0', heading: '[0, 1)', cells: ['10%', '5%', '0.0347'] },
                { id: 'bin-1', heading: '[1, 2)', cells: ['40%', '15%', '0.2452'] },
                { id: 'bin-2', heading: '[2, 3)', cells: ['40%', '40%', '0.0000'] },
                { id: 'bin-3', heading: '[3, 4]', cells: ['10%', '40%', '0.4159'] },
                { id: 'total', heading: 'Total', cells: ['100%', '100%', '0.6958'] },
              ],
              emphasis: { cells: [{ row: 'bin-3', column: 2 }], rows: ['total'] },
              caption: String.raw`Use $(q-p)\ln(q/p)$ with reference share $p$ and current share $q$. Sum the unrounded parts, then round the total.`,
            },
          },
        ],
        caption: String.raw`The [3, 4] bin contributes most. Its term is $(0.40-0.10)\ln(0.40/0.10)\approx0.4159$.`,
      },
    },
  },
];
