# R4 safety responses: S26 and S27 (DRAFT for owner approval)

Candidate 64, ROADMAP_ENABLED still off. Owner decisions in force: D43 (safety policy `roadmap-text-p1`), D2 routing exception, strings S1-S25, S28, S29 approved. S26 and S27 were unwritten, so a refused or personal-risk request was refunded as `policy_block` with no learner-visible response. This change shows one.

## The two DRAFT strings (exact text, `packages/web/src/roadmap-strings.js`)

| # | When | DRAFT text |
|---|---|---|
| S26 | The card was held or refused by the safety check (decision `block`, or a hold that ends the delivery); refunded | I can't make this explanation. It is outside what I can create here. You were not charged. |
| S27 | The learner's own words show signs of danger (safety action `pause_support`); refunded | I did not make this explanation, and you were not charged. If you are in danger or thinking about hurting yourself, please call your local emergency number or a crisis line in your area. You do not have to deal with this alone. |

Both are short, non-clinical, name no diagnosis, no category, no model, no price. S27 points to local emergency services or a crisis line in the learner's area (no number is hard-coded because the learner's country is not known). The owner replaces or approves the exact text; until then they are marked `DRAFT` in the strings file. A reworded string changes only that file.

## Behavior (D43 items 4, 8, 10)

- Failure class stays `policy_block` (refunded, no automatic retry). The learner view of that result now carries `failure.code` `policy_block` (S26) or `personal_risk` (S27, read from the stored safety record `action: pause_support`) instead of the generic S20 sentence, and offers Replace and Omit only (Retry would be refused again).
- No card is delivered, the learner charge is refunded and recorded (`usage_adjustments`), and no second generation is made.
- Tests: `packages/control-plane/test/roadmap-loop.test.js` ("a card held for safety shows the S26 message", "a learner's own signs of danger show the S27 support message"). Doubles only: the classifier is a stub, so classifier thresholds and false-allow rates remain unmeasured (see r4-prerequisites.md).

## Also in candidate 64: per-learner settings

`roadmapDeps` now defaults its `settings` seam to the learner's saved Auto-suggest (`learn_user_settings`, R2) and the canvas coaching mode (`learn_coaching_state.mode`), read-only. `app-worker.js` reuses the `dev-worker.js` mount, so the one `roadmapDeps(env, ctx)` call covers both. Test: "invitations follow the learner's saved Auto-suggest and canvas mode".
