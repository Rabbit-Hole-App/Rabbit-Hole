// Home teach() (LP1 D4): does this teach request start a server-side learning journey, and what does its canvas call itself.
// Pure so node can test it; AgentBar.jsx is JSX and cannot be imported by the node tests.
import { journeyIntent, STARTS } from '../../../control-plane/src/learner-intent-journey.js';
import { titleFromQuestion } from '../start.js';

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The resolver's topic is lowercased and punctuation-normalized ("cnns"); the title is the learner's own spelling of it
// ("CNNs"): the topic's span in the raw text, matched at word bounds, falling back to the topic when it is not found.
const typed = (text, topic) => text.match(new RegExp(`(?<![\\p{L}\\p{N}])${escape(topic).replace(/ /g, '\\s+')}(?![\\p{L}\\p{N}])`, 'iu'))?.[0] ?? topic;

export const NEEDS_TOPIC = 'Tell me what you want to learn, for example: Teach me logistic regression, skip setup.';

// A fast start with no topic ("Skip setup and start") names nothing to learn: no journey, and needsTopic tells the bar to
// say so before it creates a canvas. Any other teach (a question re-taught from an answer's offer, "teach me" alone,
// "teach me this") keeps today's path. The canvas POST rejects a title over 120, so the title is capped like any question.
export function teachPlan(text) {
  const { kind, topic } = journeyIntent(text);
  const title = titleFromQuestion(topic ? capitalize(typed(text, topic)) : text);
  if (STARTS.has(kind) && !topic) return { journey: false, title, needsTopic: true };
  return { journey: STARTS.has(kind), title };
}

// A 502 from start means the journey row exists and only its planner failed (learn-journey.js run): the learner's words are
// saved, Learn shows the retry, and a resend would make a second canvas.
export const journeyStarted = (error) => error.status === 502 && !!error.data?.journey;

// The route answers with codes and planner text (learn-journey.js); the toast says what to do.
const MESSAGES = {
  topic_required: NEEDS_TOPIC,
  live_journey: 'You already have a learning path on this canvas. Open Learn to continue it.',
};
export const journeyMessage = (error) => (journeyStarted(error) ? 'Your journey started, but planning hit a problem. Open Learn to retry.' : MESSAGES[error.message] || error.message);
