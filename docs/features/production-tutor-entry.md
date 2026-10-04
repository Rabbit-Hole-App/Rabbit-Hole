# Production Tutor: the Learn composer is the Tutor

Status: on branch `ui/repo-page-declutter`, not deployed. It replaces the first fix (`3c67a381`), which opened the
Tutor on a separate `?experience=tutor` canvas from a Tutor button. The owner rejected that on 2026-10-04: "the main
composer chat is the tutor", with no separate Tutor canvas and no Tutor or Practice button.

## The problem it fixes

Tutor v2 and Voice shipped to https://digrabbithole.com, but nobody could reach them:
- `useTutor` activated only on the `nanogpt-attention-tutor` review board;
- the only way to a named board was `?board=`, which production ignores (`reviewTools`).

## How it works now

- A `karpathy/nanoGPT` repository opens on its Map; its Learn canvas (one click away) has a composer that is the Tutor:
  - `LearnPage.jsx` passes `on: suppliedCourse && !board` to `useTutor`;
  - a typed or spoken message is a Tutor v2 turn;
  - the mic sits in the composer.
- The Tutor shows a slice card when it teaches it: `showCard` inserts the card if it isn't on the canvas yet.
- A Rabbit Hole keeps the Tutor when its root is that repository. The server names a repository root by its repo
  (`dives.js` `level`), and `LearnTutor.jsx` checks `root.kind === 'repository' && root.title === COURSE_REPO`.
  The slice review board keeps the Tutor too.
- There is no Tutor or Practice button. The table of contents is how a learner moves around the canvas.
- Nothing about Tutor v2 changes: the same tiers, evidence path, Voice, turn id and privacy rules as merged.

## What stays closed

- `?board=` stays review tooling (`reviewTools`, `VITE_COACHING_DEV`). Review boards load and seed only in the
  review build (`reviewTools && board`).
- `?voice=fake` (the scripted Voice harness) works only in the review build. Production ignores it and the mic
  takes the real providers (`LearnVoice.jsx`, `voice-ui.test.mjs`). The production bundle check fails if the
  harness code ships (`__voiceFake`, `failStt`).

## Checks

- `src/project-ui.test.mjs`:
  - no Tutor or Practice button;
  - the composer is the Tutor on the course and its holes;
  - `?board=` stays review-only.
- `e2e/tutor-entry-check.mjs`, on the production-flag build, on the local stack, for the owner and for a learner
  (each on their own `karpathy/nanoGPT` app). It walks:
  - landing on the Map, then Learn: mic, no pill or buttons, the Map icon;
  - a typed Tutor v2 turn;
  - a `/dive` hole that keeps the Tutor, and the climb back;
  - Map and back;
  - every review board's `?board=` opening nothing;
  - `?voice=fake` starting the real Voice path.
- `e2e/voice-check.mjs` runs the scripted Voice flows on the review board in the dev build.

## Known limits

- Practice (the NanoGPT quiz, flashcards and notebooks, `LessonPlanPreview.jsx`) has no way in since its button
  was removed. `e2e/practice-check.mjs` was retired with it. It returns when Practice gets a new entry point.
- The review boards' card definitions still ship in the production bundle, as on main. They are inert: nothing in
  production can open them.
