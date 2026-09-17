import materialPlan from '../../../docs/courses/nanogpt/lesson-01-plan.md?raw';

// Owner-approved two-page rendering fixture, not a generated course or syllabus.
export const nanoSourceVersion = '3adf61e154c3fe3fca428ad6bc3818b27a3b8291';
export const nanoRevision = Number(materialPlan.match(/Plan revision: (\d+)/)[1]);
const sections = materialPlan.split(/^## /m).filter(section => /^Page [12] —/.test(section));
export const nanoMaterials = sections.map(section => {
  const parts = Object.fromEntries(section.split(/^### /m).slice(1).map(part => {
    const [heading, ...body] = part.split('\n');
    return [heading.trim(), body.join('\n').trim()];
  }));
  return { title: section.split('\n')[0].trim().replace(/^Page \d+ — /, '').replace(/\s+\([^)]*seconds\)$/, ''),
    narration: parts['Spoken or written explanation'].replace(/^[“”]|[“”]$/g, ''),
    reading: parts['Further explanations'], references: parts['References and further reading'] };
});

const text = (objectId, value, x, y, w = 720, size = 'm', pause = 1400) => ({ type: 'text', objectId, text: value, x, y, w, size, pause });
const box = (objectId, x, y, w, h, color = 'grey') => ({ type: 'geo', objectId, x, y, props: { geo: 'rectangle', w, h, color, fill: 'none', size: 's', dash: 'solid' } });
const arrow = (objectId, x, y, dx, dy) => ({ type: 'arrow', objectId, x, y, props: { start: { x: 0, y: 0 }, end: { x: dx, y: dy }, color: 'grey', size: 's', dash: 'solid', arrowheadEnd: 'arrow' } });
const tiles = (objectId, values, x, y, colors = []) => values.flatMap((value, i) => [
  box(objectId, x + i * 64, y, 52, 54, colors[i] || 'grey'),
  text(objectId, value, x + i * 64 + 14, y + 7, 34, 'm', 250),
]);
const meaning = (kind, label, originalText, relatedObjectIds = []) => ({ kind, label, originalText, relatedObjectIds });

export const nanoLesson = {
  // Leave room for tldraw's existing page menu, bottom tools and style panel.
  id: `course-1001-${nanoRevision}`, title: 'What nanoGPT does', viewport: { x: -30, y: -65, w: 1040, h: 770 },
  pages: [
    {
      // durationMs tracks the narration length so drawing keeps pace with audio.
      ...nanoMaterials[0], durationMs: 31500, audio: '/audio/nanogpt-l1-p1.mp3',
      objects: {
        title: meaning('title', 'The prediction task', 'What does a language model predict?', ['prefix', 'prediction']),
        prefix: meaning('diagram', 'Available text: Hell', 'The teaching example has H, e, l, l and an unknown next character. This is not a measured model prediction.', ['prediction']),
        prediction: meaning('diagram', 'Possible next characters', 'Given Hell, possible next characters include o, a space and other vocabulary characters. No measured probabilities are shown.', ['prefix', 'probabilities']),
        probabilities: meaning('annotation', 'Probabilities, not guarantees', 'A prediction assigns probabilities; it does not guarantee the next character.', ['prediction']),
        check: meaning('question', 'One token, then repeat', 'Do we need to predict the whole sentence at once? No. Predict one token, then repeat.', ['prefix', 'prediction']),
        transition: meaning('annotation', 'Represent text as numbers', 'How can we represent this text as numbers?', []),
      },
      scene: [
        text('title', 'What does a language model predict?', 40, 20, 760, 'l'),
        ...tiles('prefix', ['H', 'e', 'l', 'l', '?'], 45, 125),
        text('prefix', 'Given the text so far,\npredict the next token.', 45, 205, 345, 'm', 2500),
        arrow('prediction', 360, 152, 65, 0), box('prediction', 435, 110, 360, 185),
        text('prediction', 'Possible next characters', 455, 130, 325),
        text('prediction', 'o   ·   [space]\nother vocabulary characters', 455, 182, 325, 'm', 2200),
        text('probabilities', 'A prediction assigns probabilities;\nit does not guarantee the next character.', 45, 330, 735),
        text('check', 'Do we predict the whole sentence at once?', 45, 425, 735, 'm', 3200),
        text('check', 'No. Predict one token, then repeat.', 45, 466, 735),
        text('transition', 'Next: how do we represent text as numbers?', 45, 535, 735),
      ],
    },
    {
      ...nanoMaterials[1], durationMs: 25500, audio: '/audio/nanogpt-l1-p2.mp3',
      objects: {
        title: meaning('title', 'Text → tokens → integer IDs', 'Represent characters with consistent integer IDs, then decode to recover the text.', ['characters', 'vocabulary', 'ids']),
        characters: meaning('diagram', 'Hello character positions', 'Hello has five character positions, including two occurrences of l.', ['vocabulary', 'ids']),
        vocabulary: meaning('diagram', 'Toy character vocabulary', 'Toy mapping: H = 0, e = 1, l = 2, o = 3, space = 4. Actual IDs depend on the dataset vocabulary.', ['characters', 'ids']),
        ids: meaning('diagram', 'Encoded Hello: [0, 1, 2, 2, 3]', 'Encoding Hello with the toy vocabulary gives [0, 1, 2, 2, 3]. Both l characters map to ID 2.', ['characters', 'vocabulary', 'decode']),
        encoding: meaning('diagram', 'Look up each character', 'Each character position maps to its integer ID using the toy vocabulary.', ['vocabulary', 'ids']),
        decode: meaning('annotation', 'Decode IDs back to text', 'Decode [0, 1, 2, 2, 3] with the same dictionary to recover Hello. IDs are labels, not importance scores or learned embeddings.', ['vocabulary', 'ids']),
        check: meaning('question', 'Try encoding a new string', 'Use the same toy vocabulary to encode lo H, including the space. The exercise is below the canvas.', ['vocabulary']),
      },
      scene: [
        text('title', 'Text → tokens → integer IDs', 40, 20, 760, 'l'),
        ...tiles('characters', ['H', 'e', 'l', 'l', 'o'], 45, 115, ['', '', 'orange', 'orange']),
        text('vocabulary', 'Toy vocabulary', 430, 100, 350),
        ...['H → 0', 'e → 1', 'l → 2', 'o → 3', '[space] → 4'].map((v, i) => text('vocabulary', v, 455, 143 + i * 35, 310, 'm', 500)),
        ...Array.from({ length: 5 }, (_, i) => arrow('encoding', 71 + i * 64, 180, 0, 105)),
        ...tiles('ids', ['0', '1', '2', '2', '3'], 45, 300, ['', '', 'orange', 'orange']),
        text('ids', 'Same character, same ID. Spaces have IDs too.', 45, 385, 740),
        arrow('decode', 390, 335, 0, -190), text('decode', 'decode', 323, 235, 100, 'm', 1200),
        text('vocabulary', 'Toy IDs only. Actual IDs depend on the dataset.', 45, 440, 735),
        text('decode', 'An ID is a label, not an importance score.', 45, 480, 735),
        text('check', 'Your turn below: encode “lo H”.', 45, 535, 750),
      ],
    },
  ],
};
