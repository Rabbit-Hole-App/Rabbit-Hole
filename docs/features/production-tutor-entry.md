# Production Tutor entry

Status: candidate on `fix/production-tutor-entry`, not deployed. Locked product decision (owner, 2026-10-03):
the NanoGPT Tutor is a first-class product experience, reached from the product UI, never from `?board=`.

## The problem it fixes

Tutor v2 and Voice shipped to https://digrabbithole.com but nobody could reach them. `useTutor` activated
only on the `nanogpt-attention-tutor` board, and the only road to a named board was `?board=`, which
production deliberately ignores (`reviewTools`, review boards are dev/review only).

## The road

Repository -> Learn -> **Tutor** -> the approved NanoGPT Tutor canvas, with Tutor v2 and Voice.

- On a `karpathy/nanoGPT` repository's Learn tab, the strip above the canvas has **Tutor** beside **Practice**
  (`data-learn-tutor`, `LearnPage.jsx`).
- Tutor goes to `/apps/<repo-app>?tab=learn&experience=tutor`. That surface seeds the Tutor slice cards
  (`tutorSliceBlocks`), the mic sits in the composer, and a typed or spoken message is a Tutor v2 turn.
- Inside the Tutor, the same button reads **Back to lesson** and returns to `?tab=learn`. Practice belongs to the
  lesson, so it is hidden inside the Tutor. A reload keeps the learner where they are.
- A Rabbit Hole under the Tutor climbs back through the product URL: `dive.js` `levelHref` maps the Tutor
  board on a repository to `?experience=tutor`, never `?board=`.
- The Tutor canvas is the same one the review board used: same board id, seed version and storage keys.

## The allowlist

`learn-experiences.js` `EXPERIENCES` is the production allowlist. It is frozen and holds exactly one entry:
`tutor` -> board `nanogpt-attention-tutor` on repository `karpathy/nanoGPT`.

`experienceOf` opens an experience only when all of these hold:
- it is a Rabbit Hole build;
- the app is a repository;
- `?experience=` is an own key of `EXPERIENCES`;
- the repository is the entry's repository.

The experience name is not a board id. Nothing in a URL, user input or repository metadata becomes a board:
- `?board=` stays review tooling (`reviewTools`, `VITE_COACHING_DEV`), as before;
- an unlisted `?experience=` opens the normal lesson.

Review boards seed only in the review build (`reviewTools && board`).

The Tutor's activation is unchanged: `useTutor().active` is the Tutor board or a hole under it. Production now
reaches that board through the product state instead of a URL override, so Tutor v2, its model tiers, the
evidence path, Voice, the turn id and the privacy rules are the merged ones, untouched.

## Checks

- `src/learn-experiences.test.mjs`:
  - the allowlist is exactly the Tutor;
  - the Tutor opens only by name, on its repository, in a Rabbit Hole build;
  - board names, review boards and prototype keys open nothing;
  - holes climb back through the product URL;
  - `LearnPage.jsx` keeps `?board=` review-only.
- `e2e/tutor-entry-check.mjs`, on the production-flag build (no `VITE_COACHING_DEV`), local stack:
  - Repository -> Learn -> Tutor for the owner and a learner (each on their own `karpathy/nanoGPT` app;
    repositories are private to whoever imported them): Tutor cards, mic, a typed Tutor v2 turn, reload,
    a `/dive` Rabbit Hole and the climb back to the Tutor, Back to lesson;
  - every review board's `?board=`, and unlisted `?experience=` values, open the normal lesson with no Tutor
    and none of their cards or storage;
  - no review-only code reaches the browser.
- `e2e/voice-check.mjs` with `VOICE_APP=<repo app>` runs the fake-voice flows on the product entry.

## Known limits

- The review boards' card definitions still ship in the production bundle, as on main before this change.
  They are inert: nothing in production can open them.
- `?voice=fake` (scripted local adapters, no provider calls) is honoured in every build, as on main.
- Review build only: a repository other than `karpathy/nanoGPT` opened on the Tutor board with `?board=` climbs back
  from a Rabbit Hole to its normal lesson, because `levelHref` sends every repository's Tutor board to
  `?experience=tutor`, which only the NanoGPT repository honours. Canvas review boards keep `?board=`.
- A hole whose Rabbit Hole root is the Tutor board runs the Tutor wherever it lives (`useTutor`, as on main); the
  server accepts any parent board name for a dive. It opens no review content.
