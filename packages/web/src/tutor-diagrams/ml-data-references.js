// Small illustrative data, not source evidence. Each exported spec is directly runnable.
const reference = (id, lessons, prompts, keywords, useWhen, diagram) => ({ id, lessons, prompts, keywords, useWhen, spec: { version: 1, diagram } });
const timeline = (title, domain, lanes, rest = {}) => ({ kind: 'timeline', layout: 'scaled-lanes', title, domain, lanes, ...rest });
const matrix = (title, columns, rows, rest = {}) => ({ kind: 'matrix', layout: 'teaching', title, columns, rows, ...rest });
const row = (id, heading, cells) => ({ id, heading, cells });
const interval = (id, label, start, end, role) => ({ id, label, start, end, role });
const event = (id, label, time, detail) => ({ id, label, time, ...(detail ? { detail } : {}) });

export const references = [
  reference('train-validation-test-split', ['01', '09'],
    ['Explain the difference between training, validation, and test data.'],
    ['train validation test', 'holdout', 'split', 'data split'],
    'Show a fixed 60/20/20 split after shuffling; boundary positions represent percentages of rows.',
    timeline('Training, validation, and test split', { min: 0, max: 100, unit: '%', label: 'Shuffled row boundary' }, [
      { id: 'split', label: 'One partition', intervals: [interval('train', 'Fit: 60%', 0, 60, 'train'), interval('validate', 'Tune: 20%', 60, 80, 'validation'), interval('test', 'Final test: 20%', 80, 100, 'test')] },
    ], { caption: 'Fit on training data, select with validation data, then report once on the held-out test set.' })),

  reference('stratified-fold-counts', ['09', '17'],
    ['How does stratified cross-validation preserve class balance?'],
    ['stratified', 'class proportion', 'cross validation', 'imbalance'],
    'Compare class counts in three folds with identical 20% positive prevalence.',
    matrix('Stratified folds preserve class proportions', ['Fold A', 'Fold B', 'Fold C'], [
      row('negative', 'Negative', ['8', '8', '8']), row('positive', 'Positive', ['2', '2', '2']), row('total', 'Total', ['10', '10', '10']),
    ], { emphasis: { rows: ['positive'] }, caption: 'Each fold contains 2 positive rows out of 10. Across all folds: 6 positive rows out of 30.' })),

  reference('nested-cross-validation-folds', ['09', '12'],
    ['Explain nested cross-validation and show why the outer test fold stays untouched.'],
    ['nested cv', 'nested cross validation', 'inner folds', 'outer test', 'hyperparameter'],
    'Show an outer holdout and two illustrative inner validation splits within its training partition.',
    timeline('Nested CV keeps the outer test separate', { min: 0, max: 100, unit: 'rows', label: 'Row boundary' }, [
      { id: 'outer', label: 'Outer split', intervals: [interval('outerTrain', 'Outer train', 0, 80, 'train'), interval('outerTest', 'Outer test', 80, 100, 'test')] },
      { id: 'innerA', label: 'Inner split A', intervals: [interval('aTrain', 'Fit', 0, 60, 'train'), interval('aValid', 'Validate', 60, 80, 'validation')] },
      { id: 'innerB', label: 'Inner split B', intervals: [interval('bTrain1', 'Fit', 0, 40, 'train'), interval('bValid', 'Validate', 40, 60, 'validation'), interval('bTrain2', 'Fit', 60, 80, 'train')] },
    ], { cutoffs: [{ id: 'outerBoundary', label: 'Outer test starts', time: 80 }], caption: 'Only two inner splits are illustrated. Inner tuning never uses rows 80–100; outer folds repeat this process.' })),

  reference('walk-forward-validation-gaps', ['09', '15', '20'],
    ['Show expanding walk-forward validation with a gap before each test window.'],
    ['walk forward', 'expanding window', 'time series validation', 'gap', 'purge'],
    'Map train, gap, and test intervals to a common numeric time scale without shuffling.',
    timeline('Expanding walk-forward validation with gaps', { min: 0, max: 12, unit: 'month', label: 'Time' }, [
      { id: 'fold1', label: 'Fold 1', intervals: [interval('f1train', 'Train', 0, 6, 'train'), interval('f1gap', 'Gap', 6, 7, 'gap'), interval('f1test', 'Test', 7, 8, 'test')] },
      { id: 'fold2', label: 'Fold 2', intervals: [interval('f2train', 'Train', 0, 8, 'train'), interval('f2gap', 'Gap', 8, 9, 'gap'), interval('f2test', 'Test', 9, 10, 'test')] },
      { id: 'fold3', label: 'Fold 3', intervals: [interval('f3train', 'Train', 0, 10, 'train'), interval('f3gap', 'Gap', 10, 11, 'gap'), interval('f3test', 'Test', 11, 12, 'test')] },
    ], { caption: 'Training grows with time. Each test window follows a one-month exclusion gap; choose the gap for the data and label horizon.' })),

  reference('sliding-window-validation', ['15', '20'],
    ['How is rolling-window validation different from an expanding training window?'],
    ['rolling window', 'sliding window', 'fixed window', 'temporal drift'],
    'Show equal-duration training windows moving forward on the same time scale.',
    timeline('A fixed training window moves forward', { min: 0, max: 10, unit: 'month', label: 'Time' }, [
      { id: 'fold1', label: 'Fold 1', intervals: [interval('s1train', 'Train: 4 months', 0, 4, 'train'), interval('s1test', 'Test', 4, 6, 'test')] },
      { id: 'fold2', label: 'Fold 2', intervals: [interval('s2train', 'Train: 4 months', 2, 6, 'train'), interval('s2test', 'Test', 6, 8, 'test')] },
      { id: 'fold3', label: 'Fold 3', intervals: [interval('s3train', 'Train: 4 months', 4, 8, 'train'), interval('s3test', 'Test', 8, 10, 'test')] },
    ], { caption: 'The training duration stays at four months while both training and testing move forward.' })),

  reference('label-delay-monitoring', ['20', '21'],
    ['Why do delayed labels make recent model-quality monitoring incomplete?'],
    ['label delay', 'delayed labels', 'monitoring', 'label availability'],
    'Separate prediction time, delayed label availability, and an evaluation cutoff.',
    timeline('A prediction can precede its label by days', { min: 0, max: 12, unit: 'day', label: 'Time' }, [
      { id: 'case', label: 'One prediction', intervals: [interval('delay', 'Waiting for the label', 2, 9, 'gap')], events: [event('prediction', 'Prediction', 2), event('labelReady', 'Label available', 9)] },
    ], { cutoffs: [{ id: 'evaluation', label: 'Evaluation cutoff', time: 5 }], caption: 'At day 5 this prediction has no observed label. Supervised error can be scored only once the label arrives at day 9.' })),

  reference('as-of-join-ttl-window', ['21'],
    ['Explain a point-in-time feature join with a TTL, including stale and future records.'],
    ['as of join', 'as-of', 'ttl', 'point in time', 'stale', 'future feature'],
    'Show a four-hour inclusive event-time lookback window at a prediction cutoff, with eligible, stale, and future values.',
    timeline('As-of lookup with a four-hour TTL', { min: 0, max: 14, unit: 'h', label: 'Event time' }, [
      { id: 'allowed', label: 'Allowed event times', intervals: [interval('ttl', 'Eligible TTL window', 6, 10, 'window')] },
      { id: 'source', label: 'Source records', events: [event('stale', 'Stale: excluded', 5), event('eligible', 'Eligible: selected', 8), event('future', 'Future: excluded', 11)] },
    ], { cutoffs: [{ id: 'ttlStart', label: 'TTL lower bound', time: 6 }, { id: 'asOf', label: 'Prediction cutoff', time: 10 }], caption: 'Here $6 \\le t_{event} \\le 10$. Select the latest eligible record, assuming it was already available by time 10.' })),

  reference('point-in-time-created-time', ['21', '13'],
    ['Why must a point-in-time join check both event time and created time?'],
    ['created time', 'event time', 'availability time', 'point-in-time correctness', 'late arrival'],
    'Compare a record available before prediction with one created after prediction despite an earlier event time.',
    timeline('A past event can arrive after prediction', { min: 0, max: 14, unit: 'h', label: 'Time' }, [
      { id: 'ready', label: 'Record A: eligible', intervals: [interval('aLag', 'Ingestion delay', 8, 9, 'available')], events: [event('aEvent', 'Event time', 8), event('aCreated', 'Created time', 9)] },
      { id: 'late', label: 'Record B: excluded', intervals: [interval('bLag', 'Late arrival', 7, 12, 'excluded')], events: [event('bEvent', 'Event time', 7), event('bCreated', 'Created time', 12)] },
    ], { cutoffs: [{ id: 'predictAt', label: 'Prediction', time: 10 }], caption: 'Require $t_{event} \\le 10$ and $t_{created} \\le 10$. Record B was unavailable at prediction.' })),

  reference('event-created-label-time', ['21', '19'],
    ['Distinguish event time, feature availability time, prediction time, and label time.'],
    ['event created label time', 'label time', 'feature availability', 'prediction timestamp'],
    'Place four distinct timestamps for one training example on a shared numeric clock.',
    timeline('Four clocks for one training example', { min: 0, max: 10, unit: 'day', label: 'Time' }, [
      { id: 'feature', label: 'Feature record', events: [event('occurred', 'Event occurred', 2), event('ingested', 'Created / available', 4)] },
      { id: 'target', label: 'Prediction and target', events: [event('predicted', 'Prediction', 5), event('labelled', 'Label available', 9)] },
    ], { cutoffs: [{ id: 'snapshot', label: 'Feature snapshot', time: 5 }], caption: 'The feature is available by prediction at day 5. The target arrives at day 9 and must not appear in prediction-time features.' })),

  reference('late-arrival-snapshot-matrix', ['21'],
    ['Show which records belong in a historical feature snapshot when data arrives late.'],
    ['late arriving data', 'historical snapshot', 'late arrival', 'availability cutoff'],
    'Use literal timestamp comparisons to distinguish eventual stored data from historically available data.',
    matrix('Stored eventually does not mean available earlier', ['Event h', 'Created h', 'Predict h', 'Eligible'], [
      row('late', 'Late record', ['7', '12', '10', 'No']), row('ready', 'Ready record', ['8', '9', '10', 'Yes']),
    ], { emphasis: { cells: [{ row: 'late', column: 1 }, { row: 'ready', column: 3 }] }, caption: 'Require $t_{event} \\le t_{predict}$ and $t_{created} \\le t_{predict}$. A record created at 12 is unavailable for prediction at 10.' })),

  reference('one-hot-encoding', ['08'],
    ['Show one-hot encoding while preserving the identities of the rows.'],
    ['one hot', 'one-hot', 'categorical encoding', 'dummy variable'],
    'Turn a two-category column into two literal binary indicators without changing row identity.',
    matrix('One-hot encoding keeps each sample identifiable', ['Color', 'Is red', 'Is blue'], [
      row('r1', 'Sample 1', ['red', '1', '0']), row('r2', 'Sample 2', ['blue', '0', '1']), row('r3', 'Sample 3', ['red', '1', '0']),
    ], { emphasis: { columns: [1, 2] }, caption: 'Each row has exactly one active indicator. The same sample IDs remain attached to the encoded features.' })),

  reference('target-encoding-out-of-fold', ['08', '13'],
    ['Explain why target encoding needs out-of-fold statistics to avoid leakage.'],
    ['target encoding', 'out of fold', 'leakage', 'category mean'],
    'Calculate each fold’s category mean from the other fold, with fixed sample identities and binary targets.',
    matrix('Out-of-fold target encoding excludes each held-out fold', ['Category', 'Target', 'Fold', 'OOF mean'], [
      row('r1', 'Sample 1', ['red', '1', 'A', '0.5']), row('r2', 'Sample 2', ['red', '1', 'A', '0.5']),
      row('r3', 'Sample 3', ['red', '1', 'B', '1']), row('r4', 'Sample 4', ['red', '0', 'B', '1']),
    ], { emphasis: { columns: [3] }, caption: 'Fold A uses B targets: $(1+0)/2=0.5$. Fold B uses A targets: $(1+1)/2=1$. Each held-out fold supplies no encoding labels.' })),

  reference('target-encoding-smoothing', ['08', '14'],
    ['How does smoothing pull a rare category’s target mean toward the global mean?'],
    ['target mean smoothing', 'target encoding smoothing', 'rare category', 'prior mean'],
    'Use (sum + alpha × global mean)/(count + alpha), with global mean 0.5 and alpha 2.',
    matrix('Smoothing a category target mean', ['Count', 'Target sum', 'Raw mean', 'Smoothed'], [
      row('rare', 'Rare category', ['1', '1', '1', '$2/3$']), row('common', 'Common category', ['8', '6', '0.75', '0.7']),
    ], { emphasis: { columns: [3] }, caption: '$\\mu=0.5$, $\\alpha=2$. Rare: $(1+2\\mu)/3=2/3$. Common: $(6+2\\mu)/10=0.7$. Fit statistics on training only.' })),

  reference('median-imputation-indicator', ['08', '13'],
    ['Show median imputation with a missingness indicator, fitted on training data only.'],
    ['imputation', 'median', 'missing indicator', 'missingness', 'fit transform'],
    'Preserve original missing values alongside imputed values and an explicit indicator.',
    matrix('Median imputation plus a missingness indicator', ['Raw age', 'Filled age', 'Was missing'], [
      row('r1', 'Sample 1', ['20', '20', '0']), row('r2', 'Sample 2', ['NA', '30', '1']), row('r3', 'Sample 3', ['40', '40', '0']),
    ], { states: [{ row: 'r2', column: 0, state: 'missing' }, { row: 'r2', column: 1, state: 'changed' }], caption: 'Observed training ages are 20 and 40, so the fitted median is 30. Reuse that fitted value when transforming new rows.' })),

  reference('token-count-matrix', ['08', '14'],
    ['Show how token counts turn short documents into a bag-of-words matrix.'],
    ['token count', 'bag of words', 'document term', 'tokenization'],
    'Display exact term counts for two tiny documents with a fixed vocabulary.',
    matrix('Documents become rows of token counts', ['red', 'blue', 'fox'], [
      row('d1', 'red red fox', ['2', '0', '1']), row('d2', 'blue fox', ['0', '1', '1']),
    ], { emphasis: { cells: [{ row: 'd1', column: 0 }] }, caption: 'Vocabulary order is red, blue, fox. Counts record multiplicity; word order is discarded in this bag-of-words representation.' })),

  reference('tf-idf-weight-matrix', ['08'],
    ['Work through a small TF-IDF example and explain why common terms receive lower weight.'],
    ['tf idf', 'tf-idf', 'inverse document frequency', 'term frequency'],
    'Use raw-count TF and unsmoothed natural-log IDF log(N/df), with no length normalization.',
    matrix('TF-IDF: exact weights before normalization', ['red', 'blue', 'fox'], [
      row('d1', 'red red fox', ['$2 \\ln 2$', '0', '0']), row('d2', 'blue fox', ['0', '$\\ln 2$', '0']),
      row('df', 'Document frequency', ['1', '1', '2']),
    ], { emphasis: { columns: [2] }, caption: String.raw`TF is the raw count. Use $\mathrm{IDF}=\ln(2/\mathrm{df})$ without smoothing or normalization. Fox is in both documents, so $\ln 1=0$.` })),

  reference('bayes-class-token-counts', ['14'],
    ['How does multinomial naive Bayes estimate class-conditional token probabilities?'],
    ['naive bayes', 'class conditional', 'token probability', 'multinomial'],
    'Compare class-specific counts and unsmoothed token likelihoods, making zero probabilities explicit.',
    matrix('Token likelihoods are estimated within each class', ['Spam count', '$P(t\\mid spam)$', 'Ham count', '$P(t\\mid ham)$'], [
      row('offer', 'offer', ['3', '$3/4$', '0', '$0/4$']), row('hello', 'hello', ['0', '$0/4$', '3', '$3/4$']), row('meeting', 'meeting', ['1', '$1/4$', '1', '$1/4$']),
    ], { emphasis: { cells: [{ row: 'offer', column: 3 }, { row: 'hello', column: 1 }] }, caption: 'Each class contains four tokens. An unseen token has zero unsmoothed likelihood, motivating additive smoothing.' })),

  reference('bayes-laplace-smoothing', ['14'],
    ['Show how Laplace smoothing prevents zero token probabilities in naive Bayes.'],
    ['laplace smoothing', 'add one', 'naive bayes smoothing', 'zero probability'],
    'Add one to each of three vocabulary counts, using denominator total count plus vocabulary size.',
    matrix('Laplace smoothing assigns mass to unseen tokens', ['Raw count', 'Smoothed P'], [
      row('offer', 'offer', ['3', '$4/6$']), row('hello', 'hello', ['0', '$1/6$']), row('meeting', 'meeting', ['0', '$1/6$']),
    ], { emphasis: { columns: [1] }, caption: 'With $N=3$ tokens, vocabulary size $V=3$, and $\\alpha=1$: $P=(count+1)/(3+3)$. The three probabilities sum to 1.' })),

  reference('bayes-log-score-table', ['14'],
    ['Show how naive Bayes combines a class prior with token likelihoods and normalizes the scores.'],
    ['bayes log score', 'posterior', 'class prior', 'log probability'],
    'Use exact unnormalized class scores for one token and their equivalent log expressions.',
    matrix('Bayes combines the prior with the likelihood', ['Prior', 'Token likelihood', 'Joint score', 'Posterior'], [
      row('spam', 'Spam', ['$1/2$', '$3/4$', '$3/8$', '$3/4$']), row('ham', 'Ham', ['$1/2$', '$1/4$', '$1/8$', '$1/4$']),
    ], { emphasis: { columns: [3] }, caption: 'For one token: $score=prior\\times likelihood$; normalize by $3/8+1/8=1/2$. In log space add log prior and log likelihood.' })),

  reference('lag-feature-matrix', ['15'],
    ['Show how lag features align past observations with each target without looking into the future.'],
    ['lag feature', 'lag matrix', 'time series feature', 'autoregressive', 'shift'],
    'Align y at t with y at t−1 and t−2 using stable time-row IDs and explicit unavailable entries.',
    matrix('Lag features only use earlier observations', ['$y_t$', 'Lag 1', 'Lag 2'], [
      row('t1', '$t=1$', ['10', 'NA', 'NA']), row('t2', '$t=2$', ['12', '10', 'NA']), row('t3', '$t=3$', ['9', '12', '10']), row('t4', '$t=4$', ['15', '9', '12']),
    ], { states: [{ row: 't1', column: 1, state: 'missing' }, { row: 't1', column: 2, state: 'missing' }, { row: 't2', column: 2, state: 'missing' }], emphasis: { rows: ['t4'] }, caption: 'At $t=4$ the target is 15 and the features are 9 and 12. The leading rows lack enough history for both lags.' })),

  reference('first-difference-matrix', ['15'],
    ['Work through first differencing and show which value is unavailable at the start.'],
    ['differencing', 'first difference', 'stationarity', 'delta'],
    'Keep time-row identities while displaying y(t)−y(t−1) exactly.',
    matrix('First differences retain the time index', ['$y_t$', '$y_{t-1}$', 'Difference'], [
      row('t1', '$t=1$', ['10', 'NA', 'NA']), row('t2', '$t=2$', ['12', '10', '2']), row('t3', '$t=3$', ['9', '12', '−3']), row('t4', '$t=4$', ['15', '9', '6']),
    ], { states: [{ row: 't1', column: 1, state: 'missing' }, { row: 't1', column: 2, state: 'missing' }], emphasis: { columns: [2] }, caption: '$\\Delta y_t=y_t-y_{t-1}$. The first difference is unavailable because no earlier observation is supplied.' })),

  reference('permutation-feature-matrix', ['18'],
    ['Explain permutation feature importance and show exactly what gets shuffled.'],
    ['permutation importance', 'shuffle feature', 'feature selection', 'fixed target'],
    'Permute one feature across rows while retaining targets and the multiset of feature values.',
    matrix('Permute one feature while keeping row targets fixed', ['Original age', 'Permuted age', 'Target'], [
      row('r1', 'Sample 1', ['20', '40', '0']), row('r2', 'Sample 2', ['30', '20', '1']), row('r3', 'Sample 3', ['40', '30', '1']),
    ], { states: [{ row: 'r1', column: 1, state: 'changed' }, { row: 'r2', column: 1, state: 'changed' }, { row: 'r3', column: 1, state: 'changed' }], caption: 'The age values remain $\\{20,30,40\\}$, but their association with each target changes. Compare the fixed model’s held-out score.' })),
];
