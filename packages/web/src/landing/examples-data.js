// The Examples page's canvases. Add an entry per canvas: `href` is the canvas's public share link (a viewer can open it and
// Fork it), `image` a screenshot of the canvas in public/landing/ (a screenshot of the whole canvas, any size; it is shown whole, never cropped).
// One example (owner 2026-11-14), opened in a new tab (`external`). Its picture is made by `node scripts/landing-art.mjs example-canvas ... --only` (header of that script).
export const examples = [
  { slug: 'decision-trees', category: 'Machine learning', title: 'Decision Trees and Random Forests', description: 'People are fine-tuning LLMs for tasks a 20-line Decision Tree solves in milliseconds.',
    href: 'https://digrabbithole.com/b/mfASpYxM-D2Kg2bT61VshCjYt1mtgqsv', external: true, image: { src: '/landing/example-decision-trees-v1.webp', w: 2400, h: 1500, alt: 'The canvas "Decision Trees and Random Forests" seen from far away: its cards laid out side by side' } },
];
