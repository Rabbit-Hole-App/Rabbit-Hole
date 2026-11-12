import test from 'node:test';
import assert from 'node:assert/strict';
import { EXPLANATION_PICTURE_TEMPLATES, buildPicturePrompt } from '../src/explanation-picture-templates.js';
import { PRIMITIVES } from '../src/learn-primitives.js';
import { validateToolInput } from '../src/learn-validation.js';

const NO_TEXT = 'no text, labels, titles or icons';
const pictureSchema = PRIMITIVES.explanation.schema.properties.visuals.items.oneOf
  .find(schema => schema.properties.k.const === 'picture');

const examples = {
  'object-mechanism': {
    framing: /cutaway/i,
    slots: {
      subject: 'a pin tumbler lock',
      partsAndAction: 'the key lifting pin pairs until their splits align with the edge of the plug',
    },
    a: 'A cutaway shows the key raising pin pairs to the edge of the plug.',
    c: 'The plug can turn when all the pin splits align with its edge.',
  },
  'positional-cause': {
    framing: /arrangement/i,
    slots: {
      subject: 'a lunar eclipse',
      view: 'side view',
      objectsAndPositions: 'the Sun, Earth and Moon in line, with the Moon inside Earth’s shadow',
    },
    a: 'The Moon sits inside Earth’s shadow, with the Sun on the other side of Earth.',
    c: 'Earth blocks direct sunlight from reaching the Moon.',
  },
  appearance: {
    framing: /exterior/i,
    slots: {
      subject: 'a regular icosahedron',
      view: 'three-quarter view',
      visibleFeatures: 'a faceted silhouette and flat equilateral triangular faces',
    },
    a: 'An icosahedron turned to show several of its flat triangular faces.',
    c: 'Every face is an equilateral triangle.',
  },
  organism: {
    framing: /natural-history/i,
    slots: {
      subject: 'a monarch butterfly',
      view: 'top view with wings spread',
      traitInContext: 'four orange wings with black veins and white-spotted edges',
    },
    a: 'A monarch from above with four orange wings spread, showing black veins and spotted edges.',
    c: 'Look for the black veins and white spots along the wing edges.',
  },
  'repeating-structure': {
    framing: /close-up/i,
    slots: {
      subject: 'a sodium chloride crystal lattice',
      unitAndPattern: 'sodium and chloride spheres alternating along all three axes',
    },
    a: 'A cubic lattice with sodium and chloride shown as alternating spheres.',
    c: 'The alternating arrangement repeats in three dimensions.',
  },
};

test('the five picture templates fit the prompt limit and end with the exact exclusion', () => {
  assert.deepEqual(Object.keys(EXPLANATION_PICTURE_TEMPLATES).sort(), Object.keys(examples).sort());
  for (const template of Object.values(EXPLANATION_PICTURE_TEMPLATES)) {
    assert.ok(template.length <= 200);
    assert.ok(template.endsWith(NO_TEXT));
  }
});

for (const [subjectClass, { framing, slots, a, c }] of Object.entries(examples)) {
  test(`${subjectClass} produces a valid author picture prompt with the subject details`, () => {
    const p = buildPicturePrompt(subjectClass, slots);
    assert.match(p, framing);
    for (const value of Object.values(slots)) assert.ok(p.includes(value));
    assert.ok(p.endsWith(NO_TEXT));
    assert.doesNotThrow(() => validateToolInput({ k: 'picture', p, a, c }, pictureSchema));
  });
}

test('picture prompts accept 200 characters and reject overflow', () => {
  const subjectClass = 'object-mechanism';
  const { slots } = examples[subjectClass];
  const room = 200 - buildPicturePrompt(subjectClass, slots).length;
  const exact = { ...slots, partsAndAction: slots.partsAndAction + 'x'.repeat(room) };
  assert.equal(buildPicturePrompt(subjectClass, exact).length, 200);
  assert.throws(() => buildPicturePrompt(subjectClass, { ...exact, partsAndAction: `${exact.partsAndAction}x` }), RangeError);
});

test('picture prompts reject omitted or blank slots and unknown classes', () => {
  const { slots } = examples.appearance;
  assert.throws(() => buildPicturePrompt('appearance', { subject: slots.subject, view: slots.view }), /visibleFeatures/);
  assert.throws(() => buildPicturePrompt('appearance', { ...slots, view: ' ' }), /view/);
  assert.throws(() => buildPicturePrompt('toString', slots), /unknown picture subject class/i);
});

// Owner 2026-11-08: the server check. A picture prompt without the no-text clause gets it where the author's picture is read; one that has it is untouched.
import { authorPicture, composeVisuals } from '../src/learn-primitives.js';
test('an author picture prompt without the no-text clause gets it, one with it is untouched, and the saved fence carries it', () => {
  const picture = p => ({ k: 'picture', p, a: 'A cutaway of the lock.', c: 'The pins line up.' });
  assert.equal(authorPicture(picture('Cutaway of a pin tumbler lock.'), 0).prompt, `Cutaway of a pin tumbler lock. ${NO_TEXT}`);
  assert.equal(authorPicture(picture('Cutaway of a pin tumbler lock, no style'), 1).prompt, `Cutaway of a pin tumbler lock, no style. ${NO_TEXT}`);
  const built = buildPicturePrompt('object-mechanism', { subject: 'a lock', partsAndAction: 'the key lifting pins' });
  assert.equal(authorPicture(picture(built), 0).prompt, built, 'a template prompt already ends with it');
  assert.equal(authorPicture(picture(`${built.toUpperCase()}`), 0).prompt, built.toUpperCase(), 'the check ignores case');
  assert.equal(authorPicture({ k: 'picture', p: '  ', a: 'a', c: 'c' }, 0), null, 'an incomplete picture is still incomplete');
  assert.ok(composeVisuals('Before.\n\n[[visual:1]]\n\nAfter.', [picture('A lock.')]).includes(`"prompt":"A lock. ${NO_TEXT}"`));
  assert.ok(`x. ${NO_TEXT}`.length <= 600 && 200 + NO_TEXT.length + 2 <= 600, 'a 200-character prompt plus the clause fits the saved limit');
});

test('the author prompt carries the picture p contract: every template class with its opening words, the no-text clause, and the name-the-parts rule (owner 2026-11-08, pictures judged no 36/110)', async () => {
  const { EXPLANATION_GUIDANCE } = await import('../src/learn-primitives.js');
  const openings = { 'object-mechanism': 'Technical cutaway of', 'positional-cause': 'Textbook illustration of', appearance: 'Realistic exterior of', organism: 'Natural-history illustration of', 'repeating-structure': 'Scientific close-up of' };
  assert.deepEqual(Object.keys(openings).sort(), Object.keys(EXPLANATION_PICTURE_TEMPLATES).sort(), 'a new template class needs its line in the prompt');
  for (const [name, opening] of Object.entries(openings)) {
    assert.ok(EXPLANATION_GUIDANCE.includes(`${name} "${opening}`), `${name} is in the prompt`);
    assert.ok(EXPLANATION_PICTURE_TEMPLATES[name].startsWith(opening), `${name} opens as the template does`);
  }
  assert.ok(EXPLANATION_GUIDANCE.includes(NO_TEXT) && EXPLANATION_GUIDANCE.includes('never a generic view of the subject'));
  assert.ok(EXPLANATION_GUIDANCE.includes('at most 200 characters'));
});
