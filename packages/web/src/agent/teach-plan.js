// Home teach() (LP1 D4): does this teach request start a server-side learning journey, and what does its canvas call itself.
// Pure so node can test it; AgentBar.jsx is JSX and cannot be imported by the node tests.
import { journeyIntent } from '../../../control-plane/src/learner-intent-journey.js';
import { titleFromQuestion } from '../start.js';

const JOURNEY = new Set(['learning_journey', 'focused_skill', 'quick_overview', 'fast_start']);
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// A fast_start with no topic ("Skip setup and start") is still a journey: the server answers topic_required and the bar
// says so. Any other teach (a question re-taught from an answer's offer, "teach me" alone, "teach me this") keeps today's path.
// ponytail: the title is the resolver's normalized topic, so "teach me CNNs" titles "Cnns"; carry the typed casing if it shows.
export function teachPlan(text) {
  const { kind, topic } = journeyIntent(text);
  return { journey: JOURNEY.has(kind), title: topic ? capitalize(topic) : titleFromQuestion(text) };
}

// The route answers with codes (learn-journey.js); the toast says what to do.
const MESSAGES = {
  topic_required: 'Say what you want to learn, for example: teach me logistic regression.',
  live_journey: 'You already have a learning path on this canvas. Open Learn to continue it.',
};
export const journeyMessage = (error) => MESSAGES[error.message] || error.message;
