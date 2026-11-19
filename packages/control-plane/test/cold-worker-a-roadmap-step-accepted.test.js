// START-3 cold Worker scenario (a-roadmap-step-accepted): the existing roadmap-course tests (each asserts a delivered card, quote or figure) run in a simulated Worker: no synchronous loader for the lazy reference library and no /api/ request first, so a library read before referenceLibraryReady() is awaited by the code under test throws. Red on the first START-3 tree for the roadmap path (release 164 candidate 87339cd7e).
import './no-sync-loader.mjs';
await import('./roadmap-course.test.js');
