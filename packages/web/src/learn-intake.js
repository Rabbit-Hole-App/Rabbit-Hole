// packages/web/src/learn-intake.js
// The Learn half of the Tutor's intake (intake-run-or-learn-spec.md section 1, owner 2026-11-15): the options the catalogue document offers as rows, and the Tutor's reply to a typed line.
// Everything said here comes from the catalogue document's `learn` section (options: label and what; cannot: thing and why) - nothing is a word of one repository.
// Pure: no React, no network, no storage.
import { SENTENCES, SOMETHING_ELSE_CHIP, leaks } from './tutor-rehearsal-text.js';

const noStop = text => String(text || '').trim().replace(/[.\s]+$/, '');

// doc.learn -> { options (1-4, plain words only), cannot }. An option whose label would show a path or a command is left out, as the catalogue's own rows are.
export function learnOf(doc) {
  const learn = doc?.learn;
  const options = (learn?.options || []).filter(o => o && typeof o.id === 'string' && typeof o.label === 'string' && o.label.trim() && !leaks(o.label, { repo: doc?.repo })).slice(0, 4);
  const cannot = (learn?.cannot || []).filter(c => c && typeof c.kind === 'string' && typeof c.thing === 'string' && c.thing.trim());
  return { options, cannot };
}

// Clickable rows (ChoiceList.jsx): `learn:<id>` is the one click that picks the topic.
export const optionRows = (options, { disabled = false } = {}) => options.map(option => ({ id: `learn:${option.id}`, label: option.label, ...(disabled ? { disabled: true } : {}) }));

// The Tutor's reply to a typed line (routeLearnText's outcome) -> { text, choices } for the chat log.
//   confirmed: the option in the document's own words and one Start row
//   near:      "Did you mean one of these?", the 1-2 closest options and Something else
//   cannot:    the sentence built only from the document's `thing` and `why`, then every option
//   none:      nothing guessed: the Tutor says it was not sure and the options stay
export function learnReply(outcome, learn) {
  const all = optionRows(learn.options);
  if (outcome?.kind === 'confirmed' && outcome.option) {
    const { id, label, what } = outcome.option, line = `**${label}**${what ? `: ${noStop(what)}.` : ''}`;
    return { text: leaks(line) ? `**${label}**` : line, choices: [{ id: `learn:${id}`, label: SENTENCES.start }] };
  }
  if (outcome?.kind === 'near' && outcome.options?.length) {
    return { text: SENTENCES.learnNear, choices: [...optionRows(outcome.options.slice(0, 2)), { id: 'else', label: SOMETHING_ELSE_CHIP }] };
  }
  if (outcome?.kind === 'cannot' && outcome.cannot) {
    const sentence = SENTENCES.learnCannot(noStop(outcome.cannot.thing), noStop(outcome.cannot.why));
    return { text: leaks(sentence) || !outcome.cannot.why ? SENTENCES.learnCannotPlain : sentence, choices: all };
  }
  return { text: SENTENCES.notSure, choices: all };
}

// The miss path (Reviewer 2026-11-15 22:07): the typed line the router could not place went to ONE Tutor turn (learn_fit) that said whether it can be learned here and why.
// out: { text, fits: [option id], focus: string | null } -> { text, choices, focus: { id, text } | null }
//   one fit:   a Start row for that option, and the learner's own words kept as the focus when the line was narrower than the option
//   several:   those options as rows;  none: every option as rows (the sentence says what the repository lacks)
export function fitReply(out, learn) {
  const ids = Array.isArray(out?.fits) ? out.fits.filter(id => learn.options.some(option => option.id === id)) : [];
  const text = String(out?.text || '').trim() || SENTENCES.notSure;
  if (ids.length === 1) {
    const focus = typeof out.focus === 'string' && out.focus.trim() ? { id: ids[0], text: out.focus.trim().slice(0, 300) } : null;
    return { text, choices: [{ id: `learn:${ids[0]}`, label: SENTENCES.start }], focus };
  }
  return { text, choices: optionRows(ids.length ? learn.options.filter(option => ids.includes(option.id)) : learn.options), focus: null };
}
