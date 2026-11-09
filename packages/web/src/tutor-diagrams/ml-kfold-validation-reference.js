const labels = [0, 0, 0, 0, 1, 1, 1, 1, 1, 1];
const examples = labels.map((label, x) => ({ id: String.fromCharCode(65 + x), x, label }));
const foldSize = 2;
const folds = Array.from({ length: examples.length / foldSize }, (_, i) =>
  examples.slice(i * foldSize, (i + 1) * foldSize));

const scores = folds.map(heldOut => {
  const fit = examples.filter(row => !heldOut.includes(row));
  // Rows are ordered by x, so a tie keeps the neighbor at the lower x.
  return heldOut.filter(({ x, label }) => fit.reduce((nearest, candidate) =>
    Math.abs(candidate.x - x) < Math.abs(nearest.x - x) ? candidate : nearest).label === label).length;
});
const accuracies = scores.map(score => score / foldSize);
const percent = accuracy => `${100 * accuracy}%`;
const meanAccuracy = accuracies.reduce((sum, accuracy) => sum + accuracy, 0) / folds.length;
const mean = percent(meanAccuracy);

function specAt(depth) {
  const brief = depth === 'overview';
  const detailed = depth === 'deep';
  const rows = folds.map((fold, round) => {
    const check = brief ? 'Check' : detailed ? `${scores[round]} of ${foldSize}` : percent(accuracies[round]);
    return {
      id: fold[0].id.toLowerCase(), heading: `Round ${round + 1}`,
      cells: folds.map((_, column) => column === round ? check : 'Fit'),
    };
  });
  const caption = brief ? 'Rotate the check fold each round. Average the five checks.'
    : detailed ? `A–J have x 0–9. Suffixes are labels. 1-NN ties use lower x. Mean $(${accuracies.join('+')})/${folds.length}=${meanAccuracy}$.`
      : `Fit 1-NN on eight rows. Highlighted cells give validation accuracy. The mean is ${mean}.`;
  return {
    version: 1,
    diagram: {
      kind: 'matrix', layout: 'teaching', title: 'Rotate the validation fold',
      columns: folds.map((fold, i) => {
        const heading = `Fold ${i + 1}`;
        const members = fold.map(({ id, label }) => detailed ? `${id}${label}` : id).join(detailed ? ',' : ' ');
        return brief ? heading : detailed ? `${heading} ${members}` : `${heading} · ${members}`;
      }),
      rows,
      emphasis: { cells: rows.map(({ id }, column) => ({ row: id, column })) },
      caption: `Worked example. ${caption}`,
    },
  };
}

const prompt = 'how does five-fold cross-validation rotate the validation fold and combine the scores?';
const paraphrase = 'how do I average validation scores after holding out a different fold each round?';
const keywords = ['k fold cross validation', 'validation fold rotation', 'mean fold accuracy'];

export const kfoldValidationReference = {
  id: 'ml-kfold-validation',
  lessons: ['09'],
  prompts: [prompt, paraphrase],
  paraphrases: [paraphrase],
  keywords,
  shortKeywords: keywords,
  useWhen: 'Rotate one held-out fold per round, fit 1-NN on the other four, and average the five validation accuracies.',
  spec: specAt('standard'),
  depths: { overview: { spec: specAt('overview') }, deep: { spec: specAt('deep') } },
};
