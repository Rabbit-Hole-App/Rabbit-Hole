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
