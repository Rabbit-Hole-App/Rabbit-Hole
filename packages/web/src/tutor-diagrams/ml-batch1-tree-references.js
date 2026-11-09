// Worked counts supplement the existing split-path and class-mixture references.
// This is illustrative data for author context, not a fixed generated card.
export const references = [{
  id: 'ml-tree-impurity-gain', lessons: ['04'],
  prompts: ['How does a decision tree know whether a split is good?'],
  keywords: ['information gain', 'weighted impurity', 'gini gain', 'entropy gain', 'split is good', 'calculate a tree split'],
  useWhen: 'Work from the same parent/child class counts to weighted child impurity and its decrease. Entropy decrease is information gain in bits.',
  spec: { version: 1, diagram: {
    kind: 'comparison', variant: 'panels', title: 'Does this split make the groups purer?',
    panels: [{ heading: 'The same eight samples', diagram: {
      kind: 'tree', layout: 'binary', title: 'A balanced parent, two purer children',
      nodes: [
        { id: 'parent', label: 'Before the split', count: 8, detail: '4 A; 4 B' },
        { id: 'left', parent: 'parent', side: 'left', edgeLabel: 'Left', label: 'Mostly A', count: 4, detail: '3 A; 1 B' },
        { id: 'right', parent: 'parent', side: 'right', edgeLabel: 'Right', label: 'Mostly B', count: 4, detail: '1 A; 3 B' },
      ],
      caption: 'Each child holds 4 of the 8 samples, so each impurity receives half the weight.',
    } }, { heading: 'Calculate the improvement', diagram: {
      kind: 'matrix', layout: 'teaching', title: 'Parent minus weighted children',
      columns: ['Gini', 'Entropy (bits)'],
      rows: [
        { id: 'parent', heading: 'Parent', cells: ['0.500', '1.0000'] },
        { id: 'left', heading: 'Left', cells: ['0.375', '0.8113'] },
        { id: 'right', heading: 'Right', cells: ['0.375', '0.8113'] },
        { id: 'weighted', heading: 'Weighted', cells: ['0.375', '0.8113'] },
        { id: 'gain', heading: 'Gain', cells: ['0.125', '0.1887'] },
      ],
      emphasis: { rows: ['gain'] },
      caption: 'Weighted: half of each child impurity, added together. Gain: parent minus weighted. Values are rounded.',
    } }],
    caption: 'Both criteria improve on these counts. Compare the gain with other candidate splits before choosing the best one.',
  } },
}];
