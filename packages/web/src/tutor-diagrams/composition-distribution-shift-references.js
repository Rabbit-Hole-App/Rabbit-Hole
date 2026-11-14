import { derived as toyDerived, namingRules } from './topic-distribution-shift-data.js';

const d = toyDerived();
const spec = diagram => ({ version: 1, diagram });
const title = text => text[0].toUpperCase() + text.slice(1);
const classBars = (name, counts) => ({ kind: 'bar-chart', title: name, unit: 'Cards', bars: ['A', 'B'].map((label, index) => ({ label, value: counts[index] })) });
const samples = (domain, overview) => {
  const rows = overview ? domain.cards.filter(card => domain.id === 'training' ? ['t1', 't3'].includes(card.id) : ['d2', 'd3'].includes(card.id)) : domain.cards;
  return { kind: 'sample-set', title: domain.label,
    samples: rows.map(card => ({ id: card.id, label: overview ? title(card.tone) : `${title(card.tone)} ${card.shape}`, class: namingRules.Elm[card.shape] })),
    groups: [{ id: domain.id, label: 'Independent draw', members: rows.map(card => card.id) }],
  };
};
const inputs = overview => ({ kind: 'comparison', variant: 'panels', title: 'Different styles, same classes',
  caption: overview ? 'Selected examples; A round, B square.' : 'Independent draws; round is A, square is B in both domains.',
  panels: d.domains.map(domain => ({ heading: domain.label, diagram: samples(domain, overview) })),
});
const styleCounts = { kind: 'bar-chart', variant: 'grouped', title: 'Count input styles in each domain', unit: 'Cards',
  caption: 'Count dark and light cards in each independently drawn domain.', categories: ['Dark', 'Light'],
  series: d.domains.map(domain => ({ label: domain.label, values: domain.styleCounts })),
};
// Draw equal class totals once, with both independent domains sharing the same categories.
const fixedClasses = { kind: 'bar-chart', variant: 'grouped', title: 'Both target classes remain represented', unit: 'Cards',
  caption: 'Round is A; square is B in both independent domains.',
  categories: ['A', 'B'], series: d.domains.map(domain => ({ label: domain.label, values: domain.classCounts })),
};
const rules = ['Round is A; square is B', 'Round is B; square is A'];
function concepts(level) {
  const overview = level === 'overview';
  const deep = level === 'deep';
  const slice = d.concept.slices[deep ? 1 : 0];
  return { kind: 'panels', title: `Same ${slice.label.toLowerCase()} cards, different names`,
    caption: deep ? `Same ${d.concept.unchangedInputs} inputs in both studios; ${d.concept.changedLabels} labels change; each still has ${d.concept.settings[0].classCounts[0]} A and ${d.concept.settings[0].classCounts[1]} B.` : 'Invented studios name the same fixed input differently.',
    panels: d.concept.settings.map((setting, index) => ({ ...(overview ? {} : { label: rules[index] }), diagram: classBars(setting.name, slice.classCounts[index]) })),
    links: [{ from: 0, to: 1, operation: overview ? 'Change rule' : 'Change label rule' }], shared: ['classes', 'colours'],
  };
}
const marginalCheck = { kind: 'panels', title: 'Count all cards under each naming rule',
  caption: `${d.concept.unchangedInputs} fixed inputs; all ${d.concept.changedLabels} labels change, but class totals stay equal.`,
  panels: d.concept.settings.map(setting => ({ diagram: classBars(setting.name, setting.classCounts) })),
  links: [{ from: 0, to: 1, operation: 'Change label rule' }], shared: ['classes', 'colours'],
};

const source = figure => ({ kind: 'figure-brief', path: `docs/features/explain-on-canvas/handoff/figure-briefs/d2l-environment-and-distribution-shift/briefs.md#figure-${figure}`, revision: '05d5f02f6' });
const inputPrompt = 'A training sample can teach a model a narrow version of the input domain even when both target classes are represented.';
const inputAlias = 'Deployment inputs can look unlike training inputs while the task still uses the same class definitions.';
const conceptPrompt = 'The same input can acquire different labels across settings when the labeling rule itself changes.';
const inputParaphrases = [
  'Show an input style shift with the fixed class rule still applied in both domains.',
  'How can an input style shift happen when both target classes appear in training?',
  'Compare independently drawn card domains with a fixed class rule and different tones.',
  'Count the dark and light cards to explain an input style shift.',
  'Why does a fixed class rule allow different input styles at deployment?',
];
const conceptParaphrases = [
  'Show conditional label change when invented studios name the same cards differently.',
  'Explain a changed naming rule while holding every input card fixed.',
  'Compare conditional label change for one dark round input across two studios.',
  'How can a changed naming rule reverse labels without changing input frequencies?',
  'Check conditional label change even when the total class counts stay balanced.',
];
const inputDepths = { overview: { spec: spec(inputs(true)) }, standard: { spec: spec(inputs(false)) }, deep: { spec: spec(styleCounts), detailSpec: spec(fixedClasses) } };
const conceptDepths = { overview: { spec: spec(concepts('overview')) }, standard: { spec: spec(concepts('standard')) }, deep: { spec: spec(concepts('deep')), detailSpec: spec(marginalCheck) } };

export const references = Object.freeze([
  { id: 'ml-distribution-shift-input-distribution-shift', topic: 'distribution-shift', lessons: ['19', '20'],
    sources: [source('01'), source('02')], prompts: [inputPrompt, inputAlias, ...inputParaphrases], paraphrases: inputParaphrases,
    keywords: ['input style shift', 'fixed class rule'],
    useWhen: 'Show input style shift with a fixed class rule on independently drawn domains; not changed label meanings or a time-series forecast.',
    alsoCovers: [{ source: 'd2l-environment-and-distribution-shift', figure: '02', brief: source('02').path, summary: inputAlias,
      kinds: ['comparison', 'sample-set'], lessons: ['19', '20'], sequence: 'Distribution shift · 2, pair the shifted test distribution with the earlier training example.', gapTypes: ['composition'] }],
    dedupeBasis: 'Original and changed input domains are the two halves of one comparison with the class rule held fixed.',
    ...inputDepths.standard, depths: inputDepths },
  { id: 'ml-distribution-shift-concept-shift', topic: 'distribution-shift', lessons: ['20'],
    sources: [source('03')], prompts: [conceptPrompt, ...conceptParaphrases], paraphrases: conceptParaphrases,
    keywords: ['conditional label change', 'changed naming rule'],
    useWhen: 'Show conditional label change across invented naming settings on the same inputs; not a shift in input frequency or class balance.',
    alsoCovers: [], dedupeBasis: 'Changed conditional label rule; keep distinct from input prevalence shift.',
    ...conceptDepths.standard, depths: conceptDepths },
]);
export function derived() { return toyDerived(); }
