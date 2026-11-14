// The light half of the vertical-throw family (brief 21): pure data, no imports, so plan validation in the browser can know the template roles and words without loading the generator, the
// templates or the brief expander. The full family module (interact-family-vertical-throw.js) spreads this into its descriptor.
// What the registry derives from this family (interact-family-registry.js): each template's roles and words (the words each template draws: owner brief 11, the template holds no wording; the plan's
// scene.words does; each entry is [path, maxCharacters, what it is]: the path is where the template reads it (nested, for example "where.top"), the plan stores it flat under the key with the dots
// turned to underscores ("where_top"); limits are the sdk helpers' own: a lane heading is at most 24 characters, a lane state line 32, a callout line 40 (sdk-figures.js), a letter beside an arrow 4).
// The roles each template reads: `slots` on a plan's scene maps each role to a quantity id.
//   one-body : slots = { height, velocity, acceleration }                                   one moving body
//   two-lane : slots = { <laneName>: { height, velocity, acceleration }, <laneName>: {...} } two lanes, one set of roles per lane (the plan's own lane names, for example toss and drop); exactly two lanes
//   body-plot: slots = { height, velocity, acceleration, force, plotted }                     one body with a velocity-time plot; `plotted` is the quantity the plot draws
const WORDS = {
  'one-body': [['lane', 24, 'heading of the lane'], ['launch', 40, 'label of the launch-height guide'], ['gravity.pulls', 40, 'callout line while gravity pulls the body down'], ['gravity.none', 40, 'callout line when nothing pulls'],
    ['motion.up', 40, 'callout line while the body moves up'], ['motion.top', 40, 'callout line while the body is still for an instant at the top'], ['motion.down', 40, 'callout line while the body moves down'],
    ['where.launch', 32, 'lane state at launch'], ['where.top', 32, 'lane state at the top'], ['where.end', 32, 'lane state when back at the launch height'], ['where.up', 32, 'lane state while rising'], ['where.down', 32, 'lane state while falling'],
    ['readout.motion', 24, 'label of the Motion state readout'], ['readout.gravity', 24, 'label of the Gravity state readout']],
  'two-lane': [['lane.first', 24, 'heading of the first lane (the toss)'], ['lane.second', 24, 'heading of the second lane (the released ball)'],
    ['first.where.launch', 32, 'first lane state at launch'], ['first.where.top', 32, 'first lane state at the top'], ['first.where.end', 32, 'first lane state when back at the launch height'], ['first.where.up', 32, 'first lane state while rising'], ['first.where.down', 32, 'first lane state while falling'],
    ['second.where.held', 32, 'second lane state while the gate holds the ball'], ['second.where.released', 32, 'second lane state at the instant of release'], ['second.where.end', 32, 'second lane state when back at the launch height'], ['second.where.falling', 32, 'second lane state while both fall together'],
    ['launch', 40, 'label of the launch-height guide'], ['axis.label', 40, 'title of the height axis'], ['v', 4, 'letter beside a velocity arrow'], ['a', 4, 'letter beside an acceleration arrow']],
  'body-plot': [['lane', 24, 'heading of the lane'], ['launch', 40, 'label of the launch-height guide'], ['axis.label', 40, 'title of the height axis'], ['v', 4, 'letter beside the velocity arrow'], ['a', 4, 'letter beside the acceleration arrow'], ['force', 4, 'letter of the force in its callout line'],
    ['where.launch', 32, 'lane state at launch'], ['where.top', 32, 'lane state at the top'], ['where.end', 32, 'lane state when back at the launch height'], ['where.up', 32, 'lane state while rising'], ['where.down', 32, 'lane state while falling'],
    ['plot.heading', 40, 'heading of the plot'], ['plot.yLabel', 40, 'title of the plot value axis'], ['plot.line', 40, 'legend label of the plotted line'], ['plot.now', 40, 'legend label of the moving dot'], ['plot.slope', 24, 'start of the slope note (a number follows it)'], ['plot.eq', 24, 'start of the equation beside the heading (numbers follow it)'],
    ['readout.motion', 24, 'label of the Motion state readout']],
};
const templateData = Object.freeze({
  'one-body': Object.freeze({ lanes: 0, roles: Object.freeze(['height', 'velocity', 'acceleration']), words: WORDS['one-body'] }),
  'two-lane': Object.freeze({ lanes: 2, roles: Object.freeze(['height', 'velocity', 'acceleration']), words: WORDS['two-lane'], callouts: slots => Object.values(slots).flatMap(lane => [lane.velocity, lane.acceleration]) }),
  'body-plot': Object.freeze({ lanes: 0, roles: Object.freeze(['height', 'velocity', 'acceleration', 'force', 'plotted']), words: WORDS['body-plot'], callouts: slots => [slots.velocity, slots.acceleration, slots.force] }),
});
const pickCriterion = 'One object launched straight up under constant gravity, slowing, stopping for an instant at the top and falling back; no air resistance, no angle, no second force.';
export const verticalThrowData = Object.freeze({ id: 'vertical-throw', templates: Object.freeze(['one-body', 'two-lane', 'body-plot']), templateData, pickCriterion });
