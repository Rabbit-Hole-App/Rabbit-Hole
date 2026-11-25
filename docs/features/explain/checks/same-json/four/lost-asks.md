# Every lost ask with all its events, verbatim

3 asks without a card (all arms, all sets). Each block: idx, arm, set, reference, depth, ask, seed, error code, failure message, attempts, then the events array exactly as recorded.

## idx 12, MAIN, four, top-k, detailed, ask 2, seed bench-12-2

errorCode: provider_error

failureMessage: Artifact generation unavailable (model HTTP 404). Try again.

attempts: [{"provider":"google","model":"gemini-3.5-flash-lite","outcome":"validation_error","repairs":1,"failedOn":["validation_error","validation_error"],"issues":["explanation_missing_visual: the card needs one to three visuals, an rh-diagram or an rh-illustration fence, each with prose before and after it; add one that shows what the question asks."]},{"provider":"fireworks","model":"accounts/fireworks/models/gpt-oss-120b","outcome":"provider_error"}]

events:

```json
[
 {
  "event": "learn_artifact_invalid",
  "primitive": "explanation",
  "attempt": 0,
  "error": "explanation_missing_visual: the card needs one to three visuals, an rh-diagram or an rh-illustration fence, each with prose before and after it; add one that shows what the question asks."
 },
 {
  "event": "learn_artifact_invalid",
  "primitive": "explanation",
  "attempt": 1,
  "error": "explanation_missing_visual: the card needs one to three visuals, an rh-diagram or an rh-illustration fence, each with prose before and after it; add one that shows what the question asks."
 }
]
```

## idx 14, MAIN, four, top-k, detailed, ask 4, seed bench-14-4

errorCode: provider_error

failureMessage: Artifact generation unavailable (model HTTP 404). Try again.

attempts: [{"provider":"google","model":"gemini-3.5-flash-lite","outcome":"validation_error","repairs":1,"failedOn":["validation_error","validation_error"],"issues":["explanation_missing_visual: the card needs one to three visuals, an rh-diagram or an rh-illustration fence, each with prose before and after it; add one that shows what the question asks."]},{"provider":"fireworks","model":"accounts/fireworks/models/gpt-oss-120b","outcome":"provider_error"}]

events:

```json
[
 {
  "event": "learn_artifact_invalid",
  "primitive": "explanation",
  "attempt": 0,
  "error": "explanation_missing_visual: the card needs one to three visuals, an rh-diagram or an rh-illustration fence, each with prose before and after it; add one that shows what the question asks."
 },
 {
  "event": "learn_artifact_invalid",
  "primitive": "explanation",
  "attempt": 1,
  "error": "explanation_missing_visual: the card needs one to three visuals, an rh-diagram or an rh-illustration fence, each with prose before and after it; add one that shows what the question asks."
 }
]
```

## idx 74, BRANCH, four, ml-self-attention-token-links, detailed, ask 4, seed bench-74-4

errorCode: provider_error

failureMessage: Artifact generation unavailable (model HTTP 404). Try again.

attempts: [{"provider":"google","model":"gemini-3.5-flash-lite","outcome":"validation_error","repairs":1,"failedOn":["validation_error","validation_error"],"issues":["explanation_bad_token: {{d:1.diagram.queries.0.weights.1}} does not name a number in diagram 1. A number the figure computes is written as {{d:N.path}} (the figure's own number, filled in by the server), never typed"]},{"provider":"fireworks","model":"accounts/fireworks/models/gpt-oss-120b","outcome":"provider_error"}]

events:

```json
[
 {
  "event": "learn_artifact_invalid",
  "primitive": "explanation",
  "attempt": 0,
  "error": "explanation_bad_token: {{d:1.diagram.queries.0.weights.1}} does not name a number in diagram 1. A number the figure computes is written as {{d:N.path}} (the figure's own number, filled in by the server), never typed"
 },
 {
  "event": "learn_artifact_invalid",
  "primitive": "explanation",
  "attempt": 1,
  "error": "explanation_bad_token: {{d:1.diagram.queries.0.weights.1}} does not name a number in diagram 1. A number the figure computes is written as {{d:N.path}} (the figure's own number, filled in by the server), never typed"
 }
]
```
