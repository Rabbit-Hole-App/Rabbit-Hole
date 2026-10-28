# Motion credit disclosure and the signed quote

Owner decisions, 2026-10-26 (they replace the earlier "the reservation stays internal" and "about N credits" wording in
`rabbit-hole-motion-v1-harness-spec.md` and the card tests):

- **D1a.** Motion's per-job validation ceiling is approved at US$3.50. That raise is a separate release; this document
  and its change do not touch `MOTION_JOB_CEILING_USD`.
- **D1b.** Owner-only acceptance may proceed knowing one job can consume up to 350 AI credits.
- Public Motion is never activated with "about 100 credits" as the only explanation of a possible 350-credit charge.
  Pricing or settings changes that affect consent require the person to reconfirm.
- Users see AI credits only. Dollars, micros and currency stay internal (CLAUDE.md "Standing owner rules").

- **Policy candidate (HELD, not approved):** a platform stop of US$5.00 with a learner maximum of 500 credits, one values commit, is described in
  `motion-admission-policy.md`. Until the owner approves it this document's 350-credit maximum and US$3.50 ceiling are the approved numbers.

## The three numbers

They are recorded, signed, sent and shown separately. None is derived from another.

| Number | Meaning | Source (Worker variable) | Today |
|---|---|---|---|
| Estimate | A typical job's measured cost. Not a promise. | `MOTION_ESTIMATE_USD` (or the price table, `MOTION_PRICE_TABLE`) | 100 credits (US$1.00) |
| Maximum possible charge | The most one job can ever charge this person. The orchestrator's hard stop is at or below it. | `MOTION_MAX_CHARGE_USD` | 350 credits (US$3.50) |
| Temporary reservation | Held from the allowance while a job runs so it can start; whatever is not used is released. It is not the expected charge and not the maximum. | `MOTION_JOB_RESERVATION_USD` | 896 credits (US$8.96) |

The orchestrator's per-job ceiling (`MOTION_JOB_CEILING_USD`, `packages/learn-render/motion/service/fly.orchestrator.toml`)
is a separate configuration read only by the orchestrator process; it is not part of the signed quote. The maximum is its
Worker-side counterpart, and a test keeps the two from drifting (below).

## Who sees what

- **The person (credits only):** all three, on the Motion proposal card (`GenerationProposalCard.jsx`) and on the older
  video card's paid confirmation (`learn-video-label.js motionConfirm`). Failed jobs show charged, refunded and released
  apart as before (`motionUsageLine`).
- **Server responses:** `usage` on the signed proposal is `{ estimate_credits, max_credits, reserve_credits, inputs, price_version }`;
  `LearnVideos.list()` sends `motionEstimateCredits`, `motionMaxCredits` and `motionHoldCredits`, the last two only when
  the first is sent and a valid maximum is configured. No key or string names dollars, micros or a currency
  (`test/no-money.js` scans them in `motion-credit-disclosure.test.js` and `motion-allowance.test.js`).
- **Operators only:** the dollar figures in the Worker configuration, the provider cost (`usage_operations.cost_usd`,
  `job.providerCost`) and the orchestrator ceiling.

## Confirmation card copy (credits only, plain language)

Owner 2026-10-28 (replaces the three-line wording of 2026-10-26): shorter, and the estimate comes from measured earlier videos.

```
About 158 AI credits.                              (estimate_basis "measured": the average actual cost of earlier videos)
Estimated cost: 100 AI credits                     (estimate_basis "flat", or no basis: the single configured price, /explain)
It never costs more than 500 AI credits.
You need 896 AI credits available to start; unused credits are released.   (only when the person's credits left are below the hold)
```

`usage.estimate_basis` is derived on the server from the quote's `price_version` ("flat" = `MOTION_ESTIMATE_USD`, anything else = a
`MOTION_PRICE_TABLE` version), the same version the proposal signs in `input.binding`, so the wording cannot disagree with the signed
quote; moving between flat and a table (or between table versions) makes an open card stale once and the person reconfirms. The hold is
enforced against the learner's allowance (`admitSpend`: used + held + the hold must fit), so it can refuse a start even when the estimate
is far lower; the card says it only when the account usage (`/api/learn/usage`, enforced) shows fewer credits left than the hold, and
says nothing when that is unknown. The measured table is produced by `motion-price-table.mjs` (read-only, completed accepted videos only).
The maximum (500) and the hold (896) are unchanged.

The older video card's confirmation reads:
`This uses paid generation · estimated 100 credits, at most 350. 896 credits are held while it runs; whatever is not used is released.`

Rules: the estimate is never shown without the maximum. If the server cannot give both (no maximum configured, or no
estimate), the card shows "Price not available yet", its validation says the price is not known, and Generate is blocked
(`requires_max` in `generation-confirmation-schema.js`); the older card falls back to "This uses paid generation." with
no number. A card saved before this change has no maximum, so it is blocked and the person asks for it again in chat.
The older canvas video card (`motionConfirm`) still uses its previous sentence.

## The signed, versioned quote (reconfirmation rule)

`motionBinding` (`motion-settings.js`) is signed into every Motion proposal as `input.binding`:

`{ inputs, price_version, estimate_credits, max_credits, policy_version, renderer_config }`

Generate and Retry recompute it (`motionGenerationCheck`, run again after the hold by `motionExecutionCheck`). A quote is
stale, and the person must press Generate again after seeing the updated card, when any of these differ from what the card
was confirmed with:

1. the quote inputs (duration, aspect ratio);
2. the price version or the estimate;
3. the maximum possible charge;
4. the readiness policy version;
5. a proposal signed before the maximum existed (its binding has none).

The answer is `409 motion_quote_stale` with the updated quote (`price_version`, `estimate_credits`, `max_credits`,
`inputs`, credits only), before any hold, consumed proposal or orchestrator call. A different renderer configuration is
`409 motion_renderer_changed` (the card must be asked for again). A missing or invalid maximum is
`409 motion_max_unknown`. The reservation is not in the binding: it only decides whether Motion can start.

## Settle-time guard

`LearnVideos.settleMotion` (`learn-video.js`):

- A charge never exceeds the signed maximum. The charge is `min(provider cost, max_credits)` where the maximum is the
  signed binding's (the live maximum for a request that has no card). The provider's real cost is still recorded
  (`usage_operations.cost_usd`, `job.providerCost[].micros`, marked `capped`) and still counts toward the video's ceiling.
- Our own configuration, capacity and infrastructure failures stay zero-credit and release the whole reservation:
  every limit we set (`job_ceiling_insufficient`, `policy_rejected`, `call_limit`, `unknown_cost_bound`, `job_timeout`,
  `limit_unspecified`), the renderer failing, and our infrastructure or storage failing (`motion-failure.js`
  `isZeroCredit`, unchanged). The cap never turns a zero-credit failure into a charge.
- Unknown cost keeps its reservation pending, as before.

## Keeping the two ceilings from drifting, and gating R2

- `motion-credit-disclosure.test.js` parses the checked-in `wrangler.rabbit-hole-prod.jsonc` and
  `fly.orchestrator.toml` and fails unless `MOTION_MAX_CHARGE_USD` is at least the orchestrator's per-job ceiling
  (`min(hold, MOTION_JOB_CEILING_USD)`, and the whole hold when that line is removed) and at most the hold. Today the
  checked-in ceiling is US$2.00 (the US$3.50 raise is the separate release), so the displayed maximum is above the
  enforced stop, which is the safe direction. The ceiling stays through activation and any later public flip (owner 2026-10-27: the old R2 comment to remove it is withdrawn); removing it would make this
  test fail until the maximum is consciously raised to the hold, which needs a new explicit owner approval.
- **R2 gate** (`MOTION_GENERATION_PAUSED` off): the same test file builds the production Worker's variables with
  generation not paused and requires every Motion proposal to carry estimate, maximum and reservation, ordered
  estimate <= maximum <= reservation, and the card view to allow Generate. Removing `MOTION_MAX_CHARGE_USD` from the
  config fails it. The runtime backstop is the card (blocked without a maximum) and the Worker (`motion_max_unknown`).
- The web card has its own checks (`generation-proposal-card.test.mjs`, `generation-confirmation-card.test.mjs`) and the
  browser checks `motion-command-check.mjs` and `chat-generation-check.mjs` assert the three lines.

## Owner-only acceptance

Unchanged: while `MOTION_GENERATION_PAUSED` is "1", only `MOTION_ACCEPTANCE_EMAILS` may start, under the ordinary
admission, hold and settlement rules. The acceptance job now also has a signed maximum and the guard above.

## Not covered

- A /motion request that carries no proposal (no card) has no signed maximum; the guard falls back to the live Worker
  maximum at settle. The public Motion path creates a proposal first; this was not changed.
- The orchestrator is not changed and does not read the maximum.
- Verification status: unit tests (Worker, web) and the CI browser checks on the pushed SHA. Not deployed anywhere; no paid call.
