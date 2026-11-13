// The Examples page's canvases. Add an entry per canvas: `href` is the canvas's public share link (a viewer can open it and
// Fork it), `image` a screenshot of the canvas in public/landing/ (any size; it is shown top-left, cropped to the card).
// ponytail: the three entries below are SAMPLES that reuse landing screenshots; replace them with the real example canvases.
export const examples = [
  { slug: 'explain-sample', category: 'Explain', title: 'A visual explanation', description: 'Ask one question and get a step-by-step visual explanation you can follow, rearrange and ask more about.',
    href: '/sign-up', image: { src: '/landing/audience-explain-v1.webp', w: 2256, h: 1212, alt: 'A canvas with a visual explanation card' } },
  { slug: 'paper-sample', category: 'Papers', title: 'A paper, read together', description: 'A research paper broken into cards: the key ideas, the figures and your questions, side by side.',
    href: '/sign-up', image: { src: '/landing/audience-paper-v1.webp', w: 1620, h: 990, alt: 'A canvas with a research paper and notes' } },
  { slug: 'quiz-sample', category: 'Practice', title: 'Quiz yourself', description: 'Turn what you just learned into questions, and see which ideas still need another look.',
    href: '/sign-up', image: { src: '/landing/audience-quiz-v1.webp', w: 2118, h: 1350, alt: 'A canvas with a quiz card' } },
];
