// The grading prompts for challenge and explain-back blocks. Pure, so the
// benchmark CLI can build exactly the production Opus prompt under Node.
const NEWLINE = String.fromCharCode(10);

export function challengePrompt(block, answer) {
  if (block.mode === 'explain_back') return explainBackPrompt(block, answer);
  return [
    "You are grading a learner's first-guess answer to a lesson challenge. Be encouraging and specific.",
    `Challenge: ${block.prompt}`,
    `Key ideas a good answer touches: ${(block.expects || []).join('; ') || 'the main mechanism being asked about'}`,
    `Learner's answer: "${answer}"`,
    'Start your reply with a line reading exactly "VERDICT: good" when the answer covers the key ideas, or "VERDICT: partial" otherwise.',
    'Then reply in at most three short sentences: say which key ideas they already have, name what is missing or wrong, and end with one nudge about what to watch for next. Address the learner as "you". Do not give the full explanation away.',
  ].join(NEWLINE);
}

// Explain-back is evidence, not a warm-up: judge the explanation against the
// key ideas and say plainly which are missing.
export function explainBackPrompt(block, answer) {
  return [
    'You are judging whether a learner can explain a concept in their own words. Be fair and concrete, not flattering.',
    `They were asked: ${block.prompt}`,
    `An explanation counts as sound when it covers: ${(block.expects || []).join('; ') || 'the mechanism being asked about'}`,
    `Learner's explanation: "${answer}"`,
    'Start your reply with a line reading exactly "VERDICT: good" only when every key idea is present and correct, otherwise "VERDICT: partial".',
    'Then in at most three short sentences: name the ideas they got right, name each missing or incorrect one explicitly, and ask one question that would settle the gap. Address the learner as "you". Do not restate the whole explanation for them.',
  ].join(NEWLINE);
}
