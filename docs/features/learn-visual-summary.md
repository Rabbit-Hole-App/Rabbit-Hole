# Visual Summary / Concept Map

## Status

**FUTURE / NOT IMPLEMENTED.** A post-freeze learning primitive to revisit after the current
card/tool system and the Tutor architecture are settled (owner, 2026-09-29). Nothing here is
built: no renderer code, registry entry, slash-command change, agent prompt change, generation
call or Tutor work.

## Product idea

Rabbit Hole should eventually turn a learning canvas into a polished visual synthesis, like the
technical educational posters people share on LinkedIn and Substack:

```
small cards → understanding → one visual synthesis → zoom out
→ "Now I see how everything fits together."
```

Unlike a static infographic, the Rabbit Hole version stays connected to the learning material
underneath it.

Internally: one reusable primitive with two presentation modes, not two unrelated
implementations.

```
primitive: visual_summary
mode:
  summary       // poster / one-page synthesis
  concept_map   // relationship-first interactive map
```

Naming can be revisited before implementation. There are no `/visual-summary` or `/concept-map`
top-level commands; it lives under the existing semantic family `/diagram`:

- `/diagram summarize this canvas`
- `/diagram make a concept map of what I learned`
- `/diagram show how these ideas connect`

The future Tutor may also choose it automatically, but Tutor policy is out of scope here.

Three moments for the same primitive:

- **Before:** "Show me the landscape."
- **During:** "How does this thing connect to what I've learned?"
- **After:** "Turn everything I learned into one mental model."

## 1. Two primary users

**A. Content creator / educator** (LinkedIn educator, Substack author, technical blogger, course
creator, company educator). They build a Rabbit Hole canvas — explanations, diagrams, graphs,
code, papers, quizzes, animations, notebooks — by hand and/or with the agent, then ask: "Create a
visual summary of this canvas." Rabbit Hole produces a polished, shareable synthesis the creator
can edit, rearrange, hide sections of, regenerate selected sections of, export as PNG or PDF, and
share as the Rabbit Hole canvas URL. The exported image is the teaser; the Rabbit Hole URL is the
interactive source.

```
LinkedIn post: [visual summary image] "I made an interactive version here: <Rabbit Hole URL>"
→ view canvas → inspect summary → click a concept → explore the underlying cards
→ fork the canvas → learn / adapt it
```

This loop is the strategic point: the static image becomes the entry point into an explorable
learning object (creator builds on Rabbit Hole → visual summary → LinkedIn/Substack/blog →
"explore the interactive version" → canvas → viewer explores, learns, forks → another rabbit
hole). It is not a social network: it reuses Rabbit Hole's existing share and fork model.

**B. Learner.** After studying something: "Summarize everything I learned." Rabbit Hole creates a
personal synthesis from the material actually covered, e.g.

```
Attention: q / k / v → q·k scores → scaling → causal mask → softmax → weighted values
→ multi-head attention → NanoGPT implementation
```

Not another explanation card: a zoomed-out mental model.

## 2. A concept map can be the beginning, not only the end

- **Overview-first.** "Show me the landscape." A relatively shallow concept map the learner opens
  progressively — never the entire course at once.

  ```
                Text classification
                        │
         ┌──────────────┼──────────────┐
         ↓              ↓              ↓
  Bag of Words         RNN        Transformers
                                       │
                                ┌──────┴──────┐
                                ↓             ↓
                             Encoder       Decoder
  ```

- **Synthesis-after-learning.** Built from the cards and interactions the learner already has:
  concepts, implementation details, equations, source relationships, experiments, conclusions.

## 3. Interactive behaviour

A visual summary never becomes a dead image. Clicking a concept (e.g. "Transformer Encoder",
"Bag-of-Words") can expand its panel, highlight its relationships, focus or open the underlying
canvas cards, reveal its explanation and sources, and offer "Learn this" to begin or deepen a
learning path. Interaction stays simple in v1, and the summary is not a separate canvas engine.

## 4. Architecture principle

Never generate the whole visual as an AI image (`model → giant PNG containing text`): technical
text, equations, citations and exact layout become unreliable. Instead:

```
model → validated declarative spec → deterministic layout → existing Rabbit Hole rendering
primitives → HTML/SVG visual
```

The model generates structure and content, not React/HTML, and never executable code.

## 5. Reuse existing primitives

A visual summary is primarily a composition primitive over existing capabilities: explanation,
table, flow diagram, Mermaid, interactive graph, data plot, code sample, equations/math, image,
paper/source references, knowledge graph, animation thumbnail/state. The summary renderer owns
layout. It does not embed complete heavyweight interactive cards everywhere: it uses compact
summary representations that open the richer artifact when clicked.

## 6. Declarative schema (illustrative, not frozen)

```
{
  id,
  mode: "summary" | "concept_map",
  title,
  subtitle?,
  primaryTakeaway,
  panels: [
    { id, title, summary?, representation, content, sourceCardIds?, sourceRefs?, learnTarget? }
  ],
  relationships: [
    { from, to, type, label?, provenance? }
  ],
  includedCardIds,
  sourceRevision
}
```

It may later support equations, code/source references, compact charts, images, callouts and
section grouping. Never arbitrary HTML, CSS or React.

## 7. Relationship semantics

A small allowlisted vocabulary; the model may not invent relation types. Candidates:
`prerequisite`, `part_of`, `leads_to`, `compares_with`, `implements`, `derived_from`,
`evidence_for`, `related`. A relationship that comes from recorded structure or source evidence
keeps that provenance; one the model inferred is marked inferred, never presented as recorded
fact.

## 8. Generate from the current canvas

Eventually from: the entire canvas, selected cards, a selected section/group, or a learning path
("Make a visual summary from these 12 cards"). The generator receives semantic card descriptions,
IDs and provenance — not a canvas screenshot when structured content exists — and the summary
keeps references to the underlying card IDs.

## 9. Snapshot semantics

A generated summary is initially a snapshot recording `sourceRevision`, `includedCardIds` and
`generatedAt`. Editing an underlying card never silently rewrites an already-published summary
(creators may already have exported or posted it). Later: "Refresh summary", showing what
changed.

## 10. Creator editing

Generated output stays editable: at least edit title and text, remove, reorder and resize
panels, refresh one panel, edit relationships — no full regeneration for a typo. User edits stay
distinct from regenerated model output.

## 11. Export and sharing

PNG and PDF from the deterministic HTML/SVG rendering, high resolution and readable without
Rabbit Hole. No long raw URL baked into the poster by default; instead a share workflow:
`[Download image]` `[Copy Rabbit Hole link]` `[Copy suggested social caption]`. The canvas URL is
the canonical interactive version; a shared canvas supports View, Fork and Learn this according
to existing permissions.

## 12. Mobile

The same spec renders on desktop and mobile. Desktop may use a poster/grid layout; mobile stacks
progressively: title → primary takeaway → panel → relationship → panel. Never a desktop poster at
tiny scale that expects pinch-zoom. Export may still use the canonical poster dimensions.

## 13. Validation

The same philosophy as Artifact Generation v1: structured spec → JSON/schema validation →
semantic validation → at most ONE repair attempt → explicit failure if still invalid. Semantic
checks: every relationship references valid panel ids; no duplicate ids; a bounded number of
panels; title and takeaway present; source references valid; card references exist; supported
representation types only; no executable content; no invented source URL.

## 14. Provenance

The summary keeps Rabbit Hole's epistemic labels: source fact, recorded result, calculated
example, What-if, recorded project decision, model synthesis/inference. A beautiful infographic
never erases them. The static export uses compact provenance markers with a source footer; the
interactive version reveals the full source details.

## 15. Primary takeaway

Every visual summary answers "What is the one thing I should understand after zooming out?" in
one required `primaryTakeaway`, so the renderer never becomes a random collage of cards.

## 16. Future Tutor use (not now)

Adaptive Tutor may later choose `visual_summary` for moves such as synthesize, connect concepts,
review, consolidate, show landscape (e.g. learner finishes Attention → Tutor creates a visual
synthesis → "Walk me through this map." → explain-back / JEV evaluates understanding). This
document does not define Socrates/Feynman/Plato routing (docs/features/adaptive-tutor-v1.md).

## 17. Out of scope for the first implementation

Social feed; likes, follows, comments; creator monetization; collaborative real-time poster
editing; autonomous curriculum creation; arbitrary HTML templates; arbitrary design generation;
AI image generation for technical text; Tutor policy.

## 18. Future acceptance conditions

`visual_summary` is not ready merely because it renders. A future v1 proves:

1. generate a summary from an existing Rabbit Hole canvas;
2. preserve underlying card/source references;
3. render deterministically;
4. no baked/generated technical-text image;
5. one invalid spec gets at most one repair;
6. the desktop summary is readable;
7. the mobile layout is usable;
8. clicking a panel reaches/expands the underlying learning material;
9. PNG/PDF export is clean;
10. the shared Rabbit Hole URL opens the interactive source canvas;
11. a viewer can fork when permissions allow;
12. the creator can edit the generated synthesis without editing all source cards.

Implementation status: deferred.
Do not add this primitive to learn-primitives.js, slash.js, BLOCK_TYPES, or Tutor tools yet.
