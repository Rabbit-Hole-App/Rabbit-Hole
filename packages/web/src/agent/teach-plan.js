// Home teach(): what the destination canvas calls itself. The title is the learner's own sentence, whitespace collapsed and
// cut to the 80 characters titleFromQuestion allows (the canvas POST rejects over 120): no model call and no topic reading.
// Tutor cleanup P4 removed the journey intent that used to start a server-side learning path from here. Pure so node can
// test it; AgentBar.jsx is JSX and cannot be imported by the node tests.
import { titleFromQuestion } from '../start.js';

export const teachPlan = (text) => ({ title: titleFromQuestion(text) });
