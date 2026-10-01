// Tutor v2 Stage C: the explicit evaluator escalation policy (docs/features/tutor-architecture-v2.md).
// Replaces "JEV uncertain -> always the larger evaluator". Pure and import-free, like learn-tutor.js.
//   JEV error or timeout            -> no escalation; the caller stores nothing from it
//   JEV settled                     -> no escalation
//   uncertain, low consequence      -> retain JEV's events unsettled; the Tutor clarifies
//   uncertain on a check that decides an important teaching move -> the larger evaluator:
//     gap          a prerequisite-gap check (decides a Rabbit Hole suggestion)
//     misconception a named-misconception check whose id already has one settled event on the claim
//                  (a second settled one makes the claim `misconception` and starts Socrates)
//     contradiction a claim with a confident pass (idea or transfer) and a confident or uncertain
//                  named misconception, or the reverse; or one idea both stated (yes or unsure) and
//                  contradicted (yes)
// An uncertain contradiction check (contra, Decision 7) on its own is low consequence.
// spec.claims[i].prior_misconceptions: the misconception ids with one settled event already (the
// browser knows the evidence; the worker does not store any).

const KEY = /^c(\d+)_(idea|mis|contra|transfer)(\d*)$/;

export function escalation(spec, answers, thresholds) {
  const yes = p => p >= thresholds.yes, no = p => p <= thresholds.no, unsure = p => !yes(p) && !no(p);
  const uncertain = Object.keys(answers).filter(key => unsure(answers[key]));
  if (!uncertain.length) return { escalate: false, reason: 'settled', uncertain };
  const gap = uncertain.find(key => /^g\d+$/.test(key));
  if (gap) return { escalate: true, reason: 'gap', uncertain };
  for (const key of uncertain) {
    const [, c, kind, m] = key.match(KEY) || [];
    if (kind !== 'mis') continue;
    const claim = spec.claims[+c];
    if ((claim?.prior_misconceptions || []).includes(claim.misconceptions[+m]?.id)) return { escalate: true, reason: 'misconception', uncertain };
  }
  for (let c = 0; c < spec.claims.length; c++) {
    const own = Object.keys(answers).filter(key => key.startsWith(`c${c}_`));
    if (!own.some(key => uncertain.includes(key))) continue;
    const positive = own.some(key => /_(idea\d+|transfer)$/.test(key) && yes(answers[key]));
    const wrong = own.some(key => /_mis\d+$/.test(key) && !no(answers[key]));
    const positiveUnsure = own.some(key => /_(idea\d+|transfer)$/.test(key) && unsure(answers[key]));
    const wrongSure = own.some(key => /_mis\d+$/.test(key) && yes(answers[key]));
    const both = spec.claims[c].ideas.some((_, i) => !no(answers[`c${c}_idea${i}`]) && yes(answers[`c${c}_contra${i}`]));
    if ((positive && wrong) || (positiveUnsure && wrongSure) || both) return { escalate: true, reason: 'contradiction', uncertain };
  }
  return { escalate: false, reason: 'low_consequence', uncertain };
}
