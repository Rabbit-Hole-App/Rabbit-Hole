# R4 contract: states and replay invariants

Source: tutor-roadmap v1.4 section 4.3 (same text as v1.3), 4.4, 5.2. Code draft: `packages/control-plane/src/roadmap/states.js` (pure, no imports, unreferenced by any existing module). Tests: `packages/control-plane/test/roadmap-states.test.js` (15 tests, all pass). The module is the only place that names states; routes, store, client and tests import it.

Status: DRAFT CONTRACT. Nothing on main imports it. Verified = the module's behavior is proven by its own tests; the rules themselves come from the roadmap, not from existing code (there is no roadmap code on main: `git grep -il roadmap` finds only unrelated comments in `chat-modes.js:135`, `generation-proposal.js:45`, `index.js:818,2403`, `learn-models.js:106`).

## 1. Dimensions

| Record | States (verbatim from 4.3) |
|---|---|
| Roadmap | `draft questioning proposed active paused completed ended failed` |
| Step | `planned proposed generating delivered incomplete cancelled skipped already_understood` (answered and card-removed are metadata, not states) |
| Proposal | `checking held pending accepted cancelled superseded blocked` |
| Result generation | `pending generating generated failed expired` |
| Result validation | `pending checking passed held blocked` plus boolean `stale` |
| Result decision | `none accepted cancelled superseded` |
| Result delivery | `not_delivered delivered removed` (+ card id, board-save acknowledgement) |
| Billing outcome | `pending settled refunded failed zero_priced` |
| Reconciliation (extension) | `none required complete`: an unknown provider outcome is a separate dimension, see README Gaps G9 |

A roadmap revision has its own version and acceptance: it is a new plan version (`roadmap_plan_versions`), not a roadmap state.

## 2. Transition tables

`state -> allowed next states`. Anything not listed is `invalid_transition` (HTTP 409).

```
roadmap     draft        -> questioning proposed failed ended
            questioning  -> draft proposed failed ended
            proposed     -> active questioning failed ended
            active       -> paused completed failed ended
            paused       -> active completed ended failed
            completed    -> active ended          (active only with an accepted revision: continuing past the stopping point)
            failed       -> draft ended
            ended        -> (final)
step        planned      -> proposed skipped already_understood cancelled
            proposed     -> generating cancelled skipped already_understood
            generating   -> delivered incomplete   (accepted work is never cancelled by Cancel)
            incomplete   -> generating proposed skipped   (Retry / Replace / Omit, D36)
            cancelled    -> proposed skipped      (only an explicit learner action re-proposes, 2.3)
            delivered skipped already_understood -> (final)
proposal    checking     -> held pending blocked superseded cancelled
            held         -> checking pending blocked superseded cancelled
            pending      -> accepted cancelled superseded checking   (checking = a changed input made it stale)
            blocked      -> superseded
            accepted cancelled superseded -> (final)
generation  pending -> generating expired ; generating -> generated failed ; generated -> expired ; failed -> pending expired (guard: new operation identity)
validation  pending -> checking ; checking -> passed held blocked pending ; held -> checking blocked ; passed -> pending (stale) ; blocked -> (final)
decision    none -> accepted cancelled superseded ; others final
delivery    not_delivered -> delivered -> removed (final; the delivery record is kept, D7)
billing     pending -> settled refunded failed zero_priced ; settled -> refunded ; failed -> pending refunded ; refunded -> pending ; zero_priced -> (final)
            failed->pending and refunded->pending need guard "new authorized recovery action" (5.2)
```

Choices the roadmap leaves open, taken as the safer reading (all recorded in README Gaps): a cancelled step returns only through an explicit learner proposal; `completed -> active` needs an accepted revision; a stale `pending` proposal returns to `checking`; `failed` roadmap may return to `draft` (retry planning).

## 3. Derived rules (functions in the module)

- `isUnfinishedRoadmap`: `draft questioning proposed active paused`. One per learner and board (4.3). Enforced in D1 by the partial unique index in `records.md` (the module only names the set).
- `canAcceptProposal`: roadmap `active`, proposal `pending`, result validation `passed`, not stale. Else `roadmap_not_active | proposal_not_pending | proposal_not_checked`.
- `canDeliver` (4.4, first publication): actor has access, decision `accepted`, generation `generated`, validation `passed` and not stale, reconciliation not `required`, billing `settled` or `zero_priced`, delivery `not_delivered`. Each failure names its reason.
- `resultReadable`: the entitlement predicate for every result and asset route. Same conditions, except an already-delivered (or removed) result stays readable by its entitled actor. A prepared result that passed checks stays unreadable while `decision = none`.
- `resolveAction`: replay (below).
- `actionStartsFrom(action, roadmapState)`: which roadmap states each action may start from (`ACTIONS`). Deliver, Retry, Replace and Omit work while paused so that accepted work can finish when the learner cancels or switches to Ask.

## 4. Replay invariants

Every mutating route carries `actionKey` (client, `^[A-Za-z0-9_-]{8,128}$`, same alphabet as `CLIENT_KEY` at `learn-usage.js:78`) and `expectedRevision` (integer, the roadmap revision the client last saw). The server computes `fingerprint = sha256(actor | action | target ids | proposalVersion | resultFingerprint)` and calls `resolveAction`:

1. A recorded row for `(org, owner_user_id, actionKey)` with the same fingerprint: replay, HTTP status and JSON body are the recorded outcome (no second purchase, no second card).
2. Same key, different fingerprint: 409 `action_key_reused`.
3. No row, `expectedRevision != roadmap.revision`: 409 `stale_revision`, body carries the current state. A missing `expectedRevision` is refused, never defaulted.
4. Otherwise apply: transition, bump `roadmap.revision`, write the action row, all in one D1 batch (the same guard pattern as `admitSpend`, `learn-spend-ledger.js:87`).

"First valid action wins": two devices accepting the same proposal with different keys both pass step 3 only for the first; the second sees a bumped revision and gets 409 with the current state (accepted), never a second charge.

## 5. Invariants a test must keep

- Exactly the 4.3 lists (copied into the test, so a rename fails).
- Every state has a table row, every target is a state, no self loops.
- `accepted` proposal, `delivered` step, `accepted` decision, `removed` delivery are final.
- Refunded or failed billing returns to `pending` only with `recovery: true`, and `settled -> pending` is never allowed.
- A changed input yields `{ validation: 'pending', stale: true }` and removes deliverability.

## 6. What State still has to decide (not frozen here)

Error body shape is in `api.md`. Revision granularity (one integer per roadmap, bumped by every mutating action) is frozen. Proposal version and plan version are separate integers. Which module owns persistence of the tables is in `records.md`.
