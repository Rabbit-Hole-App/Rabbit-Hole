import { SOUNDS } from './scene-vocab.js';

// Sound is a layer outside the evaluator: getSceneState never reads `sound`,
// so a scene means the same thing whether or not the browser can play audio.
// These three tiers rank sounds by how much a learner should take away from
// the moment, so when several land together the one worth hearing wins
// rather than a coin flip or whichever happened to be authored last.

// Outcome: the thing the learner was watching for - the verdict, the reveal,
// the computed result landing.
const OUTCOME = ['success', 'incorrect', 'reveal', 'compute'];
// Structural: the diagram's shape changing - an edge forming or breaking, a
// value splitting or joining, a state flipping, something settling in place.
const STRUCTURAL = ['connect', 'split', 'merge', 'toggle_on', 'toggle_off', 'select', 'drop', 'snap'];
// Incidental: ambient texture under everything else - a per-step tick, a
// small appear, a passing whoosh. Never worth more than the moment's real
// news when something structural or conclusive lands at the same instant.
const INCIDENTAL = ['soft_pop', 'soft_whoosh', 'tick'];

const RANK = new Map();
[[OUTCOME, 3], [STRUCTURAL, 2], [INCIDENTAL, 1]].forEach(([names, rank]) => names.forEach(name => RANK.set(name, rank)));
// A sound added to SOUNDS without a tier here would silently rank as 0 -
// always losing a coalesce - which is exactly the silent failure this module
// exists to prevent.
if (RANK.size !== SOUNDS.length) throw new Error('scene-sound.js: every SOUNDS entry needs exactly one tier');

const tierOf = sound => RANK.get(sound) ?? 0;

// Which timeline events did playback pass over moving from `from` to `to`?
// Backward and stationary moves cross nothing - only forward progress plays a
// sound. `options.start` covers the one moment that is not a crossing: the
// instant playback begins, which must still sound an event sitting at `from`.
export function crossed(timeline, from, to, options = {}) {
  if (to < from) return [];
  return timeline.filter(event => (options.start ? event.at >= from : event.at > from) && event.at <= to);
}

export const COALESCE_WINDOW = 0.08;

// Group events that land within `window` of each other and keep only the
// most important one per group. Clustering is greedy from the earliest
// ungrouped event, not a fixed grid: a grid would split two events a few
// milliseconds apart whenever a grid line happened to fall between them.
export function coalesce(events, window = COALESCE_WINDOW) {
  const sorted = [...events].sort((a, b) => a.at - b.at);
  const buckets = [];
  for (const event of sorted) {
    const bucket = buckets[buckets.length - 1];
    if (bucket && event.at - bucket[0].at <= window) bucket.push(event);
    else buckets.push([event]);
  }
  return buckets.map(bucket => bucket.reduce((best, event) => {
    const rank = tierOf(event.sound);
    const bestRank = tierOf(best.sound);
    if (rank > bestRank) return event;
    if (rank === bestRank && event.at < best.at) return event;
    return best;
  }));
}

// The only impure function here, and the only one not unit-tested: real
// playback needs a live AudioContext, which node:test has none of. Each sound
// is a short oscillator sweep - no audio files, so no dependency and nothing
// to load before a scene can play.
let ctx = null;
const RECIPES = {
  soft_pop: { type: 'sine', freq: 660, duration: 0.06 },
  soft_whoosh: { type: 'sine', freq: 220, duration: 0.18, sweep: 90 },
  connect: { type: 'triangle', freq: 440, duration: 0.12, sweep: 660 },
  split: { type: 'triangle', freq: 520, duration: 0.1, sweep: 260 },
  merge: { type: 'triangle', freq: 260, duration: 0.14, sweep: 440 },
  tick: { type: 'square', freq: 900, duration: 0.03 },
  select: { type: 'sine', freq: 720, duration: 0.05 },
  toggle_on: { type: 'square', freq: 500, duration: 0.06, sweep: 700 },
  toggle_off: { type: 'square', freq: 500, duration: 0.06, sweep: 320 },
  reveal: { type: 'sine', freq: 400, duration: 0.2, sweep: 800 },
  success: { type: 'sine', freq: 523, duration: 0.22, sweep: 784 },
  incorrect: { type: 'sawtooth', freq: 220, duration: 0.18, sweep: 140 },
  compute: { type: 'square', freq: 330, duration: 0.1 },
  drop: { type: 'sine', freq: 300, duration: 0.12, sweep: 120 },
  snap: { type: 'square', freq: 1000, duration: 0.04 },
};

export function play(name, volume = 1) {
  const recipe = RECIPES[name];
  if (!recipe) return; // an unknown name is a schema bug elsewhere, not a reason to break playback
  // Created lazily, on the first sound of a playthrough, rather than at import
  // time - Chrome and Safari both refuse to run an AudioContext until a user
  // gesture reaches it, and the caller only ever reaches this from the rAF
  // loop that starts after the learner presses Play.
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = recipe.type;
  osc.frequency.setValueAtTime(recipe.freq, now);
  if (recipe.sweep) osc.frequency.exponentialRampToValueAtTime(recipe.sweep, now + recipe.duration);
  gain.gain.setValueAtTime(Math.max(0.001, 0.12 * volume), now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + recipe.duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + recipe.duration + 0.02);
}
