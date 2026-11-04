// Scene archetypes for /animation (owner decision 13 of 3 Nov 2026; plan section 8, AN-20). An archetype is DATA about which primitives a
// recurring scene shape uses and what its comparison states are. It carries the subject-specific sentences that used to hide inside the
// universal author rules (SIZE_RULES), so those stay general (decision 7). It is added only when a shape recurs, never per request, and it
// never selects or contains a canned scene: the author still writes every node, formula and program (the golden artifact is its one exemplar).
//
//   ARCHETYPES        frozen { <name>: { when, rules: string[], comparison } }
//   ARCHETYPE_NAMES   the names, for the planner tool's optional `archetype` enum
//   archetypeRules    (name) -> the text the author is given for that archetype, or null for a name that is not one
//
// Imported by the planner (animation-brief.js) and the author (animation-author.js); nothing here imports anything. The export shape above is final
// (AN-20 imports it as it is; a new archetype is a new key with the same three fields). The last two rules (arrow scale, camera) are an owner order of 4 Nov 2026 (C7, camera line revised the same day: 30 to 65 degrees, no azimuth), from Gate 2 C6 job 2 and C4 jobs 1, 2 and 4. animation-archetypes.test.js pins it.

const freeze = value => (Object.values(value).forEach(item => { if (item && typeof item === 'object') freeze(item); }), Object.freeze(value));

export const ARCHETYPES = freeze({
  loss_surface: {
    when: 'A marker moves over a continuous surface in repeated steps and leaves a path: a loss surface, an energy landscape, a terrain walk.',
    rules: [
      'The surface is one surface geometry: a grid of at least 24 by 24 heights computed from the formula the scene states, with 6 to 8 contours.',
      'The marker is one sphere node whose clampTo names the surface node. The program places it at its true position and height and clamps nothing: the renderer holds it at the top of the surface, and a number readout keeps the true value.',
      'The current path is a trail node and a kept earlier path is a ghost trail node; a frame sets their points. Never draw a path as separate marker nodes.',
      'A changing state is a text readout named status with the words running, paused, converged and diverged; not a number code, not a label.',
      'Arrows for the next step and the slope are children of the marker with offset equal to the marker radius, so each starts at its edge. A label on an arrow is a child of that arrow with anchor tip.',
      'The arrow scale factor keeps the largest typical step at the default rate under a quarter of the surface width.',
      'The camera looks from 30 to 65 degrees above and keeps the whole surface and the path in view.',
    ],
    comparison: 'Two settings of the main step-size control, one that converges and one that diverges. A new run keeps the old path as the ghost, so the learner sees both on the same surface. Diverged: the marker has left the drawn surface; the run stops.',
  },
});

export const ARCHETYPE_NAMES = Object.freeze(Object.keys(ARCHETYPES));

export function archetypeRules(name) {
  const archetype = Object.hasOwn(ARCHETYPES, name) ? ARCHETYPES[name] : null;
  return archetype ? [`Archetype ${name}. ${archetype.when}`, ...archetype.rules.map(rule => `- ${rule}`), `Comparison: ${archetype.comparison}`].join('\n') : null;
}
