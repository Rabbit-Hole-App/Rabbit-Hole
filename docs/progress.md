# Learn boards — progress and decisions

The decision log for the NanoGPT Learn boards (nanogpt-deep-dive, nanogpt-depth-ladder). Newest
first. Plans live in docs/nanogpt-deep-dive-board-plan.md and docs/nanogpt-depth-ladder.md; rules
in docs/features/learn-card-composition.md and docs/features/learn-canvas-blocks.md.

## Status (owner's NanoGPT card checklist)

```
NC1  Renderer foundation                 ✅
NC2  Interactive engine                  ✅
NC3  Card shell / Sources / Practice     ✅
NC4  NanoGPT cards 1–10                  ✅ frozen
NC5  18-card depth ladder                ✅ CLOSED (v3 page 11:2, v3.1 fixes 16:3)
NC6  Card-composition rules              ✅
NC7  NanoGPT cards 11–26                 🟡
  NC7A Batch 2                           ✅
  NC7B Batch 3                           ✅ CLOSED (page 18:3, v1.1 fixes 22:3)
  NC7C Remaining through 26              🟡 ACTIVE — batch 4: c14, c26, c19
NC8  Cross-depth content transitions     ⬜
NC9  Curriculum coherence review         ⬜ (open item: is "how scores are produced", q·k, thin?)
NC10 Final card QA                       ⬜
```

Batch flow: plans → card-boundary review → build → adversarial correctness/pedagogy review →
deployed checks → Figma captures → stop at the visual review gate with the exact node URL. Quality
bar: one question per card; practice on an unseen case; no decorative interaction; no text
shrinking; sequence relationships explicit when cards form a path; existing renderer primitives
(a new capability only if a batch proves it genuinely reusable).

## 2026-09-28 — batch 3 closed

Owner approved batch 3 and its v1.1 corrections: c10 scopes "weights add to 1" to attention
dropout being off; c12 bridges from q·k into × 1/√hs → mask → softmax; sequence cards carry a quiet
"Self-attention · k of 3" label in the card header (from the plan's sequence, not navigation);
c05's per-sub-layer takeaway is the heading line.

## 2026-09-28 — v3 approved; five targeted fixes, then close the ladder

**Decision (owner, after reviewing Figma page 11:2).** The sub-card architecture is approved and
page 11:2 is the depth-ladder source of truth. Do not redesign the depth system again: no reopening
the six Overview cards, no re-splitting the Deep dives, no sparse Deep cards, no removing Deep
equations, no smaller type, no new renderer primitives. Attention and Generation keep four
sub-cards; Training 2/3 and 3/3 keep two related equations each.

**Targeted fixes (v3.1).** Tokenization Deep 3/3 labels the "Sonnet 18" KeyError as a What-if
unless that input is selected (red means "this vocabulary cannot encode this input", not "the app
failed"); Training Guided stages "1 What is training minimizing?" then "2 When should training
stop?"; Attention Guided's timeline emphasizes each stage (score → scale + hide future → softmax →
mix values) and keeps later rows quiet until their turn; the Deep pager shows "Deep dive · k / N",
a step bar and "Next: <part name> →"; Transformer and Generation Guided each get one prominent
takeaway line. After the v3.1 captures are clean the depth-ladder work closes and batch 3 starts.

## 2026-09-28 — Deep dives become numbered sub-cards (WP6)

**Decision.** Every Deep dive on the depth ladder is paged into 2–4 sub-cards inside the same
card: "Deep dive · 1/N", "2/N", … in the card header, Previous / Next like the Generation
Overview stepper. The ladder stays 6 × 3 top-level cards. All sub-cards of a card share one
INTERACT row, one practice and one Sources & evidence panel, and one input state (a slider moved
on 2/4 is already applied on 4/4). "Builds on:" appears on 1/N only. At most one formula block
and one visual per sub-card. Body text inside the frame at least 13px, annotations next to
formulas at least 12px, nothing smaller. The same rule applies to the deep-dive board's batch-2
cards, and the render-size floor to every card.

**Why (owner review of nanogpt-depth-ladder · v2 in Figma).** Overview and Guided cards are the
right size. Every Deep dive was overloaded: 4–5 separate ideas stacked in one frame at about 11px
annotation text, 1045–1171px tall. Measured cause of the small text: a scene taller than the
860px viewport cap is scaled down whole — Attention · Deep dive rendered at 0.861, Attention ·
Guided at 0.904 — so 13px annotations drew at 11.2 and 11.7px. Splitting by idea removes both the
overload and the scaling; shrinking would only move the problem.

**Split plan (owner's, adjusted only where a concept needs it; 2–4 each).**
- Tokenization: 1/3 meta.pkl → stoi → get_batch · 2/3 wte and lm_head sizes, parameter count ·
  3/3 block_size tradeoff and the digit edge case.
- The Transformer, end to end: 3 sub-cards.
- Attention: 1/4 split/view/transpose shapes · 2/4 causal mask and the att matrix · 3/4 fp32
  memory cost and the flash/SDPA path · 4/4 the 1/√hs experiment.
- Residual stream and LayerNorm: 2–3 sub-cards.
- Training and loss: 1/3 get_lr schedule · 2/3 forward → cross_entropy → backward with
  micro-steps · 3/3 clip → AdamW → zero_grad and tokens per iteration.
- Generation and sampling: 1/3 crop + forward + last position · 2/3 temperature and top-k with
  the logit table · 3/3 multinomial draw + append, with the T = 0 invalid What-if as a state.

**A second cause, found in the deployed captures.** The card reserved an estimated 84–128px for
INTERACT; where its controls wrap to more rows, the frame lost that height and the scene was
fitted smaller — Architecture · Deep dive drew at 0.82 even after the split, six Guided cards at
about 0.95. INTERACT now reports its measured height and the card grows by it, and the deployed
interaction check measures the real drawn scale of every card (it failed on 10 cards before the
fix).

**How it is built.** A generic scene capability, not per-card wiring: an index input with
`presentation: 'pager'` and a `part` on each object (docs/features/learn-canvas-blocks.md,
"Sub-cards"). `assertCardGates` fails any card that renders a text type below its floor.

**Order.** Batch 3 plans first (done, board plan section 11), then the split of all six Deep
dives and the batch-2 cards in one pass, then clean captures and the Figma page
"nanogpt-depth-ladder · v3 (sub-cards)"; v2 stays for diffing.
