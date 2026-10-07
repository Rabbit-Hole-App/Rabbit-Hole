// The level and learner-label words, a leaf module (no imports) so the web bundle can reach the hook validator's list without
// the journey agent. Level words are scrubbed, never fatal: a learner_note or adaptation_reason that says "mastered" is
// dropped and such a reason is blanked (agents/learn-journey.js pathOutput). A bare percentage is not a level word ("95%"
// can quote an answer).
// ponytail: a short word list; extend it when real plans slip a level past it.
export const LEVEL_WORDS = /\bmaster(?:ed|y)\b|\b(?:beginner|intermediate|advanced|expert)[ -](?:level|learner)\b/i;
// No mastery, fixed learner level or permanent ability label anywhere the learner reads: the one list for the repo
// (the journey corpus and the hook validator import it). pathOutput's scrub still reads LEVEL_WORDS alone.
export const LEARNER_LABELS = [LEVEL_WORDS, /\bmaster(ed|y)\b/i, /\b(?:novice|beginner|intermediate|advanced|expert) (?:student|learner|level)\b/i,
  /\byou(?:'re| are) (?:a |an )?(?:beginner|novice|intermediate|expert|natural)\b/i, /\byou(?:'re| are) (?:just )?(?:good|bad|great|terrible|hopeless) at\b/i,
  /\b(?:not an? (?:math|maths|science|coding|programming|history) person|naturally gifted|gifted learner|slow learner|fast learner|quick learner)\b/i];
