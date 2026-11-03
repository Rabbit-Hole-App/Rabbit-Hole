# /animation billing: escrow

Owner decision 2026-11-03 (verbatim): "a rejected generation is charged to the learner and the failure message doesn't state the
charge. it should not be charged and should be refunded. so think of it like we put the credits in an escrow and if successful we
charge, if not refunded." Follow-ups, same day: the failure message is short, credits only, and says **"You have not been charged."**
everywhere (one phrase); a job that fails, is retried and then succeeds is charged **only its final attempt**; the plan phase stays
charged; at most 5 refunded generations per learner per day.

**This replaces the 2026-11-02 rule in `fix.md`**: a billed reply the job cannot use (an output limit, an invalid turn, a review that
rejected the scene) no longer "stays used". Any call of a generation attempt that ended without a result is refunded, and the card
says "You have not been charged." instead of "It used N AI credits." The old sentences remain only for a failed plan (before Generate).

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
  bound while it runs and settles at its actual cost, as before. The learner's meter therefore shows the current attempt's cost
  climbing while it runs.
- **An attempt that fails or is stopped with no result**: every settled call of its generation stage is refunded in full the moment
  it ends (`refundEscrow`). The attempt keeps its recorded provider cost, so the platform's ledger and the owner telemetry still
  show what the model cost (the platform keeps that cost); only `usage_attempt_detail.refunded_micros` and an audit row in
  `usage_adjustments` (reason `animation_failed_refund:<attempt>`, negative micros) change.
- **ready**: the generation calls of the **final attempt** stay charged at their actual settled cost, once.
- **Final attempt, defined from the job record**: the job's `attempt` number when it was accepted (`accept`). A call record carries
  the `attempt` it was made in (`paidCall`), so the final attempt's calls are the generation-phase calls with
  `attempt === job.attempt`, its author, review and repair calls, including its own automatic stage retry and its repair rounds.
  Try again and Render again (`retry`) are what start the next attempt; an automatic retry of a busy stage does not. The attempt
  that failed was refunded when it failed, and `retry` refunds it again first (idempotent) in case that write was lost, so the
  ledger holds exactly the final attempt's calls unrefunded when the job reaches ready. Nothing is ever taken back: the earlier
  attempts of a job that reaches ready stay refunded, even when the final attempt reused their draft or artifact.
- **Plan phase** (`ANIMATION_BILLING.planPhaseRefunded`, `animation-policy.js`): DEFAULT false. The plan calls stay charged, because
  the learner received a plan. Flip it to true and the plan calls of a job that ends without a result come back too; the failure
  words follow the same constant.
- **Provider interruptions** stay free as before; they say it in the same words.

## Exactly once

The unit is the usage attempt (one per call, an `animation-*` id). `refundAttempt` is one guarded UPDATE
(`refunded_micros = 0` and cost settled), so a refund of a call happens once however often it is requested. `refundEscrow` runs:
1. at every end without a result (`finishUsage`, from `stopWith`, `failed`, `reconcile`, `stop`);
2. after a call that settles late, when the job is already failed or stopped (`paidCall`; a Stop does not cancel the request in flight);
3. on every status read of a failed or stopped job (`get`), which makes a refund whose write failed;
4. when a Try again or Render again starts the next attempt (`retry`), before that attempt makes a call.

All four are idempotent and only ever run while the job is failed or stopped, so a replayed transition, a restarted object or a
repeated read refunds nothing twice and never touches the calls of an attempt that is still running. A write that fails is logged and
left for the next of the four; the job's own state is never held for it.

Jobs made before this change (no `escrow` flag on the stored record) keep the rules they were made under: no refund and the old
words. Without the flag the status read would have refunded every old failed job on the day it shipped.

## What the learner is told

Credits only, one phrase, after the reason: "The scene did not pass its checks. You have not been charged." It is on the card, in the
Chat explanation, and for Stop as "Stopped. You have not been charged." (the job view carries it as `usage.note`; `usage.credits` is
the credits the job kept: the plan, plus the current or final attempt's calls). It is true in every case, whether the attempt's calls
were charged and then refunded, or never charged (provider busy, an interrupted call, a refusal, Stop before any call settled). The
plan phase is not mentioned. A failed plan (before Generate) keeps "It used N AI credits." when it was charged; its zero-charge phrase
is now the same "You have not been charged." (it was "You are not charged for it."). The Try again button text is unchanged: it says
the most that attempt may use ("using up to N AI credits"), which is still what it is charged if it succeeds.

## The cost guard (owner confirmed)

A failed generation is free to the learner and costs the platform its model price (observed US$0.18 to 0.80, worst case about
US$3.2 to 4.2). `ANIMATION_BILLING.freeFailuresPerDay` (5) caps the failed attempts refunded to one learner in a rolling 24 hours:
past it, Generate (and a paid Try again) is refused with "You have reached today's limit of free retries. Try again tomorrow."
(429, code `spend_limited`, reason `free_retries_exhausted`, the shared refusal body and toast). It counts distinct (job, attempt)
pairs from `usage_adjustments`, so a job that failed twice and then succeeded counts two, and an attempt that never cost the learner
anything (provider busy) counts none. The platform's own daily dollar cap is untouched.

## Not changed, and not verified

No schema change and no migration: the refund uses `usage_attempt_detail` (0027) and `usage_adjustments` (0022), already in
production. Not verified here: the production ledger (no read access), and a real provider run (no paid call was made); the tests run
the real object, ledger and refund writer on SQLite with a fake provider. In-flight jobs at the moment this ships keep the old
rules. A Stop does not cancel a request already sent, so its refund arrives when that call settles (up to the 120 s call deadline).
Browser behavior of the Stopped line is covered by the client unit test only, not run in a browser.
