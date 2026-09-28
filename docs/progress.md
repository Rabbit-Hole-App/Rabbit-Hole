# Learn boards — progress and decisions

The decision log for the NanoGPT Learn boards (nanogpt-deep-dive, nanogpt-depth-ladder). Newest
first. Plans live in docs/nanogpt-deep-dive-board-plan.md and docs/nanogpt-depth-ladder.md; rules
in docs/features/learn-card-composition.md and docs/features/learn-canvas-blocks.md.

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

**How it is built.** A generic scene capability, not per-card wiring: an index input with
`presentation: 'pager'` and a `part` on each object (docs/features/learn-canvas-blocks.md,
"Sub-cards"). `assertCardGates` fails any card that renders a text type below its floor.

**Order.** Batch 3 plans first (done, board plan section 11), then the split of all six Deep
dives and the batch-2 cards in one pass, then clean captures and the Figma page
"nanogpt-depth-ladder · v3 (sub-cards)"; v2 stays for diffing.
