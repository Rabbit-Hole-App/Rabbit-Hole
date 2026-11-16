const events = [
  { time: '1', label: 'Formulate Model', detail: 'Choose a probability model for the data.' },
  { time: '2', label: 'Write Likelihood', detail: 'Multiply the probability of each observation.' },
  { time: '3', label: 'Take Logarithm', detail: 'Turn the product into a sum.' },
  { time: '4', label: 'Maximize', detail: 'Set the derivative to zero and solve for the parameters.' },
];

const stepsDiagram = (title, caption) => ({ version: 1, diagram: { kind: 'timeline', title, events, caption } });

const prompt = 'what are the steps of maximum likelihood estimation?';
const paraphrase = 'how do you derive a maximum likelihood estimate step by step?';
const keywords = ['steps of maximum likelihood estimation', 'derive a maximum likelihood estimate', 'log likelihood maximization steps'];
export const mleStepsReference = {
  id: 'ml-mle-steps', lessons: ['03', '14'],
  prompts: [prompt, paraphrase], paraphrases: [paraphrase], keywords, shortKeywords: keywords,
  useWhen: 'Show the derivation of a maximum likelihood estimate as four numbered stages: model, likelihood, logarithm, maximum. No branches.',
  spec: stepsDiagram('Maximum likelihood estimation', 'Worked example. Each stage turns the problem into one that is easier to solve.'),
  depths: {
    overview: { spec: stepsDiagram('Maximum likelihood in four steps', 'Pick the parameters that make the observed data most likely.') },
    deep: { spec: stepsDiagram('Maximum likelihood estimation', 'The logarithm keeps the same maximum, and a sum is simpler to differentiate than a product.') },
  },
};
