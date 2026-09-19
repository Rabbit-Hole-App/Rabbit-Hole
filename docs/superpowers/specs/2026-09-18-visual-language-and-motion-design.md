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

`initialState.color` is removed. Objects carry a semantic role — **what the object means** — and,
separately, transient state — **what is happening to it now**. Conflating the two would mean a
`prediction` stops being a prediction the moment a learner selects it, and every such change would
be a migration once Plan B adds interaction.

```js
{
  role: 'prediction',          // what this object IS. authored, stable.
  state: { selected: true },   // what is HAPPENING to it. mostly evaluator- or learner-driven.
}
```

## The four axes — added at the vocabulary checkpoint, 2026-09-19

The first real benchmark found the model was one axis short. Three objects of the
*same semantic kind* could not be told apart: Q, K and V are all `observed`, so the
attention scene rendered entirely in one hue while the reference used three. The
fix is not to overload role, and not to invent an eleventh role. It is a fourth
axis.

| axis | answers | owns |
|---|---|---|
| **ROLE** | what does this object mean? | semantic treatment and fill tier |
| **IDENTITY** | which peer is this? | categorical distinction among objects of the same role |
| **STATE** | what is happening to it? | transient interaction and status |
| **VALUE** | how much? | quantitative encoding, including sign |

**Identity carries no styling.** A scene says `identity: 'query'` and nothing more —
never a colour, never a palette slot, never an index. The renderer owns the mapping
from identity key to categorical slot, assigned in authored object order so the
same scene always resolves the same way.

This is reusable, not an attention fix: Q/K/V, modality A and B, expert 1 through
N, candidate trajectories, encoder and decoder streams, attention heads, and any
set of plotted series are all the same problem — peers of one kind that must stay
distinguishable.

**The quantitative ramp, and what may interrupt it.** Added after the first
rendered checkpoint, where a contrast-safe implementation turned out to be safe
only because it had destroyed the encoding it existed to carry.

| | rule |
|---|---|
| **VALUE** | continuous magnitude and sign. Neighbouring values produce neighbouring intensities, always |
| **INK** | changes discretely, and only to preserve readability |
| **STATE** | overlays selection and emphasis without corrupting VALUE |
| **ROLE / IDENTITY** | do not distort the quantitative ramp |

A jump in the ramp is a lie about the data: it makes two near-identical values
look unrelated and two distant values look the same. Contrast is solved by
changing the *ink*, never by collapsing the *fill*.

**Who owns what, once a mark is quantitative:**

| axis | owns |
|---|---|
| **ROLE** | frame, border, labels, legend, semantic context |
| **IDENTITY** | categorical distinction among peers |
| **STATE** | selected, highlighted, blocked, chosen — overlays |
| **VALUE** | the heat cell's interior: sign and magnitude |

A heat cell is **not** an `observed` object with a stronger or weaker fill. It is
a quantitative mark whose interior belongs to VALUE.

**STATE overlays must remain perceptible regardless of ROLE, IDENTITY or VALUE.**

The first rendered checkpoint found selection inheriting its colour from the
VALUE channel's ink. At the pale end of a ramp that ink is the page ink, which
for a grid is also the frame colour — so on a pale cell selection vanished into
the gridlines while being unmistakable on a saturated one. Selection that only
works at one end of a ramp is not orthogonal; it is coincidence.

A state overlay therefore takes **dedicated tokens** — `--viz-selection-inner`
and `--viz-selection-outer` — and draws two concentric strokes. The guarantee is
mathematical rather than a matter of taste: for any background, the better of a
light and a dark stroke always clears about 4.6:1, because the two contrast
curves cross there. One of the pair always separates, whatever is behind it.

It is a **generic primitive**, not logic inside grid rendering. The same
treatment must serve a matrix cell, a token, a box or node, a trajectory, an
image patch and a graph node. A state treatment that only knows how to decorate
one shape will be reimplemented per shape, and the reimplementations will drift.

**The quantitative palette must stay strictly quantitative.** `--viz-heat-*`
tokens must never acquire semantics — nothing that reads as prediction purple or
observed black. A reader must be able to infer *how much* and *which sign* from a
cell's colour, and nothing else. The moment a heat token carries meaning, VALUE
and ROLE are entangled again.

**The three properties a quantitative channel has to prove, independently:**

- **sign fidelity** — negative, neutral and positive stay distinct
- **magnitude fidelity** — the ramp is continuous enough that neighbouring values look neighbouring
- **text accessibility** — every level the ramp emits has an ink clearing 4.5:1 in both themes

They are independent, and testing them together is how a broken channel ships
with green tests: the first implementation passed contrast and sign while failing
magnitude completely.

**And the human question none of the automated ones replace:** *without reading
the numbers, can I rank the cells by magnitude?* If the answer is no, VALUE is
still broken however well contrast and sign score.

It follows that a heat cell's fill token comes from the **value scale**, not from
the object's role. Role owns the frame, the stroke, the labels and the legend —
letting it own the cell interior would put an arbitrary token in the quantitative
channel, and the range the ramp can safely cover would then depend on which role
the author happened to pick.

**No axis compensates for another.** If a picture is failing, the fix is in the axis
that owns the problem. Giving a heatmap a soft role to widen its dynamic range,
or inventing a role to distinguish two peers, trades a rendering problem for a
semantic lie and the lie outlives the frame that caused it.

**VALUE owns the quantitative channel.** When a mark is quantitatively encoded —
a heat cell, a diverging scale — the value drives its fill, and role and identity
keep the frame, the stroke, the labels and the legend. Binding heat inside a
role's fill band would be exactly the compensation the rule above forbids.

**Where hue comes from.** With no identity, role picks the hue as before. With an
identity, the categorical palette picks it and the role still governs fill tier,
weight and ink. Two hue sources cannot both win, and identity is the more specific
claim.

**The interpolation invariant.** Only interpolate when the intermediate values are
mathematically meaningful. Tweening a raw score into a softmax probability invents
numbers that exist nowhere in the computation — the benchmark caught a frame
captioned *a probability distribution that sums to one* over a row summing to 5.8
and containing a negative. A change of quantity is a discrete replacement, not a
tween.

**Roles** — ten, authored, stable for the life of an object:

```
neutral  input  output  prediction  observed  learner  tutor  code  warning  success
```

**States** — six, orthogonal to role, and each composes with any of them:

```
active  selected  highlighted  chosen  blocked  disabled
```

`highlighted` and `chosen` already exist as evaluated booleans, so this formalises what is there
rather than inventing it. A `prediction` that is `selected` is still a prediction: the role picks
the hue, the state modulates weight, fill strength and ring.

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

**Legacy adapter, and exactly where it runs.** The four existing scenes author hex, and the schema
will not accept `color` — so the adapter must run *before* validation, or zod strips the field
before compatibility can see it:

```
raw persisted scene
  ↓  legacySceneAdapter()      color -> role, on a closed table of known values
validateScene()                 role-only from here on
  ↓
prepared scene
```

An unknown hex **fails loudly** rather than being guessed at or mapped to `neutral`: a silently
wrong colour is the thing this whole model exists to prevent, and a scene authored against a hex
nobody recognises is a scene nobody has reviewed.

**Deletion condition, stated so "temporary" does not become permanent:** the adapter is removed once
no shipped scene, no persisted canvas block and no test fixture carries a `color` field. Plan B's
first task checks this and deletes it if the condition holds.

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

The six states above, each styled once and applied by every primitive that can hold them. A state
never changes an object's hue — it modulates fill strength, stroke weight and ring against the
role's own colour, so a selected `prediction` and a selected `observed` read as the same *kind* of
selection on two different things.

Today `chosen` is a hardcoded `#b42318` stroke and `highlighted` is a ring. Both become
role-and-state driven.

### Motion grammar

Named timings replacing raw seconds:

```
instant 0ms   fast 180ms   normal 350ms   slow 700ms   explain 1100ms
```

**The vocabulary resolves before the evaluator ever sees it.** An author may write a name; the
evaluator only ever receives seconds:

```
authored      duration: 'slow'
validateScene duration: 0.7          <- resolved here, once
getSceneState duration: 0.7          <- numeric only; knows no vocabulary
```

This is what keeps the claim that A.5 changes no evaluator semantics true. `getSceneState` is
byte-for-byte the same function it was, operating on the same numeric input; the names live
entirely on the authoring side of the gate. A scene that authors numbers directly is unaffected.

The rules from the brief become authoring guidance enforced where they can be: animate one major
change at a time, pause after a transformation, preserve object identity, avoid simultaneous
motion.

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

**When it fires, exhaustively** — leaving any of these to implementation order produces edge-case
noise:

| situation | sound |
|---|---|
| playback advancing forward | fires |
| manual scrub, any direction | silent |
| backward seek of any kind | silent |
| replay from zero, then playing | fires normally, from the start |
| one dropped frame crossing several events | coalesced, deterministically |

**Coalescing.** One sound per ~80 ms window. When several are crossed together the winner is by
tier, not by array order:

```
1. success  incorrect  reveal          the outcome of a beat
2. split    merge      connect  drop   snap     a structural change
3. soft_pop soft_whoosh  tick  select  toggle_on  toggle_off  compute
```

Highest tier wins; within a tier, the earliest `at` wins. That makes rule 2 mechanical rather than a
matter of authoring care, and makes the choice reproducible.

**The AudioContext is created or resumed only after a first user gesture.** Chrome refuses playback
otherwise and does so silently. The Play button is a sufficient gesture; this is specified rather
than discovered.

**Preferences live outside the scene.** A scene says `reveal`. Whether that is audible, and how
loud, is the learner's setting — mute, volume, reduce-effects. The scene never knows, and the same
JSON is correct for a learner who has sound off.

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

### 7. The visual gate — and it is the one that matters

Everything above proves the architecture is right and nothing regressed. **None of it proves the
result looks good**, and looking bad is the entire reason A.5 exists. A perfectly tokenised system
can still produce something ugly.

For each of the three reference scenes, capture keyframes at **0%, 25%, 50%, 75% and 100%**, in
**both themes** — thirty images. Review each against:

- visual hierarchy: is the important thing the most prominent thing?
- typography: does the scale read as one system, at the sizes actually used?
- spacing rhythm: does the layout sit on the scale, or near it?
- edge and arrow clarity: are connections legible where they matter, including where they cross?
- contrast: does every text and fill pass in both themes?
- label collisions: does anything overlap at any keyframe?
- stroke weight consistency across primitives
- motion pacing: do the beats land, or does everything happen at once?
- focal point: at each keyframe, is it obvious where to look?
- and the only question that really counts — **is the concept visually obvious?**

**A.5 does not pass because every token is used correctly. It passes when these three scenes are
approved by a human as production-quality examples of the target learning experience.** That
approval is explicit and is not mine to give.

The approved images then become the golden visual baseline, the way `token-journey-baseline.png`
served Plan A — so the next pass can prove it changed nothing it did not mean to.

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
