import {
  analogyOffset, analogyQuery, analogyRanks, centre, centreIndex, contextVectors, cosine, embeddings, embeddingWidth,
  fullOutputScores, fullOutputShares, fullOutputTarget, fullOutputWords, maskedContextChoices, negativeWords, nextWordRows, pairs,
  prefixScores, profileNames, profileScores, rate, round, scaledProfiles, sentence, softmax, traits, updatedCentre,
  updatedContexts, updatedProbabilities, windowAt,
} from './word2vec-figure-data.js';

const spec = diagram => ({ version: 1, diagram });
const row = (heading, ...cells) => ({ heading, cells: cells.map(String) });
const matrix = (title, caption, columns, rows) => ({ kind: 'matrix', title, caption, columns, rows });
const tuple = values => '$(' + values.map(round).join(',') + ')$';
const vector = (label, values) => ({ tensor: { name: label, dimensions: '1 × ' + embeddingWidth,
  rows: 1, columns: embeddingWidth, ...(values ? { values: values.map(round) } : {}) } });
const list = (label, ...items) => ({ label, items });
const brief = depth => depth === 'brief';
const detailed = depth => depth === 'detailed';
const reference = (id, lessons, prompts, paraphrases, keywords, useWhen, makeDiagram) => ({
  id: 'ml-word2vec-' + id, lessons, prompts, paraphrases, keywords, useWhen,
  spec: spec(makeDiagram('balanced')),
  depths: { overview: { spec: spec(makeDiagram('brief')) }, deep: { spec: spec(makeDiagram('detailed')) } },
});
const asFlow = (title, caption, labels) => ({
  kind: 'flow', title, caption,
  nodes: labels.map((label, index) => ({ id: 's' + index, label, role: index === labels.length - 1 ? 'outcome' : 'process' })),
  edges: labels.slice(1).map((_, index) => ({ from: 's' + index, to: 's' + (index + 1) })),
});

const wordLookup = reference('word-lookup', ['08'],
  ['How does a Word2vec lookup turn a word into numbers?'],
  ['What does a word get from the Word2vec embedding table?'],
  ['word2vec lookup turn a word into numbers', 'word2vec embedding table'],
  'Explain a row lookup from the input embedding table. Compare two selected rows with the same width. Their entries are learned coordinates.',
  depth => ({
    kind: 'transformation', title: brief(depth) ? 'A row of numbers for every word' : 'Look up an embedding by word',
    caption: detailed(depth) ? 'For word index $i$, use row $E_{i,:}$. All rows have the same width.' :
      'A different word selects a different row. The number of slots stays the same.',
    before: list('Words', 'robot', 'seeds'),
    operation: 'Read the matching table rows',
    after: list('Stored numbers', vector('robot', brief(depth) ? undefined : embeddings.robot),
      vector('seeds', brief(depth) ? undefined : embeddings.seeds)),
  }));

const profiles = reference('profile-coordinates', ['08'],
  ['How can a profile help me understand an embedding vector?'],
  ['Why does the personality profile analogy put each trait in a different slot?'],
  ['profile help me understand an embedding vector', 'personality profile analogy put each trait'],
  'Use a measured profile as an analogy for fixed coordinate slots. Clarify that unlike these traits, word-vector dimensions do not come with hand-written names.',
  depth => matrix(brief(depth) ? 'Several scores describe one person' : 'Profile traits as fixed coordinates',
    detailed(depth) ? 'A toy centering rule is $s=x/50-1$. The same three positions still describe the same traits.' :
      'Read traits in the same order in every row. Learned word vectors usually have no named traits.',
    traits, profileNames.map((name, i) => row(name, ...(detailed(depth) ? scaledProfiles[i] : profileScores[i])))));

const scaledTrait = reference('trait-rescale', ['08'],
  ['How does rescaling a personality score help explain embedding coordinates?'],
  ['Can I see one personality trait score moved to a centered scale?'],
  ['rescaling a personality score help explain embedding coordinates', 'personality trait score moved to a centered scale'],
  'Show the same trait before and after centering its units. Mark one measured score without changing the relative order.',
  depth => ({
    kind: 'number-line', title: brief(depth) ? 'Same trait, different numbers' : 'Center the units of one profile trait',
    caption: detailed(depth) ? 'Use $s=x/50-1$ to put the midpoint at zero. The original score ' + profileScores[0][0] + ' maps to ' + scaledProfiles[0][0] + '.' :
      'On the old scale, Jun scored ' + profileScores[0][0] + '. On the centered scale, the same result sits on the positive side.',
    min: -1, max: 1,
    markers: [{ value: 0, label: 'Middle of the original scale' }, { value: scaledProfiles[0][0], label: 'Jun’s centered sociability' }],
  }));

const origin = { x: 0, y: 0 };
const directions = reference('profile-directions', ['06'],
  ['How can I see the direction of a profile vector on two axes?'],
  ['In the embedding analogy, how do two traits give a profile vector a direction?'],
  ['direction of a profile vector on two axes', 'two traits give a profile vector a direction'],
  'Show the first two centered traits as directions from a shared origin. Save the full three-coordinate comparison for the cosine reference.',
  depth => ({
    kind: 'coordinate-plot', title: brief(depth) ? 'People can point in similar directions' : 'Two-coordinate profile directions',
    caption: detailed(depth) ? 'Plot only the first two coordinates after $s=x/50-1$. Full similarity still uses the third trait.' :
      'Start each arrow at the same zero point. Only two traits are visible here.',
    x: { label: 'Sociability', min: -1, max: 1 }, y: { label: 'Stamina', min: -1, max: 1 },
    series: [{ label: 'Shared start', kind: 'scatter', points: [origin] }],
    annotations: profileNames.map((label, i) => ({ kind: 'vector', label, from: origin,
      to: { x: scaledProfiles[i][0], y: scaledProfiles[i][1] } })),
  }));

const profileSimilarity = reference('profile-cosine', ['06'],
  ['How do I use cosine similarity to rank profiles with several coordinates?'],
  ['Which profile has the closest direction when cosine uses all three traits?'],
  ['cosine similarity to rank profiles with several coordinates', 'cosine uses all three traits'],
  'Use every centered coordinate, normalize by both vector lengths, and rank relative to one fixed profile.',
  depth => matrix(brief(depth) ? 'Rank by how closely the directions match' : 'Cosine comparison across three coordinates',
    detailed(depth) ? 'Use $\\cos(u,v)=(u\\cdot v)/(\\|u\\|\\|v\\|)$. Jun is the anchor and has similarity one with itself.' :
      'Compare to Jun. All three traits affect the score even though only two fit on the earlier chart.',
    [...traits, brief(depth) ? 'Direction match' : 'Cosine to Jun'],
    profileNames.map((name, i) => row(name, ...scaledProfiles[i], round(cosine(scaledProfiles[0], scaledProfiles[i]))))));

const signedRows = reference('signed-embedding-heatmap', ['08'],
  ['How do I read the colored cells of a Word2vec embedding heatmap?'],
  ['What does the shared color scale show in a heatmap of word vectors?'],
  ['colored cells of a word2vec embedding heatmap', 'shared color scale show in a heatmap of word vectors'],
  'Display literal signed coordinates with the same column order and scale. Do not name an individual embedding coordinate as a semantic trait.',
  depth => ({
    kind: 'heatmap', title: brief(depth) ? 'Color shows how the stored rows differ' : 'One signed scale for word vectors',
    caption: detailed(depth) ? 'All cells use the range $[-1,1]$. A similar visual pattern is only a clue, not a substitute for a distance calculation.' :
      'Compare cells in the same column. One shared scale makes opposite signs distinguishable.',
    columns: ['First entry', 'Second entry', 'Third entry'],
    rows: ['seed', 'seeds', 'bulb', 'bulbs'].map(label => ({ label, cells: embeddings[label] })),
    range: { min: -1, max: 1 },
  }));

const vectorAnalogy = reference('word-offset', ['06'],
  ['How does a Word2vec analogy use vector subtraction and a nearest word?'],
  ['Why does adding a Word2vec analogy offset need a vocabulary search?'],
  ['word2vec analogy use vector subtraction', 'word2vec analogy offset need a vocabulary search'],
  'Add the toy change from a singular word to its plural to a different singular. The computed vector is a query, so retrieve the nearest stored row.',
  depth => matrix(brief(depth) ? 'Reuse a change, then find a word' : 'A word analogy is a vector search',
    detailed(depth) ? '$q=E_{\\rm bulb}+(E_{\\rm seeds}-E_{\\rm seed})$. Of the shown candidates, bulbs is closest to $q$.' :
      'Reuse the change from seed to seeds on bulb. The result lies near a stored word without exactly matching it.',
    ['First', 'Second', 'Third', 'Gap'],
    [row('Plural offset', ...analogyOffset, '–'), row('New search point', ...analogyQuery, '–'),
      ...analogyRanks.map(({ word, distance }) => row(word, ...embeddings[word], distance))]));

const prefix = sentence.slice(0, 4).join(' ');
const completion = reference('prefix-guesses', ['03'],
  ['In the Word2vec introduction, how does a keyboard rank possible next words?'],
  ['Why do keyboard next-word guesses have probabilities before picking a word?'],
  ['word2vec introduction how does a keyboard rank', 'keyboard next word guesses have probabilities'],
  'Use a standalone next-word prediction to introduce probability over alternatives. This keyboard example is separate from the skip-gram training objective.',
  depth => ({
    kind: 'bar-chart', title: brief(depth) ? 'A keyboard can make several guesses' : 'Next-word predictions for a fixed prefix',
    caption: detailed(depth) ? 'After “' + prefix + '”, normalize toy scores $z$ with $p_j=e^{z_j}/\\sum_k e^{z_k}$.' :
      'The phrase “' + prefix + '” is visible. The bars are alternative guesses for the one blank.',
    bars: Object.keys(prefixScores).map((label, index) => ({ label, value: softmax(Object.values(prefixScores))[index] })),
  }));

const predictModel = reference('neural-predictor', [],
  ['What happens inside the small language model used to introduce Word2vec?'],
  ['How do embeddings become vocabulary scores in the Word2vec tutorial model?'],
  ['small language model used to introduce word2vec', 'embeddings become vocabulary scores in the word2vec tutorial'],
  'Show a conventional next-word predictor using table lookup, a context computation and one score per vocabulary item.',
  depth => asFlow(brief(depth) ? 'How a predictor gets from words to guesses' : 'A simple neural word predictor',
    detailed(depth) ? 'An output row $u_j$ assigns score $u_j\\cdot h$ to context state $h$. Softmax converts the scores into shares.' :
      'Read the words already given. Look up their rows and combine the numbers before scoring the choices.',
    ['Read “' + prefix + '”', 'Read stored word vectors', 'Combine the observed context',
      brief(depth) ? 'Score the possible next words' : 'Project to vocabulary scores']));

const slidingPrefix = reference('sliding-next-word', ['01'],
  ['How does a sliding window turn text into next-word training rows?'],
  ['Can you show the next-word dataset after moving the window by one word?'],
  ['sliding window turn text into next word training rows', 'next word dataset after moving the window'],
  'Move a fixed two-token input window one position at a time and take the following token as the observed target.',
  depth => matrix(brief(depth) ? 'Move the window to get another example' : 'Build next-word training rows from text',
    detailed(depth) ? 'At position $i$, use $(w_i,w_{i+1})$ to predict $w_{i+2}$. Adjacent inputs overlap.' :
      'Take the next word as the answer. Shift the reading window one place and repeat.',
    [brief(depth) ? 'Given words' : 'Context tokens', brief(depth) ? 'Answer' : 'Observed target'],
    nextWordRows.map(({ context, target }, i) => row('Window ' + (i + 1), context, target))));

const missingWord = reference('right-context-clue', [],
  ['Why does looking after the blank help guess the middle word in a Word2vec example?'],
  ['Can the words after a missing center word rule out some guesses?'],
  ['looking after the blank help guess the middle word in a word2vec example', 'words after a missing center word rule out some guesses'],
  'Hold the missing position and left prefix fixed. Show how later words eliminate one candidate without making the remaining candidates impossible.',
  depth => ({
    kind: 'comparison', title: brief(depth) ? 'Later words give an extra clue' : 'Compare left-only and two-sided clues',
    caption: detailed(depth) ? 'The observed middle word is “' + centre + '”. A training target comes from the text, even when several completions fit.' :
      'The blank stays in the same place. Seeing the words after it makes “glows” a poor fit.',
    columns: [
      { heading: 'Before seeing later words', items: [
        '“' + sentence.slice(0, centreIndex).join(' ') + ' [blank]”',
        'Plausible: ' + maskedContextChoices.join(', '),
      ] },
      { heading: 'After seeing later words', items: [
        '“' + sentence.slice(0, centreIndex).join(' ') + ' [blank] ' + sentence.slice(centreIndex + 1).join(' ') + '”',
        'Still plausible: ' + maskedContextChoices.slice(0, 2).join(', '),
      ] },
    ],
  }));

const bidirectional = reference('context-both-sides', ['01'],
  ['How does Word2vec use words on both sides of a hidden center word?'],
  ['What does a continuous bag of words example take as input?'],
  ['word2vec use words on both sides of a hidden center', 'continuous bag of words example take as input'],
  'Keep the middle word on the target side and neighboring words on both sides in the input. Distinguish this from a causal next-word predictor.',
  depth => matrix(brief(depth) ? 'Words on both sides help fill the blank' : 'Continuous bag-of-words training examples',
    detailed(depth) ? 'For toy radius one, predict $w_i$ from $w_{i-1}$ and $w_{i+1}$. Both neighbors are already in the training text.' :
      'Hide the center word. The learner can use nearby words before and after it.',
    ['Before the blank', 'After the blank', 'Hidden word'],
    [2, 3, 4].map(i => row('Position ' + (i + 1), sentence[i - 1], sentence[i + 1], sentence[i]))));

const skipgram = reference('skipgram-window', ['01'],
  ['How does a skip-gram window make separate training pairs?'],
  ['Why does one center word become several skip-gram rows as the window slides?'],
  ['skip gram window make separate training pairs', 'one center word become several skip gram rows'],
  'Show center-to-neighbor direction with separate pairs. Move the center once and retain the prior pairs.',
  depth => matrix(brief(depth) ? 'One center gives several pairs' : 'Extract skip-gram pairs from a moving window',
    detailed(depth) ? 'For every eligible $j\\ne i$, add a separate pair $(w_i,w_j)$. The example uses radius one.' :
      'Keep the center word fixed for each pair. Shift the window and add the next center’s pairs.',
    ['Center word', 'Neighbor word'],
    [centreIndex - 1, centreIndex].flatMap(i => windowAt(sentence, i, 1).map((neighbor, offset) =>
      row('Position ' + (i + 1) + ', pair ' + (offset + 1), sentence[i], neighbor)))));

const softmaxTarget = reference('full-vocabulary-target', [],
  ['How does the full-vocabulary skip-gram predictor compare its output with the observed word?'],
  ['Can I see the one-hot skip-gram target next to its vocabulary prediction and error?'],
  ['full vocabulary skip gram predictor compare its output', 'one hot skip gram target next to its vocabulary prediction'],
  'Contrast an observed context word with a normalized prediction for the four displayed output candidates. This step uses full softmax on the toy output vocabulary, before the switch to negative sampling.',
  depth => matrix(brief(depth) ? 'Compare each guess with the observed word' : 'Full-softmax skip-gram learning signal',
    detailed(depth) ? 'For center “' + centre + '”, softmax of scores $z$ gives $p$. With target $y$, the logit gradient is $p-y$.' :
      'The observed word is “' + fullOutputTarget + '”. Raise its score and lower the scores assigned to the other choices.',
    brief(depth) ? ['Model share', 'Observed', 'Correction'] : ['Score', 'Softmax share', 'One-hot target', 'Target minus share'],
    fullOutputWords.map((word, i) => {
      const target = Number(word === fullOutputTarget);
      const values = [fullOutputShares[i], target, round(target - fullOutputShares[i])];
      return row(word, ...(brief(depth) ? values : [round(fullOutputScores[i]), ...values]));
    })));

const fullSoftmaxLoop = reference('full-softmax-training-loop', [],
  ['How does the full-softmax skip-gram training loop use the prediction error?'],
  ['When does the old Word2vec full-vocabulary predictor update its tables?'],
  ['full softmax skip gram training loop use the prediction error', 'old word2vec full vocabulary predictor update its tables'],
  'Follow one observed neighbor pair through full vocabulary scoring and back to a parameter update. Do not confuse this with the independent binary pairs used later.',
  depth => ({
    kind: 'cycle', title: brief(depth) ? 'Compare, update, then try the next pair' : 'Full-softmax skip-gram training loop',
    caption: detailed(depth) ? 'The observed word supplies a target. Use the gradient $p-y$ to change the scores through the trainable rows.' :
      'The answer from the text gives the predictor a learning signal before it moves on to another pair.',
    steps: [
      'Read center “' + centre + '” and target “' + fullOutputTarget + '”',
      'Score each word in the toy vocabulary',
      'Compare the predicted shares with the target',
      'Update the trainable rows',
    ],
  }));

const candidateObjective = reference('vocabulary-versus-pair', [],
  ['Why does Word2vec replace full softmax with scoring a few pairs?'],
  ['How does a sampled pair classifier avoid scoring the entire Word2vec vocabulary?'],
  ['word2vec replace full softmax with scoring a few pairs', 'sampled pair classifier avoid scoring the entire word2vec vocabulary'],
  'Compare the full-softmax prediction objective with independent positive and negative pair scores. Sampled binary probabilities are not a vocabulary probability distribution.',
  depth => ({
    kind: 'comparison', title: brief(depth) ? 'Guess every word or check a few pairs' : 'Full vocabulary versus sampled pair objective',
    caption: detailed(depth) ? 'Work per fixed-width center changes from scoring $|V|$ words to scoring one observed pair and $k$ sampled pairs.' :
      'Full prediction scores every choice. Pair training scores one observed neighbor and some sampled alternatives.',
    columns: [
      { heading: brief(depth) ? 'Predict the neighbor' : 'Full softmax',
        items: ['Start with one center word', 'Score all vocabulary choices', 'Normalize the scores together'] },
      { heading: brief(depth) ? 'Check each sampled pair' : 'Negative sampling',
        items: ['Supply a center and candidate', 'Score only the chosen pairs', 'Check each pair separately'] },
    ],
  }));

const labels = reference('positive-only-failure', ['09', '17'],
  ['Why does Word2vec need negative examples when all observed pairs are neighbors?'],
  ['What can an always-yes pair classifier learn from positive-only Word2vec data?'],
  ['word2vec need negative examples when all observed pairs', 'always yes pair classifier learn from positive only word2vec'],
  'Show why a constant positive output succeeds on a positive-only dataset. Add a sampled comparison without treating all corpus co-occurrences as false.',
  depth => matrix(brief(depth) ? 'Always saying yes fails on a comparison' : 'Positive pairs alone cannot teach contrast',
    detailed(depth) ? 'An always-positive classifier has perfect accuracy on the observed-only rows but errs on a sampled pair with label $y=0$.' :
      'The first two pairs were observed. A sampled comparison exposes why always guessing yes is unhelpful.',
    ['Candidate for ' + centre, 'Training label', 'Always says yes'],
    [
      row('Observed pair one', 'robot', 'Neighbor', 'Right'),
      row('Observed pair two', 'seeds', 'Neighbor', 'Right'),
      row('Sampled comparison', negativeWords[0], 'Negative', 'Wrong'),
    ]));

const sampledPairs = reference('sampled-training-rows', ['01'],
  ['How does negative sampling make the actual training rows for Word2vec?'],
  ['Where do the fake neighbors come from in a skip-gram negative sampling batch?'],
  ['negative sampling make the actual training rows for word2vec', 'fake neighbors come from in a skip gram negative sampling batch'],
  'Combine observed context pairs with candidates drawn from the toy vocabulary. The second batch changes the positive and sampled candidates but retains the same model tables.',
  depth => matrix(brief(depth) ? 'Add sampled alternatives to each observed pair' : 'Assemble skip-gram negative-sampling batches',
    detailed(depth) ? 'For a fixed center “' + centre + '”, keep the observed pair with $y=1$ and sampled alternatives with $y=0$.' :
      'Draw the alternatives from the vocabulary. They need not be adjacent in this training window.',
    ['Candidate', 'Pair source', 'Training label'],
    [
      ...pairs.map(({ word, target }, i) => row('Batch one, pair ' + (i + 1), word, target ? 'Observed' : 'Sampled', target)),
      ...['seeds', ...negativeWords.slice(2)].map((word, i) => row('Batch two, pair ' + (i + 1), word, i ? 'Sampled' : 'Observed', i ? 0 : 1)),
    ]));

const vectorTables = reference('centre-and-context-tables', [],
  ['Why does Word2vec have two embedding tables, one for centers and one for contexts?'],
  ['Which vector does a skip-gram pair look up from each table?'],
  ['word2vec have two embedding tables', 'skip gram pair look up from each table'],
  'Read the center vector from the input table and the candidate vector from the context table. The two rows for robot differ even though both tables use the same word IDs.',
  depth => ({
    ...matrix(brief(depth) ? 'A word can get different rows in different jobs' : 'Look up center and context vectors separately',
      detailed(depth) ? 'A pair $(w,c)$ uses input row $E_w$ and context row $C_c$. The highlighted cells are the ones looked up.' :
        'Use the input row for the center and the context rows for the candidates. The two tables store different numbers.',
      ['Input table', 'Context table'], ['sorts', 'robot', 'bulbs'].map(word => ({
        id: word,
        ...row(word, ...(brief(depth) ? ['Center row', 'Context row'] : [tuple(embeddings[word]), tuple(contextVectors[word])])),
      }))),
    layout: 'teaching',
    emphasis: { cells: [{ row: 'sorts', column: 0 }, { row: 'robot', column: 1 }, { row: 'bulbs', column: 1 }] },
  }));

const pairScores = reference('pair-dot-and-sigmoid', ['03'],
  ['How does Word2vec turn a dot product into a probability for a skip-gram pair?'],
  ['Why do sampled Word2vec pair scores go through a sigmoid?'],
  ['word2vec turn a dot product into a probability for a skip gram pair', 'sampled word2vec pair scores go through a sigmoid'],
  'Multiply matching entries from the center and context vectors, sum, then apply a sigmoid independently to each sampled pair.',
  depth => matrix(brief(depth) ? 'Turn a pair score into a chance' : 'Dot product and sigmoid for sampled pairs',
    detailed(depth) ? 'For “' + centre + '” and candidate $c$, use $z=E_w\\cdot C_c$ and $p=1/(1+e^{-z})$. The three chances do not add to one.' :
      'Combine the center and candidate rows for one score. Convert each score into a chance separately.',
    [brief(depth) ? 'Raw score' : 'Dot product', brief(depth) ? 'Chance' : 'Sigmoid', 'Observed label'],
    pairs.map(({ word, target, score, probability }) => row(word, round(score), round(probability), target))));

const pairErrors = reference('pair-score-error', ['03'],
  ['How does Word2vec calculate the error on positive and negative skip-gram pairs?'],
  ['What sign does the Word2vec pair update get when a negative sample scores too high?'],
  ['word2vec calculate the error on positive and negative skip gram pairs', 'word2vec pair update get when a negative sample'],
  'Use label minus prediction for the logit update direction. Keep the positive label and negative labels distinct from the model scores.',
  depth => matrix(brief(depth) ? 'Which guesses should rise or fall?' : 'Score correction for positive and negative pairs',
    detailed(depth) ? 'Binary log loss gives logit gradient $p-y$. In the descent direction the signal is $y-p$.' :
      'Raise the observed pair’s score. Lower the scores of the sampled alternatives.',
    ['Training label', 'Predicted chance', brief(depth) ? 'Correction' : 'Label minus chance'],
    pairs.map(({ word, target, probability, error }) => row(word, target, round(probability), round(error)))));

const trainingStep = reference('embedding-row-update', [],
  ['Which Word2vec embedding rows change after one negative-sampling update?'],
  ['Can I see the center and context vectors before and after a skip-gram training step?'],
  ['word2vec embedding rows change after one negative sampling update', 'center and context vectors before and after a skip gram training step'],
  'Update one center row and only the context rows looked up in this batch. Compute both sets of changes from the old vectors with a summed loss and one toy learning rate.',
  depth => matrix(brief(depth) ? 'Only rows used by the pairs change' : 'One simultaneous Word2vec update',
    detailed(depth) ? 'Use $\\eta=' + rate + '$ and $\\Delta E=\\eta\\sum_c(y_c-p_c)C_c$. The sampled context rows use the old center row.' :
      'Every pair can change the same center row. Each candidate changes only its own context row.',
    brief(depth) ? ['Rows in this batch', 'Update'] : ['Before', 'After'],
    brief(depth) ? [
      row('Center ' + centre, 'All pair errors', 'Changed once'),
      row('Context robot', 'Observed pair error', 'Changed'),
      row('Context bulbs', 'Sampled pair error', 'Changed'),
      row('Context outside', 'Sampled pair error', 'Changed'),
      row('Context packs', 'Not looked up', 'Unchanged'),
    ] : [
      row('Center ' + centre, tuple(embeddings[centre]), tuple(updatedCentre)),
      ...pairs.map(({ word }) => row('Context ' + word, tuple(contextVectors[word]), tuple(updatedContexts[word]))),
      row('Context packs', tuple(contextVectors.packs), tuple(contextVectors.packs)),
    ]));

const postUpdate = reference('scores-after-update', [],
  ['What happens to positive and negative Word2vec scores after a training step?'],
  ['Can I compare skip-gram pair probabilities before and after one update?'],
  ['positive and negative word2vec scores after a training step', 'skip gram pair probabilities before and after one update'],
  'Recompute the three pair probabilities from the updated center and context tables. This one step changes both tables. The next batch starts with those updated rows.',
  depth => matrix(brief(depth) ? 'See what changed in the next guess' : 'Rescore the sampled pairs after one update',
    detailed(depth) ? 'Recompute $p=1/(1+e^{-E_w\\cdot C_c})$ from the new rows. This is one toy batch, not a guarantee about every update.' :
      'The positive example gains probability in this batch. The sampled examples lose probability.',
    ['Pair type', 'Before update', 'After update'],
    pairs.map(({ word, target, probability }) => row(word, target ? 'Observed' : 'Sampled',
      round(probability), round(updatedProbabilities[word])))));

const windowRadius = reference('window-radius', ['08'],
  ['What changes when I make the Word2vec context window wider?'],
  ['Which extra words count as neighbors with a larger Word2vec window?'],
  ['word2vec context window wider', 'extra words count as neighbors with a larger word2vec window'],
  'Hold the center and text fixed. A wider context radius admits extra distant words, while the negative-sample budget is a separate setting.',
  depth => ({
    kind: 'sample-set', title: brief(depth) ? 'A wider window includes more words' : 'Two context radii around the same center',
    caption: detailed(depth) ? 'The context includes positions with $0<|j-i|\\le r$. Widening this window adds a pair at each newly eligible position.' :
      'The center stays “' + centre + '”. A wider window adds small and today to the possible neighbors.',
    samples: sentence.slice(1).map(word => ({ id: word, label: word, ...(word === centre ? { class: 'Center' } : {}) })),
    groups: [1, 2].map(radius => ({ id: 'r' + radius,
      label: brief(depth) ? (radius === 1 ? 'Narrow window' : 'Wide window') : 'Radius ' + radius,
      members: windowAt(sentence, centreIndex, radius),
    })),
  }));

const negativeBudget = reference('negative-sample-budget', [],
  ['What changes when I increase the number of negative samples in Word2vec?'],
  ['How do two and four Word2vec negative samples differ for the same positive pair?'],
  ['increase the number of negative samples in word2vec', 'two and four word2vec negative samples differ'],
  'Keep the observed pair fixed and vary the number of scored alternatives. A larger count increases work, independently of the context radius.',
  depth => matrix(brief(depth) ? 'The same positive pair, more comparisons' : 'Compare two negative-sample budgets',
    detailed(depth) ? 'A positive pair plus $k$ negative samples costs $1+k$ pair scores. Both budgets keep the same context window.' :
      'Use the same observed pair. The larger budget scores two extra alternatives.',
    ['Pair source', 'Two negatives', 'Four negatives'],
    [row(fullOutputTarget, 'Observed', 'Score it', 'Score it'),
      ...negativeWords.map((word, i) => row(word, 'Sampled', i < 2 ? 'Score it' : 'Skip it', 'Score it'))]));

export const word2vecFigureReferences = [
  wordLookup, profiles, scaledTrait, directions, profileSimilarity, signedRows, vectorAnalogy, completion, predictModel,
  slidingPrefix, missingWord, bidirectional, skipgram, fullSoftmaxLoop, softmaxTarget, candidateObjective, labels, sampledPairs, vectorTables,
  pairScores, pairErrors, trainingStep, postUpdate, windowRadius, negativeBudget,
];
