# /animation billing: escrow

Owner decision 2026-11-03 (verbatim): "a rejected generation is charged to the learner and the failure message doesn't state the
charge. it should not be charged and should be refunded. so think of it like we put the credits in an escrow and if successful we
charge, if not refunded." Message wording (owner, same day): short, credits only, either "Credits refunded." or "You have not been
charged."

This replaces the 2026-11-02 rule in `fix.md` ("a billed reply the job cannot use ... its credits stay used", and the "It used N AI
credits." sentence for a failed generation). It does not change the plan phase's charge words (below).

## What was true before (production caf7ee9bc)

Every model call of a job is admitted and settled on its own by `spendTransport` (`learn-spend.js` 66-104) under a usage action per
phase: the plan calls under `job.prepKey`, the build's author, review and repair calls under `job.actionKey`
(`animation-job.js` `transport`/`finishUsage`). A settled call counts as used in the learner's balance (`USED_SUM`,
`learn-usage.js` 438), and nothing refunded it: the job only closed its usage actions (`finishUsage`, `UPDATE usage_actions`). So:

| Job ends | Learner charged | Where |
|---|---|---|
| ready | every settled call | `accept` |
| failed (rounds, budget, size_limit, checks, output_limit, deadline, error) | every settled call (run 5: 122.53 credits) | `stopWith`, `failed` |
| failed, provider busy (`provider_unavailable`) | nothing: the call is refused and settles at 0 | `paidCall`, `learn-spend.js` 100 |
| failed, interrupted call (`reconcile`) | nothing for that call: its attempt ends with cost unknown, which holds nothing | `learn-usage.js` 440-452 |
| stopped (Stop) | every call that settled before Stop or settles after it | `stop` |
| abandoned or expired | there is no such job state: a job past its 10 minute deadline fails `deadline`; a plan nobody presses Generate on simply waits (plan calls only) | `advance` |

Other features already give a failed route's charges back: `refundFailedAction` (`learn-usage.js` 386-402, CAD and the route
boundary `finishWithResponse`) and `refundAttempt` (Motion, `learn-video.js` 340-371). A Durable Object job's calls run outside the
request that made them, so none of that reached `/animation`.

## The model

- **Generate** still requires the whole build's worst case to fit the learner's available allowance (`admitGeneration`, unchanged:
  `left - reserved >= generationMicros`). That is a check, not a hold (`animation-policy.js` header); each call then reserves its own
  bound while it runs and settles at its actual cost, as before. The learner's meter therefore shows the build's cost climbing while
  it runs.
- **ready**: the generation stage stays charged at its actual settled cost, once. Nothing is refunded.
- **failed or stopped with no result**: every settled call of the generation stage is refunded in full (`refundEscrow`). The learner's
  net change for the job is the plan phase only. The attempt keeps its recorded provider cost, so the platform's ledger and the
  owner telemetry still show what the model cost (the platform keeps that cost); only `usage_attempt_detail.refunded_micros` and an
  audit row in `usage_adjustments` (reason `animation_failed_refund`, negative micros) change.
- **Plan phase** (`ANIMATION_BILLING.planPhaseRefunded`, `animation-policy.js`): DEFAULT false. The plan calls stay charged, because
  the learner received a plan. Flip it to true and the plan calls of a job that ends without a result come back too; the
  failure words follow the same constant.
- **Retried builds**: Try again and Render again keep the same job. A refund made when the build failed is taken back when the same
  job later reaches ready (`chargeEscrow`: refund set to 0, a positive audit row `animation_ready_charge`), so a ready job is always
  charged its whole generation once.
- **Provider interruptions** stay free as before; they say it in the same words.

## Exactly once

The unit is the usage attempt (one per call, an `animation-*` id). `refundAttempt` is one guarded UPDATE
(`refunded_micros = 0` and cost settled), so a refund of an attempt happens once however often it is requested. `refundEscrow` runs:
1. at every end without a result (`finishUsage`, from `stopWith`, `failed`, `reconcile`, `stop`);
2. after a call that settles late, when the job is already failed or stopped (`paidCall`; a Stop does not cancel the request in flight);
3. on every status read of a failed or stopped job (`get`), which makes a refund whose write failed. All three are idempotent, so a
   replayed transition, a restarted object or a repeated read refunds nothing twice. `chargeEscrow` is guarded the same way (the
   UPDATE names the refund it reverses).

A write that fails is logged and left for the next of the three; the job's own state is never held for it.

Jobs made before this change (no `escrow` flag on the stored record) keep the rules they were made under: no refund and the old
words. Without the flag the status read would have refunded every old failed job on the day it shipped.

## What the learner is told

Credits only, in a few words, after the reason: "The scene did not pass its checks. Credits refunded." Which of the two phrases is
decided by what the job's call ledger recorded for the generation stage: **Credits refunded.** when a call had a measured cost (it
was charged, then refunded), **You have not been charged.** when none had (provider busy, an interrupted call, a refusal, Stop before
any call settled). The plan phase is not mentioned. The same words appear on the card, in the Chat explanation and, for Stop, as
"Stopped. Credits refunded." (the job view carries them as `usage.note`; `usage.credits` is the credits the job kept). The
before-Generate wording ("It used N AI credits." for a failed plan) is unchanged, except that a free provider refusal now says "You
have not been charged." instead of "You are not charged for it."

## The cost guard (owner to confirm)

A failed generation is free to the learner and costs the platform its model price (observed US$0.18 to 0.80, worst case about
US$3.2 to 4.2). `ANIMATION_BILLING.freeFailuresPerDay` (DEFAULT 5) caps the generations refunded to one learner in a rolling 24
hours: past it, Generate (and a paid Try again) is refused with "You have reached today's limit of free retries. Try again
tomorrow." (429, code `spend_limited`, reason `free_retries_exhausted`, the shared refusal body and toast). It counts distinct
refunded jobs from `usage_adjustments`, so a job that was refunded and later became ready nets to zero and does not count, and a
job that never cost the learner anything (provider busy) does not count. The platform's own daily dollar cap is untouched.

## Defaults for the owner to decide

1. Plan-phase calls stay charged (`planPhaseRefunded: false`).
2. 5 refunded generations per learner per 24 hours (`freeFailuresPerDay: 5`); the refusal wording.
3. The two phrases and their choice rule above.
4. A retried build is charged again when it reaches ready.

## Not changed, and not verified

No schema change and no migration: the refund uses `usage_attempt_detail` (0027) and `usage_adjustments` (0022), already in
production. Not verified here: the production ledger (no read access), and a real provider run (no paid call was made); the tests run
the real object, ledger and refund writer on SQLite with a fake provider. In-flight jobs at the moment this ships keep the old
rules. A Stop does not cancel a request already sent, so its refund arrives when that call settles (up to the 120 s call deadline).
Browser behavior of the Stopped line is covered by the client unit test only, not run in a browser.
