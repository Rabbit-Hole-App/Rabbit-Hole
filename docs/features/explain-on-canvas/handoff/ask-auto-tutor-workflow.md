# Rabbit Hole — Ask, Auto, and Tutor workflow

Routing reference for the Tutor handoff. The shared reply path is the target design. The staged rollout is tracked by `CHAT.01` and `CHAT.02` in checklist §4.5.

## Workflow

```mermaid
flowchart TD
    Send["Send in Ask, Auto, or Tutor"] --> Entry{"Explicit command or Tutor action?"}
    Entry -->|"Yes"| Handler["Use the existing handler"]
    Entry -->|"Natural language"| Intent["Read intent and eligible tools"]
    Intent -->|"Reply"| Evidence["Resolve evidence if needed"]
    Intent -->|"Clarify"| Clarify["Ask one focused question"]
    Intent -->|"Output requested"| Fit{"Can the selected tool deliver it?"}
    Handler -->|"Eligible card brief"| Evidence
    Handler -->|"Explain on canvas"| Lesson["Follow Explain on Canvas workflow"]
    Handler -->|"Tool offer blocked"| Recover{"What can still advance the goal?"}
    Fit -->|"Ready"| Evidence
    Fit -->|"Blocked"| Recover
    Evidence -->|"Reply supported"| Chat["Reply in Chat"]
    Evidence -->|"Card brief supported"| Review["Existing action or Generate / Edit review"]
    Evidence -->|"Essential gap unresolved"| Recover
    Recover -->|"Qualified alternative"| Evidence
    Recover -->|"Missing detail"| Clarify
    Recover -->|"Tool path unavailable"| Chat
```

| Mode | Ordinary message | Explicit action |
| --- | --- | --- |
| Ask | Answer using the authorized context. Honor an eligible tool request and pause unsolicited Tutor initiative. | Use the named command or explicit Tutor action. |
| Auto | Reply, clarify, or request an eligible tool based on the full message. Auto-suggest controls unsolicited Tutor proposals. | Use the selected command or action. |
| Tutor | Use the shared reply path with the current lesson context. | Roadmap acceptance, targeted edits, and **Next card** use the Tutor controller and the accepted step. |

The model sees the full prompt and the eligible function definitions, including each function’s name, argument schema, output, use cases, and limits. The server validates the selected output, inputs, access, and tool readiness before review. A proposed alternative follows the existing approval, and the learner chooses any change to an explicit requirement.

When R8a is enabled, resolve the intent and authorized context before using its shared evidence check for a reply or eligible card brief. Reuse relevant evidence first and search Exa only for a material public gap within scope. A card brief needs its evidence before the existing review. Continue with the supported portion or ask one focused question if a gap remains. Research timing, limits and the closed **Sources (n)** disclosure are in [roadmap §10.2](tutor-roadmap-v1.4.md#102-research-and-calculation). Use the [shared tool-call workflow](tutor-roadmap-v1.4.md#931-shared-tool-call-workflow) to check known blockers before offering tools and to validate an exact call at dispatch.

## Rollout and checks

- `CHAT.01` lets a recoverable JEV failure continue once through the text-only reply path in the same thread and removes the tool-check banner and buttons.
- `CHAT.02` moves the ordinary-message decision into the answer turn after parity checks for the affected modes and enabled capabilities. Legacy JEV routing stays available for scopes awaiting qualification.
- The shared test corpus has 20 intent cases and 20 Send cases under `packages/control-plane/test/fixtures/chat-routing/`. The Send cases are split by mode. Capture the validated route before any tool execution.

Reviewed handoff snapshot `6b3fff7e1585f6814271f0290d9d91f3bf8e5445`. Deployed code examined at `8deb778fa2b0442b4ac494f9d94e88fffd72a6c3`.

https://github.com/Rabbit-Hole-App/Rabbit-Hole/commit/6b3fff7e1585f6814271f0290d9d91f3bf8e5445
