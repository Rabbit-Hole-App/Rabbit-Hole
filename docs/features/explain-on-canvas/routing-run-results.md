# Chat routing run results (40 shared cases)

**Candidate:** bdefe3a38e976efd941049ece6a7b7d6ae3a7ccb

Source: `packages/control-plane/test/chat-routing-fixtures.test.js` over `packages/control-plane/test/fixtures/chat-routing/` (checklist 4.5, Sets A and B). Each case starts at its real entry point and stops at the validated decision; execution spies assert zero downstream effects. The JEV classifier and the answer model are **doubles scripted from each case's own label**, so a pass here proves wiring and guards, never model quality.

**Live model quality: UNVERIFIED (no authorized provider run).** `scripts/routing-live-eval.mjs` runs the same cases against the real router and refuses to run without explicit spend approval.

## Summary

| Fixture | Cases | Pass | Miss | Wiring-fail |
| --- | ---: | ---: | ---: | ---: |
| intent.json | 20 | 15 | 5 | 0 |
| send/ask.json | 7 | 5 | 2 | 0 |
| send/auto.json | 7 | 4 | 3 | 0 |
| send/tutor.json | 7 | 6 | 1 | 0 |
| **All** | 41 | 30 | 11 | 0 |

40 cases plus 1 variant(s). A **miss** is an outcome the current path (JEV preflight over `CHAT_ROUTES`) cannot produce, kept for tuning; a **wiring-fail** is a guard or effect defect and fails the test.

## Cases

| Case | Mode | Entry | Expected | Observed | Scripted | Catalogue | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| INT-01 | auto | message | reply | reply | JEV answer | none | pass |
| INT-02 | auto | message | reply | reply | JEV answer | none | pass |
| INT-03 | auto | message | reply | reply | JEV answer | none | pass |
| INT-04 | auto | message | review [motion, whiteboard-video] | review [motion] | JEV motion | motion, whiteboard-video (not in CHAT_ROUTES) | pass |
| INT-05 | auto | message | review [motion] | review [motion] | JEV motion | motion | pass |
| INT-06 | auto | message | review [whiteboard-video] | reply | JEV answer (whiteboard-video is not in the chat catalogue (CHAT_ROUTES)) | whiteboard-video (not in CHAT_ROUTES) | miss |
| INT-07 | auto | message | review [animation] | reply | JEV answer (animation is not in the chat catalogue (CHAT_ROUTES)) | animation (not in CHAT_ROUTES) | miss |
| INT-08 | auto | message | review [explain] | review [explain] | JEV explain | explain | pass |
| INT-09 | auto | message | tool-handoff [diagram] | tool-handoff [diagram] | JEV diagram | diagram | pass |
| INT-10 | auto | message | tool-handoff [graph] | tool-handoff [graph] | JEV graph | graph | pass |
| INT-11 | auto | message | review [cad] | reply | JEV answer (cad is not in the chat catalogue (CHAT_ROUTES)) | cad (not in CHAT_ROUTES) | miss |
| INT-12 | auto | message | review [generate-image] | review [generate-image] | JEV generate-image | generate-image | pass |
| INT-13 | auto | message | search [image] | search [image] | JEV image | image | pass |
| INT-14 | auto | message | search [youtube] | search [youtube] | JEV youtube | youtube | pass |
| INT-15 | auto | message | tool-handoff [quiz] | tool-handoff [quiz] | JEV quiz | quiz | pass |
| INT-16 | auto | slash-command | named-command [code] | named-command [code] | none (explicit command) | code | pass |
| INT-17 | auto | message | clarify | clarify | JEV several | none | pass |
| INT-18 | auto | message | clarify | clarify | JEV several | none | pass |
| INT-19 | auto | message | review [whiteboard-video] | reply | JEV answer (whiteboard-video is not in the chat catalogue (CHAT_ROUTES)) | whiteboard-video (not in CHAT_ROUTES) | miss |
| INT-20 | auto | message | reply-with-recovery | reply | JEV answer | none | miss |
| SEND-01 | ask | message | reply | reply | JEV answer | none | pass |
| SEND-02 | ask | message | reply | reply | JEV answer | none | pass |
| SEND-03 | ask | message | search [youtube] | search [youtube] | JEV youtube | youtube | pass |
| SEND-04 | ask | slash-command | named-command [notebook] | named-command [notebook] | none (explicit command) | notebook (not in CHAT_ROUTES) | pass |
| SEND-05 | ask | message | review [whiteboard-video] | reply | JEV answer (whiteboard-video is not in the chat catalogue (CHAT_ROUTES)) | whiteboard-video (not in CHAT_ROUTES) | miss |
| SEND-05-NARRATION-UNAVAILABLE | ask | message | reply-with-recovery | reply | JEV answer | none | miss |
| SEND-06 | ask | message | answer-only | answer-only | JEV timeout | none | pass |
| SEND-07 | auto | message | review [motion] | review [motion] | JEV motion | motion | pass |
| SEND-08 | auto | message | review [animation] | reply | JEV answer (animation is not in the chat catalogue (CHAT_ROUTES)) | animation (not in CHAT_ROUTES) | miss |
| SEND-09 | auto | message | reply | reply | JEV answer | none | pass |
| SEND-10 | auto | slash-command | named-command [motion] | named-command [motion] | none (explicit command) | motion | pass |
| SEND-11 | auto | message | revise-proposal [motion] | revise-proposal [motion] | answer (JEV), then a revising propose_generation call (answer model) | motion | pass |
| SEND-12 | auto | message | review [whiteboard-video] | reply | JEV answer (whiteboard-video is not in the chat catalogue (CHAT_ROUTES)) | whiteboard-video (not in CHAT_ROUTES) | miss |
| SEND-13 | auto | message | reply-with-recovery | reply | JEV answer | none | miss |
| SEND-14 | tutor | message | reply | reply | JEV answer | none | pass |
| SEND-15 | tutor | message | revise-roadmap | revise-roadmap | none (no classifier call) | none | pass |
| SEND-16 | tutor | message | revise-brief [explain] | revise-brief [explain] | none (no classifier call) | explain | pass |
| SEND-17 | tutor | message | tool-handoff [diagram] | tool-handoff [diagram] | JEV diagram | diagram | pass |
| SEND-18 | tutor | message | reply | reply | JEV answer | none | pass |
| SEND-19 | tutor | message | clarify | clarify | JEV several | none | pass |
| SEND-20 | tutor | message | discard-stale | not exercised | none | none | miss |

## Misses to tune

- **INT-06** (expected review [whiteboard-video]): whiteboard-video is not in the chat catalogue (CHAT_ROUTES); observed reply
- **INT-07** (expected review [animation]): animation is not in the chat catalogue (CHAT_ROUTES); observed reply
- **INT-11** (expected review [cad]): cad is not in the chat catalogue (CHAT_ROUTES); observed reply
- **INT-19** (expected review [whiteboard-video]): whiteboard-video is not in the chat catalogue (CHAT_ROUTES); observed reply
- **INT-20** (expected reply-with-recovery): the current path has no recovery branch (CHAT.02): it can only reply
- **SEND-05** (expected review [whiteboard-video]): whiteboard-video is not in the chat catalogue (CHAT_ROUTES); observed reply
- **SEND-05-NARRATION-UNAVAILABLE** (expected reply-with-recovery): the current path has no recovery branch (CHAT.02): it can only reply
- **SEND-08** (expected review [animation]): animation is not in the chat catalogue (CHAT_ROUTES); observed reply
- **SEND-12** (expected review [whiteboard-video]): whiteboard-video is not in the chat catalogue (CHAT_ROUTES); observed reply
- **SEND-13** (expected reply-with-recovery): the current path has no recovery branch (CHAT.02): it can only reply
- **SEND-20** (expected discard-stale): the thread-switch guard is a closure inside AskPanel.send (ask.jsx late()); there is no node seam to drive it, only the source guard below

## Wiring failures

None.
