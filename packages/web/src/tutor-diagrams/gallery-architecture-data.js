// Small original examples shared by all depths of the architecture chapter.
const stream = [2, -1];
const attention = [1, 0.5];
const experts = [0.25, 2];
const scores = [0.9, 0.1, 0.7, 0.3];
const prefix = 1;
const core = 3;
const passes = 2;
const tail = 1;

export const architectureToy = {
  hybrid: { rounds: 3, expertPool: 5, routed: 2, shared: 1 },
  parallel: {
    stream, attention, experts,
    result: stream.map((value, i) => value + attention[i] + experts[i]),
  },
  index: {
    scores,
    shortlist: scores.map((score, i) => ({ position: i + 1, score }))
      .sort((a, b) => b.score - a.score).slice(0, 2).map(({ position }) => position),
  },
  sharedCore: { prefix, core, passes, tail, unique: prefix + core + tail, executions: prefix + core * passes + tail },
};
