// The production Rabbit Hole build (VITE_RABBIT_HOLE=true, no VITE_COACHING_DEV) ships the Learn app and none of
// the dev-only tools (docs/features/rabbit-hole-production.md). Run after building into dist-dev with that env:
//   node e2e/production-bundle-check.mjs
// DIST=<a VITE_COACHING_DEV build> must FAIL on the dev-only markers: it proves they are real, not vacuous.
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const dir = new URL(`../${process.env.DIST || 'dist-dev'}/static/`, import.meta.url);
const names = readdirSync(dir);
const REQUIRED_CHUNKS = ['CanvasPage', 'RepositoryPage', 'Home', 'AgentBar'];
const DEV_CHUNKS = /^(review-fixtures-data|map-memory-data)-/;
// Lesson-block workbench, coaching dev panel, dev-only palette items, review fixtures, review boards, and the
// dev notebook origins a build falls back to without VITE_NOTEBOOK_ORIGIN / VITE_LESSON_NOTEBOOK_ORIGIN, and the
// NanoGPT course's review wording, quiz answer key and editor controls (LessonPlanPreview.jsx, owner editor view of the
// review build: ownership alone never opens it in production), the lesson's old dead pointer to Curriculum, and the
// fake Voice harness (?voice=fake, LearnVoice.jsx: scripted STT/TTS and window.__voiceFake, review build only).
const DEV_MARKERS = ['Insert a sample lesson block', 'Agent workspace', 'Maths animation (paid)', 'Review fixtures are on',
  'No review board is registered', 'small-learn-notebook-dev', 'small-learn-canvas-notebook-dev',
  'Material plan ready for review', 'Draft material plan', 'Quiz answer key', 'Edit this section in chat', 'Edit and approve curriculum',
  'Finish up in Curriculum', '__voiceFake', 'failStt'];
const failures = [];
for (const chunk of REQUIRED_CHUNKS) if (!names.some(n => n.startsWith(`${chunk}-`))) failures.push(`missing Learn chunk ${chunk}`);
for (const name of names) {
  if (DEV_CHUNKS.test(name)) failures.push(`${name}: a dev-only chunk`);
  if (!name.endsWith('.js')) continue;
  const text = readFileSync(new URL(name, dir), 'utf8');
  for (const marker of DEV_MARKERS) if (text.includes(marker)) failures.push(`${name}: contains dev-only "${marker}"`);
}
// The /explain render entry (EXP-T18): explain-render.js loads it from this build's assets and its interception serves only
// /render/scene.html and /static/<file>.(js|css|woff2?|ttf), so the entry must exist and reference nothing else.
const renderEntry = new URL(`../${process.env.DIST || 'dist-dev'}/render/scene.html`, import.meta.url);
if (!existsSync(renderEntry)) failures.push('missing the /explain render entry render/scene.html');
else for (const [, ref] of readFileSync(renderEntry, 'utf8').matchAll(/(?:src|href)="([^"]+)"/g)) {
  if (!/^\/static\/[A-Za-z0-9._-]+\.(js|css|woff2?|ttf)$/.test(ref)) failures.push(`render/scene.html references ${ref}, which the render interception would block`);
}
if (failures.length) { console.log(failures.join('\n')); process.exit(1); }
console.log('ok: the production build ships the Learn app and no dev-only tools');
