import { apronFabricStock, exhibitTankVolume, triviaTeamScore } from './gen-1-waterfall-data.js';

function waterfall({ opening, changes }, unit, title, caption) {
  return { spec: { version: 1, diagram: { kind: 'waterfall', title, unit, opening, changes, caption } } };
}

function closingEquation({ opening, changes, closing }) {
  const terms = changes.map(({ amount }) => amount < 0 ? String(amount) : `+${amount}`);
  return `$${opening}${terms.join('')}=${closing}$`;
}

const tankDepths = {
  overview: waterfall(exhibitTankVolume, 'L', 'Water in the exhibit tank',
    'A refill lifts the water volume. The drain removes part of that gain.'),
  standard: waterfall(exhibitTankVolume, 'L', 'Exhibit tank volume after cleaning',
    `The refill raises the volume to ${exhibitTankVolume.balances[1]} L before the drain.`),
  deep: waterfall(exhibitTankVolume, 'L', 'Reconcile the exhibit tank volume',
    `The change bars account for the final volume. ${closingEquation(exhibitTankVolume)} L.`),
};

const triviaDepths = {
  overview: waterfall({ ...triviaTeamScore, changes: triviaTeamScore.groupedChanges },
    'points', 'How the quiz team score changed',
    'Group the points from correct answers and the bonus. The penalty takes away more than they add.'),
  standard: waterfall(triviaTeamScore, 'points', 'Trivia score after the bonus and penalty',
    `Correct answers and the bonus bring the team to ${triviaTeamScore.balances[2]} points before the penalty.`),
  deep: waterfall(triviaTeamScore, 'points', 'Reconcile the trivia team score',
    `Compare the opening score and the closing score by summing each move. ${closingEquation(triviaTeamScore)} points.`),
};

const fabricDepths = {
  overview: waterfall(apronFabricStock, 'm', 'Fabric left after cutting aprons',
    'The new roll adds fabric. Cutting the aprons uses every metre.'),
  standard: waterfall(apronFabricStock, 'm', 'Apron workshop fabric stock',
    `The stock reaches ${apronFabricStock.balances[1]} m after delivery. The cutting step uses that entire length.`),
  deep: waterfall(apronFabricStock, 'm', 'Reconcile fabric stock for an apron batch',
    `The cutting step draws down the entire available stock. ${closingEquation(apronFabricStock)} m.`),
};

export const references = [
  {
    id: 'pool-exhibit-tank-refill',
    lessons: [],
    prompts: ['How much water is left in the exhibit tank after the refill and drain?'],
    keywords: ['exhibit tank refill and drain', 'exhibit tank water balance'],
    useWhen: 'Show how a refill and a drain reconcile the opening and final water volumes in an exhibit tank.',
    ...tankDepths.standard,
    depths: tankDepths,
  },
  {
    id: 'pool-trivia-team-score',
    lessons: [],
    prompts: ['How did the trivia team score fall after correct answers, a bonus, and a penalty?'],
    keywords: ['trivia team score fall', 'trivia score reconciliation', 'trivia team score after the penalty'],
    useWhen: 'Reconcile a trivia score after separate gains for correct answers and a bonus, then a larger penalty.',
    ...triviaDepths.standard,
    depths: triviaDepths,
  },
  {
    id: 'pool-apron-fabric-stock',
    lessons: [],
    prompts: ['How much apron fabric stock is left after one roll arrives and the aprons are cut?'],
    keywords: ['apron fabric stock', 'fabric for the apron batch'],
    useWhen: 'Use a waterfall to show an incoming roll and a cut batch taking the fabric inventory to zero.',
    ...fabricDepths.standard,
    depths: fabricDepths,
  },
];
