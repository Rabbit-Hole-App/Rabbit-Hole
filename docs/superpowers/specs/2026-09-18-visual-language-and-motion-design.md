# Plan A.5 — Visual language, motion and sound

Follows [the Tier 1 design](2026-09-18-tier1-visual-library-design.md) and precedes its Plan B.

Plan A made the engine draw correctly. It looks like 2010 SVG, because nothing has ever made it
look like anything else: fourteen hardcoded hex values, no typography scale, no spacing system, no
motion design, and a canvas that stays light while the rest of the app flips to dark.

This pass makes the same declarative scenes look like one coherent system. It changes no evaluator
semantics.

## Why before Plan B, not after

Plan B adds the input axis, and every interactive component built on it inherits whatever the
visual system is at that moment. Restyling afterwards means restyling a much larger surface. Four
scenes exist today — one shipped, three demos, all ours. This is the cheapest this migration will
ever be.

## The anti-goal

The pass succeeds only if:

```
same scene spec → renderer + style system → polished output
```

and fails if any reference scene needs its own CSS, its own layout arithmetic, or its own
animation. **Enforced structurally, not by discipline:** a scene is JSON, and the schema gains no
free-form styling field. No `className`, no `style`, no `css`, no pixel nudges beyond the `x`/`y`
an author already writes. If a scene cannot be made to look right through the role, typography and
motion vocabularies, the vocabulary is wrong and the vocabulary changes — not the scene.

---

## A.5a — the two correctness debts

Both are recorded in the Plan A ledger. Both get harder to reason about once Plan B starts, and
neither is visual work.

### Refuse a bad `set_values` at the gate rather than clamping in the renderer

Plan A's Ruling 26 claimed a static cross-field check was "impossible in principle" because
`values` change over time. That was wrong, and the final review caught it. Every `set_values`
payload is static JSON in the same scene, so the true maximum a bar will reach is
`max(|authored values| ∪ |every payload targeting that object|)` — computable at validation.

Two changes:

- Refuse a `set_values` whose target declares no `values` at all. Today the length check is skipped
  in exactly that case, so a `strip` with no authored values accepts a twelve-value payload, draws
  twelve cells, and keeps the one-cell width `sizeOf` froze — the frame and the region hit-test
  disagree, which is the desync the check's own comment says it prevents.
- Keep the renderer clamp as a belt, but it stops being the only guard.

### Replace the scrub debounce with a non-snapshotting commit path

Plan A's Rulings 13 and 15 landed a 150 ms debounce so that scrubbing would stop pushing a full
canvas snapshot onto the 100-entry undo ring per tick. It works, and it left a window where
`block.time` disagrees with the scrubber, papered over by a `block.time ?? time` fallback.

The correct fix is the alternative those rulings rejected: a commit path that does not snapshot.
`AdaptiveCanvas` already has one for exactly this reason — `moveBlock` updates without
`snapshot()` because dragging is continuous. Add the same for block state, use it for time
commits, and the debounce goes away entirely: the commit becomes synchronous, the window closes,
and the `latest` ref becomes belt rather than load-bearing.

---

## A.5b — the visual system

### Colour: the scene names meaning, the system picks the pixel

`initialState.color` is removed. Objects carry a semantic role:

```
input  output  active  selected  prediction  observed
blocked  warning  success  learner  tutor  code  neutral
```

Each role resolves to a CSS custom property defined once, in both themes, beside the existing
tokens in `index.css`. The renderer never computes a colour: it emits `var(--viz-<role>)` and lets
CSS resolve it.

**This kills `tint()`.** Today tints are built by concatenating an alpha byte onto a six-digit hex,
which is why a token can never be used — `var(--color-accent)` has no hex to append to. Tints
become `color-mix(in srgb, var(--viz-<role>) N%, transparent)`, set through `style` rather than as
an attribute, because `fill` accepts a `<color>` as a CSS property and not as an SVG attribute.

Three consequences worth stating:

- **Dark mode arrives almost free.** `#37352f`, `#787774` and `#9b9a97` are already the light values
  of `--color-ink`, `--color-ink-2` and `--color-ink-3`; the renderer is using token values
  literally rather than by reference. Those are a 1:1 swap. The canvas background stops being
  `bg-[#fbfbfa]` and becomes a token with a dark value.
- **Determinism improves.** `getSceneState` returns a role name, never a colour. The same role
  produces the same pixel for a given theme, and a theme change is a deliberate difference rather
  than a drift.
- **The agent cannot pick a colour**, which is what the source brief asks for.

**Legacy adapter, temporary.** The four existing scenes author hex. A compatibility layer maps the
known values to roles at validation, so nothing has to be edited by hand, and it carries a removal
note. New scenes are role-only; the schema does not accept `color`.

### Typography

One scale, named by purpose, replacing the ad-hoc 10/13/14/16 in the renderer:

| role | use |
|---|---|
| `display` | a scene's own title, where one exists |
| `heading` | a section within a scene |
| `body` | captions and narration |
| `caption` | labels attached to an object |
| `annotation` | axis ticks, cell numerals, chip text |
| `code` | monospace, already `MONO` |
| `equation` | KaTeX, sized to its box |

A `text` object names a role; it does not name a size. Hierarchy comes from weight and colour as
much as size, matching how the rest of the app is built.

### Spacing and geometry

A fixed scale — 4, 8, 12, 16, 24, 32, 48, 64, 96 — replacing the current mix of `PAD 48`, `GAP 80`,
`NODE 170×58`, `BAR.w 30` and the `CHIP` constants. Every default geometry the renderer supplies
snaps to it. `sizeOf` keeps deriving size from content; what changes is that its constants come
from the scale.

### Component styling

Per primitive, one considered default rather than the current first-draft values: corner radii,
stroke weights, fill strengths, shadow, the cell pitch of a grid, the bar width and gap, the chip
shape. This is where most of the "looks like 2010" is, and it is also the least architectural part
of the pass.

### Object states

The doc's semantic states, each styled once and applied by every primitive that can hold them:
`active`, `selected`, `blocked`, `prediction`, `observed`, plus the existing `highlighted` and
`chosen`. Today `chosen` is a hardcoded `#b42318` stroke and `highlighted` is a ring; both become
role-driven.

### Motion grammar

Named timings replacing raw seconds:

```
instant 0ms   fast 180ms   normal 350ms   slow 700ms   explain 1100ms
```

`event.duration` accepts a name or a number; a name resolves through the table. The rules from the
brief become authoring guidance enforced where they can be: animate one major change at a time,
pause after a transformation, preserve object identity, avoid simultaneous motion.

Motion still springs only discrete state — the invariant Plan A established and wrote into the
code. Nothing continuous is sprung.

### Sound

Sound is a second semantic output channel, not decoration. Three rules govern it:

1. **Sound never carries essential information.** Every scene must teach identically when muted.
2. **Sound marks a teaching beat, not an SVG mutation.** Thirty cells appearing is one sound, not
   thirty.
3. **Sound never enters `getSceneState`.** The evaluator stays pure and silent.

An event may carry `sound`, from a closed vocabulary:

```
soft_pop  soft_whoosh  connect  split  merge  tick
select    toggle_on    toggle_off       reveal
success   incorrect    compute  drop    snap
```

**How it fires.** The transport, not the evaluator, owns sound. On each advance it compares the
previous time to the current one, finds events whose `at` falls in that interval, and plays each
one's sound once:

```
previous t → current t → events crossed → play once
```

Scrubbing is muted — dragging across ten seconds must not machine-gun. Playback and direct
interaction are the only things that sound. A coalescing window (one sound per ~80 ms) makes rule 2
mechanical rather than a matter of authoring care.

**Where the audio comes from.** Synthesised with the Web Audio API rather than shipped as files: a
soft pop is a short enveloped sine, a whoosh is filtered noise. No assets, no network, no
licensing, no new dependency, and roughly forty lines. If quality demands real samples later, the
vocabulary does not change — only what sits behind it.

**Controls.** A global mute, honoured everywhere. `prefers-reduced-motion` does **not** imply mute —
they are different needs — so a separate reduce-effects preference covers anyone who wants the
motion but not the noise.

Narration and text-to-speech are a different system and are out of scope here.

### Dark mode

In scope, and mostly a consequence of the colour model. The canvas surface, every primitive fill
and stroke, the connection colour, the shadow and the KaTeX text colour all resolve through tokens
that already have dark values or gain them here.

---

## A.5c — reference scenes

Three to four scenes, authored only through the vocabularies above, which become both the visual
benchmark and the few-shot examples for the lesson agent later:

- **causal attention** — tokens, Q/K/V, a score grid, a mask, a distribution
- **VLM patch flow** — an image, a patch grid, a token row, a projector
- **world-model branching futures** — an observation, candidate actions, predicted costs

These are the source brief's acceptance scenes, built **passive**. They become the interactive
acceptance test once Plan B lands the input axis; building them now proves the visual system
against real content rather than against three demos written to show off primitives.

---

## Acceptance

1. No scene carries styling. The schema accepts no colour, no class, no free-form style. Every
   reference scene is expressible through role, typography role, spacing scale, timing name and
   sound name alone.
2. The same scene spec renders coherently in light and dark, with no scene-level branching.
3. `getSceneState` semantics are unchanged: same inputs, same visual state, still pure, still
   silent. Plan A's whole test suite passes untouched except where a role replaces a colour.
4. Every scene teaches identically with sound muted.
5. The four existing scenes render through the new system without hand edits, via the legacy
   adapter.
6. The two A.5a debts are closed, each with a test that fails first.

## Not in scope

- New object types, new actions, the input axis, `derive`, `check` — all Plan B and C.
- Narration and text-to-speech.
- Per-scene art direction of any kind.
- The deferred findings from Plan A's final review that are not visual: `focus_camera` mis-centring
  circles and strokes, the data types missing from the invisibility gate, the non-data render
  fall-through, and the unbounded `tokens` in the tutor prompt. Those belong to Plan B, which will
  be in those files anyway.

## Risks

- **`color-mix` and `context-stroke` support.** Both are used. Chrome 111+, Firefox 113+, Safari
  16.2+ for `color-mix`; `context-stroke` is already shipped in Plan A's arrowhead. Acceptable for
  this app, but it is a floor worth stating rather than discovering.
- **The role vocabulary is a one-way door in practice.** Once scenes are authored against it,
  renaming a role is a migration. Thirteen roles is a guess; the reference scenes in A.5c are what
  test whether it is the right thirteen, which is an argument for building them before the
  vocabulary is considered settled.
- **`AnimatedScene.jsx` still has no unit tests**, because `node --test` cannot import `.jsx`. This
  pass adds significant renderer logic. Extracting the pure parts — the role-to-token mapping, the
  timing table, the sound-crossing calculation — into plain `.js` is the remedy, and it is cheap if
  done as the code is written rather than after.
