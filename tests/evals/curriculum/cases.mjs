// Synthetic, pre-labelled review fixtures. Expected judgments NEVER enter model input.
const lesson = (title, ...topics) => ({ title, topics });
const module = (title, ...lessons) => ({ title, lessons });
const plan = (title, modules) => ({ title, modules, prerequisites: ['Basic arithmetic and reading a table'],
  scopeNotes: [], duration: { fit: 'fits', explanation: 'A narrow qualitative introduction within the requested time; no mastery or formal proof is promised.' }, ownerQuestions: [] });
const input = (name, evidence, goal, knowledge = 'New to the topic; basic arithmetic', duration = '20 minutes') => ({
  app: { name, evidence }, brief: { audience: 'People with the stated prior knowledge', goal, knowledge, duration },
  clarification: 'Propose curriculum scope, not lesson scripts. No unspecified topic is mandatory.', references: [],
});

const tableInput = input('table-report', 'This illustrative report app takes a provided table of transactions. Users select a category field and press Run; results show counts and sums grouped by category. No SQL is typed. Inputs and a working table are already provisioned.',
  'Run a grouped report and explain what its counts and sums mean');
const tablePlan = plan('Understanding grouped reports', [
  module('Data and grouping', lesson('Rows and categories', 'A row as one recorded transaction', 'A category as a value shared by some rows'),
    lesson('Counts and sums', 'Grouping rows with the same category', 'Counting rows versus adding their amounts')),
  module('Using the report', lesson('Run and interpret', 'Selecting the provided category field and pressing Run', 'Reading the group count and amount sum; a missing category may have no recorded rows')),
]);

const outlierInput = input('quartile-flags', 'This illustrative app flags values outside Q1 minus 1.5 IQR and Q3 plus 1.5 IQR. Q1 and Q3 are the lower and upper quartiles; IQR = Q3 - Q1. The app accepts a supplied list and returns flagged values.',
  'Explain the quartile flagging rule and interpret the flagged values', 'Basic arithmetic, no statistics');
const outlierPlan = plan('Understanding quartile flags', [
  module('Statistical foundations', lesson('Ordered data and quartiles', 'Sorting observations', 'Quartiles as positions splitting the ordered distribution'),
    lesson('Spread and fences', 'IQR as upper quartile minus lower quartile', 'Lower and upper fences; an outlier flag is not proof of a data error')),
  module('Using flags', lesson('Applying the rule', 'Comparing observations against both fences', 'Interpreting flagged values in their data context')),
]);

const cacheInput = input('cached-status', 'This illustrative dashboard shows a cached status report with a last-fetched timestamp. Refresh requests a new report. A TTL sets how long the saved response may be reused. Refresh does not make the upstream data more accurate. Operators do not configure infrastructure.',
  'Decide whether a displayed report is stale and refresh it when needed', 'Comfort reading dashboards; no systems background', '10 minutes');
const cachePlan = plan('Reading a cached status report', [
  module('Freshness and reuse', lesson('What the timestamp means', 'A saved response versus current upstream state', 'Elapsed time since the report was fetched')),
  module('Acting on freshness', lesson('Refresh and TTL', 'TTL as an allowed reuse interval', 'Refresh requests new data but does not establish its correctness')),
]);

const imageInput = input('image-viewer', 'This illustrative image viewer accepts arbitrary positive image width and height. It renders pixels without any automatic resizing or fixed-size requirement. Users can optionally request an explicit resize; thumbnails are visual copies, not replacements for the original file.',
  'Explain image dimensions and distinguish the original image from a resized view');
const imagePlan = plan('Image dimensions and representations', [
  module('Image grids', lesson('Width and height', 'Pixels arranged in rows and columns', 'Width and height as numbers of columns and rows')),
  module('Viewing and resizing', lesson('Original and resized copies', 'Optional resizing changes dimensions of a displayed copy', 'Original file remains available; this viewer accepts varying dimensions')),
]);

export const CASES = [];
const add = (id, split, originalInput, originalPlan, expected, change = () => {}) => {
  const c = { id, split, input: structuredClone(originalInput), candidate: structuredClone(originalPlan), expected };
  change(c); CASES.push(c);
};
const defect = (criterion, description) => ({ verdict: 'revise', criterion, description });
const acceptable = description => ({ verdict: 'ready', description });

add('C01', 'development', outlierInput, outlierPlan,
  defect('prerequisite_order', 'A beginner is asked to reason with IQR fences before quartiles and IQR are introduced.'), c => {
    const foundations = c.candidate.modules[0].lessons;
    c.candidate.modules = [module('Apply the algorithm', c.candidate.modules[1].lessons[0]), module('Definitions afterward', ...foundations)];
  });
add('C02', 'development', imageInput, imagePlan,
  defect('accuracy_evidence', 'Fixed-size requirement contradicts explicit support for arbitrary dimensions in supplied app evidence.'), c => {
    c.candidate.modules[1].lessons[0].topics[1] = 'The viewer requires every image to be resized to 640 by 640 pixels before it can display it';
  });
add('C03', 'development', cacheInput, cachePlan,
  defect('scope_depth', 'Mandatory CPU architecture topics displace a substantial part of a short dashboard-operator orientation without serving the goal.'), c => {
    c.candidate.modules.splice(1, 0, module('Required processor foundations',
      lesson('CPU cache organization', 'Cache-line associativity and replacement strategies', 'Cache coherency protocols and false sharing')));
  });
add('C04', 'development', tableInput, tablePlan,
  defect('subject_coverage', 'The course omits the documented run action despite the explicit goal of running the report.'), c => {
    c.candidate.modules[1] = module('Further aggregation concepts', lesson('Interpreting groups', 'A count as the number of rows in a category', 'An amount sum as a total over recorded rows'));
  });
add('C05', 'development', tableInput, tablePlan,
  acceptable('Experienced analysts need only the narrow app orientation, not repeated introductory database theory.'), c => {
    c.input.brief.knowledge = 'Experienced analysts who know grouping, counts and sums'; c.input.brief.duration = '10 minutes';
    c.candidate.prerequisites = ['Grouping, counts and sums'];
    c.candidate.modules = [module('Inputs and execution', lesson('Running the provided report', 'Selecting the category field', 'Pressing Run with the supplied transaction table')),
      module('Reading the output', lesson('Reported aggregates', 'Reading category counts and amount sums', 'A missing category versus a recorded zero total'))];
  });
add('C06', 'development', outlierInput, outlierPlan,
  acceptable('Explicitly flagging a time/depth choice is ready for owner review, not a reason to invent a missing-topic rejection.'), c => {
    c.input.brief.duration = '5 minutes'; c.input.brief.goal = 'Explain the quartile rule in detail and practice calculating and interpreting it';
    c.candidate.duration = { fit: 'needs-more-time', explanation: 'Five minutes permits only an overview. Calculation practice and detailed interpretation need more time; the owner must choose depth.' };
    c.candidate.ownerQuestions = ['Extend time for calculation practice, or approve a five-minute overview without independent calculation proficiency?'];
  });

// Held out until the general rubric is frozen after reviewing development results.
add('H01', 'holdout', outlierInput, outlierPlan,
  defect('time_realism', 'Promises detailed calculation practice and independent proficiency within five minutes without acknowledging the conflict.'), c => {
    c.input.brief.duration = '5 minutes'; c.input.brief.goal = 'Explain the quartile rule in detail and practice calculating and interpreting it';
    c.candidate.duration = { fit: 'fits', explanation: 'Five minutes fully covers the foundations, detailed calculations, multiple independent practice problems and proficiency at interpreting the rule.' };
  });
add('H02', 'holdout', imageInput, imagePlan,
  defect('accuracy_evidence', 'Infers system-wide deletion of original pixels from an export that omits those pixels.'), c => {
    c.input.app.evidence += ' A separate metadata JSON contains width and height only; original pixels remain in the source file and visible in the viewer.';
    c.candidate.modules[1].lessons[0].topics[1] = 'Because metadata JSON contains only dimensions, the original pixel data is no longer available anywhere in this app';
  });
add('H03', 'holdout', cacheInput, cachePlan,
  acceptable('A qualitative operator course can omit implementation internals while explaining freshness, TTL and refresh accurately.'));
add('H04', 'holdout', imageInput, imagePlan,
  acceptable('The curriculum correctly scopes representations and directly matches the documented variable-dimension behavior.'));

export function evaluatorInput(c) {
  // Deliberately exclude case ID, split, expected verdict, and defect labels.
  return { input: structuredClone(c.input), candidate: structuredClone(c.candidate), reviewContext: { iteration: 1, previousFindings: [] } };
}
