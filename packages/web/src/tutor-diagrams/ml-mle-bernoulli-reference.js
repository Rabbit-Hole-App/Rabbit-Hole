const flips = 10;
const heads = 7;
const tails = flips - heads;
const arrangements = Array.from({ length: tails }, (_, i) => (flips - i) / (i + 1))
  .reduce((product, factor) => product * factor, 1);
const intervals = 10;
const divisor = 10000;
const samples = Array.from({ length: intervals + 1 }, (_, i) => {
  const p = i / intervals;
  return Math.round(divisor * arrangements * p ** heads * (1 - p) ** tails);
});

const point = (p, label) => ({
  kind: 'point', x: p, y: samples[Math.round(p * intervals)] / divisor, label,
});
const best = point(heads / flips, 'Best bias');
const fair = point(0.5, 'Fair coin');

function likelihoodPlot(caption, compareFairCoin = false) {
  return {
    version: 1,
    diagram: {
      kind: 'coordinate-plot', title: `Likelihood for ${heads} heads in ${flips} flips`,
      x: { label: 'Coin bias (chance of heads)', min: 0, max: 1 },
      y: { label: `Chance of exactly ${heads} heads`, min: 0, max: 0.3 },
      series: [{
        label: 'Likelihood', kind: 'line',
        samples: { x: { start: 0, step: 1, divisor: intervals }, y: samples, divisor },
      }],
      annotations: compareFairCoin ? [fair, best] : [best],
      caption: `Worked example. ${caption}`,
    },
  };
}

const prompt = 'how does maximum likelihood estimation find the best coin bias?';
const paraphrase = 'which coin bias makes seven heads in ten flips most likely?';
const keywords = ['maximum likelihood estimation', 'coin flip likelihood', 'bernoulli likelihood'];
export const mleBernoulliReference = {
  id: 'ml-mle-bernoulli-likelihood', lessons: ['03', '14'],
  prompts: [prompt, paraphrase], paraphrases: [paraphrase], keywords, shortKeywords: keywords,
  useWhen: 'Hold the observed head count fixed, vary the Bernoulli bias and mark the likelihood maximum.',
  spec: likelihoodPlot('Keep the head count fixed. Compare the fair coin with the bias that makes this count most likely.', true),
  depths: {
    overview: { spec: likelihoodPlot('The head count stays fixed. The curve peaks at the best-fitting coin bias.') },
    deep: { spec: likelihoodPlot(
      `For the fixed count, $L(p)=${arrangements}p^${heads}(1-p)^${tails}$. There are ${arrangements} possible orders. Values are rounded.`, true,
    ) },
  },
};
