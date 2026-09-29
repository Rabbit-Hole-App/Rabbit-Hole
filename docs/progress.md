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
NC7  NanoGPT cards 11–26                 ✅ COMPLETE (25-card inventory, card 8 folded into 9)
  NC7A Batch 2                           ✅
  NC7B Batch 3                           ✅ CLOSED (page 18:3, v1.1 fixes 22:3)
  NC7C Remaining through 26              ✅ — batch 4 ✅ CLOSED (page 26:3, v1.1 fixes 28:3);
                                            batch 5 ✅ CLOSED (page 34:3, v1.1 closeout 38:3)
NC8  Cross-depth content transitions     ✅ CLOSED (page 43:3; docs/nanogpt-depth-ladder.md
                                            "Cross-depth transitions")
NC9  Curriculum coherence review         ✅ CLOSED (page 47:3) (open items: softmax card: not needed, both Guided cards
                                            work it in place (decided); notation and example drift; c18 practice vs
                                            Training Guided reveal; q·k score production ✅ PASS (audit only,
                                            docs/nanogpt-depth-ladder.md);
                                            should c26 name its iteration-1000 checkpoint next to c25's 100?;
                                            c22 rounds each cell (z 0.60) where c21 rounds to sum 1 (z 0.61))
NC10 Final card QA                       🟡 ACTIVE (incl. accessibility audit: classify the seven dimmed focus/mask
                                            states - A semantic text to 4.5:1, B unavailable/decorative
                                            with a documented exemption; docs/features/learn-canvas-blocks.md;
                                            Architecture Deep's INTERACT label generate() on "hear me spea" ends
                                            mid-word with no truncation mark - owner to decide;
                                            course-wide space notation: • as the visible glyph with a
                                            "• = space" key, sp only in implementation/source contexts;
                                            audit Architecture Overview, Generation Overview, Generation
                                            Deep 1/4 and 4/4, c22, c23)
──── after NC10 ────
Adaptive Tutor v1                        ⬜ handoff milestone, not implemented here
                                            (docs/features/adaptive-tutor-v1.md)
```

Batch flow: plans → card-boundary review → build → adversarial correctness/pedagogy review →
deployed checks → Figma captures → stop at the visual review gate with the exact node URL. Quality
bar: one question per card; practice on an unseen case; no decorative interaction; no text
shrinking; sequence relationships explicit when cards form a path; existing renderer primitives
(a new capability only if a batch proves it genuinely reusable).

## 2026-09-29 — NC9 closed

Owner reviewed the Figma captures (page 47:3) and closed NC9: one notation across both boards
((out, in), x/attn/GELU(h), ln, idx for (B, T) IDs, named schedule symbols, weight_decay and
grad_clip, • with a key on c06/c13); q·k score production PASS with no change; no separate softmax
card; c21's T = 1.0 row equals c22's and its 4-decimal readout (0.6048) explains the 0.60 cell;
c25/c26 name their checkpoints (iteration 100, the kept; iteration 1000, the last); Training
Guided no longer names the checkpoint c18's practice asks for, and c18 is untouched; the status
labels "Source value (stored result)" and "(labels only)" are right. Pushed fast-forward
8993d4d..365ef91. NC10 is the final card closeout: course-wide space notation, the dimmed-content
classification, Architecture Deep's mid-word label, final QA and one last Figma gate.

## 2026-09-29 — NC8 closed

Owner approved the seven changed states (page 43:3) and the data-only transition work: stable
semantic sub-card ids, optional part-level targets with parent-card fallback, the four relation
types, no forward prerequisites, no implicit input copying, directed batch-2 relationships. The
Residual Deep caption stays; short cross-depth bridge lines are excluded from the ~1.3× depth
text budget when they only connect already-taught ideas (docs/nanogpt-depth-ladder.md). Training
Deep keeps opening at it = 2550; the Residual Overview keeps the two-add clarification. Attention
Deep 3/4's dimmed fused path stays for the NC10 classification. Pushed fast-forward
7f752d4..8993d4d. NC8 reopens only for a correctness or broken-transition regression; NC9 next.

## 2026-09-29 — batch 5 closed; NC7 complete

Owner approved the v1.1 closeout (page 38:3) and closed batch 5: c25 contrast, c23 lock state
with no internal index, c24 and c22 feedback sizing with a separate New attempt row, c24's
placeholder removed. c24's ~116px of breathing room before practice is accepted: the fixed
card height keeps the card from jumping when practice reveals the ROMEO case; the approved
revealed lines are not merged to save space. Pushed fast-forward 42a8d97..7f752d4. Batch 5
reopens only for a correctness regression. With it every card of the 25-card inventory exists
(card 8 folded into 9), so NC7 is complete; NC8 is next. Deferred and not blocking: NC9 (c26's
iteration-1000 label, c21 0.61 vs c22 0.60 rounding), NC10 (the seven dimmed focus/mask states).

## 2026-09-29 — batch 5 visual review: keep the designs, fix the five shared items

**Decision (owner, after page 34:3).** c24, c25, c23 and c22 are approved as content and visual
models; no card redesign and no large review cycle. c22's large −∞ marks stay (they make the
truncation step unmistakable). Fix all five shared renderer items once, before scaling to the
remaining cards: secondary/unlit text passes 4.5:1 on every surface (fix the semantic token, not
card overrides); practice feedback and the attempt counter at 14px; no internal index in any
learner-facing text ("Locked by this task — block_size = 3"); a locked input shows as
"block_size = 3 · locked by practice" with the alternatives hidden, restored on Back to explore;
New attempt leaves the answer row for a secondary-action row. c24 loses its pre-practice
placeholder line. The two cross-card items (c26 iteration 1000 vs c25 100; c21 0.61 vs c22 0.60)
stay in NC9. Closeout: a small "batch 5 · v1.1 closeout" page with five shots; if clean, batch 5
closes and the commits push fast-forward.

## 2026-09-29 — batch 5 at the visual gate

First batch built under the locked pipeline (docs/features/learn-card-pipeline.md). Build: fixtures
by one owner, four fresh authors, a correctness and a pedagogy reviewer per card (36 findings), a
fresh fixer and verifier (all fixed, none unresolved), a sequence reviewer (5 findings, fixed and
verified). Deployed checks green (25 cards drawn at scale 1, 278/278 sources, every practice grades
right). Fresh visual reviewers on the deployed full-UI captures: 25 findings, 22 fixed and
verified in round 1; round 2 fixed the 7 minor regressions the verifiers found, verified on new
captures. Figma page 34:2 (root 34:3).

**Proposed shared renderer changes (stop for the owner; not made):** unlit token/cell ink
--color-ink-2 is 4.32:1 on the scene background (3.72:1 on lilac cells), and label tokens draw at
13 px; practice feedback is text-xs (12 px) against 14 px chips; the practice lock line prints
"(index N)" (scene-inputs.js describeInputValue); locked preset chips have no disabled style
(SceneControls chipClass); "New attempt" can share the chips' row and read as a fifth option.

## 2026-09-28 — card pipeline: independent reviewers from batch 5 on

**Decision (owner).** Claude Opus 5.5 generates cards; review is independent of generation.

**Audit of batches 2–4 (reported to the owner).** Planner, generator, reviewers and fixers were all
Opus 5.5 subagents with separate contexts — no generator reviewed itself in its own conversation —
but independence was partial: reviewers were handed the generator's self-report; one reviewer per
card covered correctness, pedagogy and visuals together; the independent visual check saw only
the scene frame, while the deployed-UI check was done by the orchestrator who also directed the
fixes; fixes were not re-verified by a fresh agent; one model throughout.

**Pipeline from batch 5.** plan (planner → critic → judge) → Opus 5.5 generator (gets the plan, the
objective, prerequisites, causal steps, interaction, practice requirement, pinned revision and the
renderer's capabilities; may not change the shared renderer) → two fresh reviewers per card,
correctness and pedagogy/composition, who see only the card files, plan entry, sources and their own
renders, never the generator's report → a fresh fixer → a fresh verifier (findings + current
files, not the fixer's explanations) → a fresh sequence reviewer (files only) → deployed browser
checks → a fresh visual reviewer on the deployed captures (the real UI) → Figma gate. JEV is not a
reviewer; it is not in this repo (its grading work is another agent's), and when available it may
only raise warnings a reviewer investigates.

## 2026-09-28 — batch 4 closed

Owner approved batch 4 with three corrections (v1.1): the c26 → c19 sequence is "Training
fundamentals", not "One training step" (the frozen cards still cover the rest of a real step);
c26 reads perplexity as the same uncertainty as a uniform choice among about that many equally
likely possibilities; one line scopes the average (this card: one window; NanoGPT: all B × T
scored positions in the batch). c14, c19, "The MLP" and all three practices approved as built.

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
