// Brief 38 spec section 7.5: one paragraph per depth; only the request's depth is sent. The wording started as the "What the scene shows" column of SCENE_TEACHING_GUIDE (agents/interact-design-author.js), approved by the owner;
// from here on it is this file's own. Depth names are the code's (chat-depth.js DEPTHS): brief, balanced, detailed.
export const DEPTH_PROMPTS = Object.freeze({
  brief: `## Depth

Depth: Brief. Build one clear comparison. Establish the starting state, show the important difference or change, and end with visible evidence for the answer. Use simple shapes and labels to make the relationship easy to read.`,
  balanced: `## Depth

Depth: Balanced. Make the mechanism observable. Specify the states or instants being compared, the scale, and the arrows or readouts that change. Keep the relevant invariant visible so the learner can distinguish what changes from what drives the change.`,
  detailed: `## Depth

Depth: Detailed. Make the reasoning inspectable. Choose measurements, diagrams, linked plots, or magnified views that expose the relationship. Specify units, reference points, and which quantities stay fixed. A controlled comparison can show what changes when an assumption or input changes.`,
});
export const DEPTH_LABELS = Object.freeze({ brief: 'Brief', balanced: 'Balanced', detailed: 'Detailed' });
