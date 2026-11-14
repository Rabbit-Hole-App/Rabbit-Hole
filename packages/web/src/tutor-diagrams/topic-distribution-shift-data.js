// Independently drawn domains; concept shift reuses these same inputs in both studios.
export const cards = Object.freeze([
  { id: 't1', domain: 'training', tone: 'dark', shape: 'round' },
  { id: 't2', domain: 'training', tone: 'dark', shape: 'round' },
  { id: 't3', domain: 'training', tone: 'dark', shape: 'square' },
  { id: 't4', domain: 'training', tone: 'light', shape: 'square' },
  { id: 'd1', domain: 'deployment', tone: 'dark', shape: 'round' },
  { id: 'd2', domain: 'deployment', tone: 'light', shape: 'round' },
  { id: 'd3', domain: 'deployment', tone: 'light', shape: 'square' },
  { id: 'd4', domain: 'deployment', tone: 'light', shape: 'square' },
]);
export const namingRules = Object.freeze({
  Elm: { round: 'A', square: 'B' },
  Ash: { round: 'B', square: 'A' },
});

const classes = ['A', 'B'];
const countLabels = labels => classes.map(name => labels.filter(label => label === name).length);
const title = text => text[0].toUpperCase() + text.slice(1);

export function derived() {
  const domains = [...new Set(cards.map(card => card.domain))].map(id => {
    const rows = cards.filter(card => card.domain === id);
    return { id, label: title(id), cards: rows,
      styleCounts: ['dark', 'light'].map(tone => rows.filter(card => card.tone === tone).length),
      classCounts: countLabels(rows.map(card => namingRules.Elm[card.shape])),
    };
  });
  const settings = Object.entries(namingRules).map(([name, rule]) => {
    const labels = cards.map(card => rule[card.shape]);
    return { name, labels, classCounts: countLabels(labels) };
  });
  const slices = [{ tone: 'dark', shape: 'round' }, { tone: 'light', shape: 'square' }].map(input => {
    const rows = cards.filter(card => card.tone === input.tone && card.shape === input.shape);
    return { ...input, label: `${title(input.tone)} ${input.shape}`, count: rows.length,
      classCounts: Object.values(namingRules).map(rule => countLabels(rows.map(card => rule[card.shape]))),
    };
  });
  return { counts: { rows: cards.length, features: ['tone', 'shape'].length }, domains,
    concept: { settings, slices, unchangedInputs: cards.length,
      changedLabels: cards.filter((card, index) => settings[0].labels[index] !== settings[1].labels[index]).length,
      inputCounts: ['dark', 'light'].flatMap(tone => ['round', 'square'].map(shape => cards.filter(card => card.tone === tone && card.shape === shape).length)),
    },
  };
}
