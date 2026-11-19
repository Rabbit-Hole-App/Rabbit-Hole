// The codebase index's layer names and its tool definition (codebase-index-spec.md sections 2 and 3), kept apart from learn-index.js so the research loop can list the tool without loading the
// builder (learn-index.js imports the research loop: this leaf breaks the cycle). LAYERS grows with the layers that are built (overview now; topic and readme in their own steps), and the
// tool offers exactly those.
export const LAYERS = ['overview'];
export const CODEBASE_INDEX_TOOL = { name: 'codebase_index', description: 'What this codebase offers (overview), what a topic involves and where (topic), or how far the README matches the code (readme). Stored; a repeat call costs nothing.', input_schema: {
  type: 'object', additionalProperties: false, required: ['layer'], properties: {
    layer: { type: 'string', enum: LAYERS },
    topic: { type: 'string', maxLength: 120, description: "For layer topic: the topic id from the overview, or the learner's own words." },
  } } };
