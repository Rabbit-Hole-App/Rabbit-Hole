// builds plan.json for the GEN-1 R2 bench (BENCH-PLAN.md): 30 questions x 3 seeds x 2 arms on google-low, 10 of them again on fireworks-low, plus 12 roadmap cards x 2 arms. Offline: checks that the 15 'no-match' questions really have no topical reference.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const TREE = 'C:/s/gen1-r2-trees/before/packages/control-plane/src/';
const same1 = JSON.parse(fs.readFileSync('C:/s/film-evidence/docs/features/explain/checks/same-1/measure/plan.json', 'utf8'));
const trio = ['A', 'B', 'C'].map(tag => same1.items.find(i => i.set === 'same1' && i.tag === tag));
const nomatch = [
  'How does a recommender system decide which movie to show me next?', 'What does the temperature setting change when a chatbot writes text?', 'How does an autoencoder squeeze a photo and rebuild it?',
  'Why does a language model sometimes make up facts?', 'How do you decide how many clusters to use in k-means on customer data?', 'How does a spam filter learn from the emails I mark?',
  'What happens inside a convolution layer when it scans a handwritten digit?', 'How does reinforcement learning teach a robot to walk?', 'How does a text-to-image model turn a sentence into a picture?',
  'How does a fraud model handle a rare class of transactions?', 'How does a bakery decide how much dough to prepare for the next morning?', 'How does a thermostat keep a room near a set temperature?',
  'Why does a savings account with compound interest grow faster over time?', 'How does a vaccine teach the immune system to recognise a virus?', 'How does a city decide where to put a new bus stop?',
];
const ontopic = [
  'how do I compute the Gini impurity on both sides of a split and the information gain?', 'how does a random forest combine the predictions of its trees into one answer?',
  'compare impurity-based feature importance with permutation importance when one feature is random noise', 'How does voting combine several weak classifiers?', 'How does the transformer decoder avoid looking ahead at later words?',
];
const numeric = [
  'what does softmax do?', 'Explain quartiles, IQR fences, whiskers and outliers on one scale.', 'How do IQR fences flag outliers in a box plot? Use the data 3, 5, 6, 7, 8, 9, 11, 12, 40.',
  'Show two histograms comparing raw and log-transformed values.', 'What happens to a skewed distribution when we take logs?', 'what does a bootstrap sample of the training rows look like, and which rows repeat?',
  'Can you show the numbers when forward diffusion adds known noise to a latent?',
];
// offline no-match check on the BEFORE tree: a flow plan, no topical reference selected
const { prepareArtifactAuthorRequest } = await import(pathToFileURL(TREE + 'learn-artifact.js').href);
const { planFromAnswers } = await import(pathToFileURL(TREE + 'explanation-planner.js').href);
const ans = { visualType: { choice: 'diagram', confidence: 0.95, probabilities: { diagram: 0.95 } }, kind: { choice: 'flow', confidence: 0.9, probabilities: { flow: 0.9 } }, depthTreatment: { choice: 'mechanism', confidence: 0.8, probabilities: {} }, needsPlot: { noul: 0.05 }, isPhysical: { noul: 0.02 }, needsWorkedExample: { noul: 0.1 } };
const env = { SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: 'google-low', GEMINI_API_KEY: 'x', FIREWORKS_API_KEY: 'x', EXPLANATION_INTERACTIONS: 'true' };
const topical = q => { const log = console.log; console.log = () => {}; try { return prepareArtifactAuthorRequest(env, { command: 'explanation', args: q, depth: 'balanced', planned: true, plan: planFromAnswers(ans) }).diagramReferences.filter(r => !r.shape).map(r => r.id); } finally { console.log = log; } };
const matched = nomatch.map(q => [q, topical(q)]).filter(([, t]) => t.length);
const unmatched = ontopic.map(q => [q, topical(q)]).filter(([, t]) => !t.length);
console.log('no-match questions that DO match a library reference:', JSON.stringify(matched));
console.log('on-topic questions that match NOTHING:', JSON.stringify(unmatched));
const roadmap = [
  ['Softmax turns scores into probabilities', 'See why scores are exponentiated and normalised', 'A model produces raw scores called logits. Softmax exponentiates each score and divides by the sum so the results are positive and add to one. A larger score gets a larger share.'],
  ['What a decision tree split does', 'See how one question divides the training rows', 'A decision tree picks a question about one feature, such as is the age above 30. Rows that answer yes go to one branch and the rest to the other. The split is chosen to make each branch purer.'],
  ['How a bakery plans its dough', 'See how yesterday and the weekday set today\'s batch', 'A small bakery keeps a log of loaves sold each day. On Fridays it sells more than on Mondays, so the manager scales the next day batch from the average of the same weekday, then adds a small margin.'],
  ['Why compound interest grows faster', 'See interest earning interest year by year', 'A savings account adds interest each year to the balance. The next year interest is paid on the larger balance, so the growth each year gets bigger even though the rate stays the same.'],
  ['What a convolution filter does', 'See a small window sliding over an image', 'A convolution layer slides a small grid of weights over the image. At each position it multiplies the weights with the pixels under it and sums them, producing one number of a new feature map.'],
  ['How a thermostat holds a temperature', 'See the loop of measuring and switching', 'A thermostat measures the room temperature and compares it with the set point. If the room is colder it switches the heater on, if it is warmer it switches it off, and the cycle repeats.'],
  ['How a spam filter learns', 'See words and labels turned into a score', 'A spam filter counts how often each word appears in spam and in normal mail. A new message gets a score from the words it contains, and a score above a threshold is marked as spam.'],
  ['How vaccines teach the immune system', 'See exposure, memory and a faster second response', 'A vaccine shows the immune system a harmless piece of a virus. The body makes antibodies and keeps memory cells, so a later infection triggers a faster and stronger response.'],
  ['What overfitting looks like', 'See training error fall while validation error rises', 'As a model gets more flexible its training error keeps falling. Past some point the validation error starts to rise because the model memorises noise in the training rows.'],
  ['How a bus stop is placed', 'See demand, distance and cost compared', 'A city planner compares candidate stops by the number of riders within a five minute walk, the distance to the next stop, and the cost of building a shelter.'],
  ['How a language model picks a next word', 'See probabilities over words and a sample', 'A language model gives a probability to each possible next word. The temperature setting flattens or sharpens these probabilities before one word is sampled.'],
  ['How the elbow method picks clusters', 'See the error fall as clusters are added', 'K-means is run for several numbers of clusters. The total within-cluster distance falls as clusters are added, and the bend of the curve suggests a good number of clusters.'],
];
const items = []; let idx = 0;
const add = (o) => items.push({ idx: idx++, depth: 'balanced', profile: 'google-low', ...o });
const q = [...trio.map((t, i) => ({ set: 'same1', tag: 'ABC'[i], prompt: t.prompt })), ...nomatch.map((p, i) => ({ set: 'nomatch', tag: `N${i + 1}`, prompt: p })), ...ontopic.map((p, i) => ({ set: 'ontopic', tag: `O${i + 1}`, prompt: p })), ...numeric.map((p, i) => ({ set: 'numeric', tag: `U${i + 1}`, prompt: p }))];
const fw = new Set(['same1', 'nomatch:N1', 'nomatch:N2', 'nomatch:N11', 'nomatch:N12', 'numeric:U1', 'numeric:U2', 'numeric:U3']); // 3 + 4 + 3 = 10 questions on fireworks-low
const isFw = x => x.set === 'same1' || fw.has(`${x.set}:${x.tag}`);
for (const rep of [1, 2, 3]) {
  for (const x of q) add({ ...x, rep });
  if (rep === 1) roadmap.forEach(([stepTitle, stepGoal, passageText], i) => add({ set: 'roadmap', tag: `R${i + 1}`, rep: 1, prompt: stepTitle, roadmap: { stepTitle, stepGoal, passageText } }));
  for (const x of q.filter(isFw)) add({ ...x, rep, profile: 'fireworks-low' });
}
fs.writeFileSync('C:/s/sprint2-evidence/gen1-r2-bench/plan.json', JSON.stringify({ meta: { questions: q.length, roadmap: roadmap.length, items: items.length, runs: items.length * 2 }, items }, null, 1));
const sets = {}; for (const i of items) sets[`${i.set}/${i.profile}`] = (sets[`${i.set}/${i.profile}`] || 0) + 1;
console.log('items', items.length, 'runs', items.length * 2, JSON.stringify(sets));
