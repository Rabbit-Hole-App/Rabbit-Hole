import { RASTER_CAPABILITY } from './stamps.js';

// Hand-authored tabular example with deterministic transitions.
export const qlearningFixture = {
  id: 'fixture-ai-qlearning',
  manifest: {
    title: 'How Q-learning learns from each move',
    summary: 'Take a move and see how its reward and the best next Q value change the estimate for that move. Arrows mark the best moves when values differ. The goal and pit end an episode; a wall keeps you in place and costs 0.04. New episode keeps what you learned. Changing any setting clears it.',
    description: 'A 3-by-3 grid with a marked agent, a pit in the center, a goal at bottom right, and arrows for greedy moves. The right side shows the current Q values, episode return and last update.',
    assumptions: ['All Q values start at zero. A move other than entering the goal or pit costs 0.04.', 'The pit pays −1. Goal and pit are terminal and contribute no future value.', 'Delta is the target minus the old Q value. The update adds alpha times delta.'],
    capabilities: [RASTER_CAPABILITY, 'number_inputs'],
    inputs: [
      { type: 'number', id: 'alpha', label: 'Learning rate α', default: .5, min: .1, max: 1, step: .1 },
      { type: 'number', id: 'gamma', label: 'Discount γ', default: .9, min: 0, max: 1, step: .1 },
      { type: 'number', id: 'goalReward', label: 'Goal reward', default: 1, min: .5, max: 2, step: .1 },
    ],
    readouts: [],
    viewport: { width: 654, height: 385 },
    actions: [
      { id: 'up', label: 'Up' },
      { id: 'right', label: 'Right' },
      { id: 'down', label: 'Down' },
      { id: 'left', label: 'Left' },
      { id: 'newEpisode', label: 'New episode' },
    ],
    targets: [],
  },
  source: `
const pit = 4, goal = 8;
const actions = ['up', 'right', 'down', 'left'];
const labels = ['Up', 'Right', 'Down', 'Left'];
const directions = [[0,-1], [1,0], [0,1], [-1,0]];
const terminal = s => s === pit || s === goal;
const newEpisode = q => ({ position: 0, q, episodeReturn: 0, last: null });

export function initialState() {
  return newEpisode(Array.from({ length: 9 }, () => [0, 0, 0, 0]));
}

export function reduce({ state, event, inputs }) {
  if (event.type === 'input') return initialState();
  if (event.type !== 'action') return state;
  if (event.action === 'newEpisode') return newEpisode(state.q);
  const s = state.position, a = actions.indexOf(event.action);
  if (terminal(s) || a < 0) return state;

  const [dx, dy] = directions[a];
  const x = s % 3 + dx, y = Math.floor(s / 3) + dy;
  const wall = x < 0 || x > 2 || y < 0 || y > 2;
  const next = wall ? s : y * 3 + x;
  const reward = next === goal ? inputs.goalReward : next === pit ? -1 : -.04;
  const target = reward + (terminal(next) ? 0 : inputs.gamma * Math.max(...state.q[next]));
  const old = state.q[s][a], delta = target - old;
  const value = old + inputs.alpha * delta;
  const q = state.q.map((row, k) => k === s ? row.map((v, i) => i === a ? value : v) : row);
  return {
    position: next, q, episodeReturn: state.episodeReturn + reward,
    last: { from: s, action: a, to: next, wall, reward, target, delta, old, value },
  };
}

const cellX = s => 18 + 104 * (s % 3);
const cellY = s => 44 + 104 * Math.floor(s / 3);
const format = value => sdk.format(value, 3);

export function evaluate({ state, inputs }) {
  const { position, q, episodeReturn, last } = state;
  const objects = [
    sdk.text('world-heading', 18, 25, 'Gridworld · greedy arrows'),
    sdk.text('q-heading', 348, 25, 'Current Q values · state ' + position),
    sdk.line('separator', 332, 16, 332, 362, { opacity: .5 }),
  ];

  for (let s = 0; s < q.length; s++) {
    const x = cellX(s), y = cellY(s), cx = x + 49, cy = y + 55;
    const active = s === position;
    const role = active ? 'learner' : s === pit ? 'warning' : s === goal ? 'success' : 'neutral';
    objects.push(sdk.box('cell-' + s, x, y, 98, 98, { role }));
    const label = s === 0 ? '0 · Start' : s === pit ? '4 · Pit' : s === goal ? '8 · Goal' : String(s);
    objects.push(sdk.text('label-' + s, cx, y + 17, label, { align: 'middle' }));
    if (terminal(s)) {
      const reward = s === pit ? '−1' : '+' + sdk.format(inputs.goalReward, 1);
      objects.push(sdk.text('reward-' + s, cx, y + 83, reward, { align: 'middle' }));
    }
    const best = Math.max(...q[s]);
    if (!terminal(s) && best !== Math.min(...q[s])) {
      for (let a = 0; a < directions.length; a++) {
        if (q[s][a] !== best) continue;
        const [dx, dy] = directions[a];
        objects.push(sdk.arrow('policy-' + s + '-' + a, cx + dx * 13, cy + dy * 13, cx + dx * 27, cy + dy * 27, { role: 'prediction' }));
      }
    }
    if (active) objects.push(sdk.circle('agent', cx - 9, cy - 9, 18, { role: 'observed', text: 'A' }));
  }

  const current = q[position];
  for (let a = 0; a < actions.length; a++) {
    const x = 348 + 144 * (a % 2), y = 44 + 42 * Math.floor(a / 2);
    objects.push(sdk.box('q-' + actions[a], x, y, 134, 34, { text: labels[a] + '  ' + format(current[a]) }));
  }
  const status = position === goal ? 'Goal reached' : position === pit ? 'Pit reached' : 'In progress';
  objects.push(
    sdk.text('episode-status', 348, 146, status, { role: position === goal ? 'success' : position === pit ? 'warning' : 'neutral' }),
    sdk.text('episode-return', 348, 170, 'Episode return: ' + format(episodeReturn)),
    sdk.line('last-divider', 348, 187, 626, 187, { opacity: .5 }),
    sdk.text('last-heading', 348, 209, 'Last update'),
  );
  if (last) {
    const move = last.from + ' → ' + last.to + ' · ' + labels[last.action] + (last.wall ? ' · wall' : '');
    objects.push(
      sdk.text('last-move', 348, 234, move),
      sdk.text('last-reward', 348, 258, 'Reward: ' + format(last.reward)),
      sdk.text('last-target', 348, 282, 'Target: ' + format(last.target)),
      sdk.text('last-delta', 348, 306, 'Target − old Q: ' + format(last.delta)),
      sdk.text('last-q', 348, 330, 'Q: ' + format(last.old) + ' → ' + format(last.value), { role: 'learner' }),
    );
  } else {
    objects.push(sdk.text('last-move', 348, 234, 'No move yet'));
  }

  const quantities = {
    position, episodeReturn, qUp: current[0], qRight: current[1], qDown: current[2], qLeft: current[3],
    ...(last ? { reward: last.reward, target: last.target, delta: last.delta, updatedQ: last.value } : {}),
  };
  return { frame: sdk.frame(objects, { width: 654, height: 385 }), quantities };
}`,
  events: ['right', 'right', 'down', 'down', 'newEpisode', 'right', 'right', 'down'].map(action => ({ type: 'action', action })),
};
