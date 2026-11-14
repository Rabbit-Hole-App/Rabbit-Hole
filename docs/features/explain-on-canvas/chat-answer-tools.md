# Chat answer tools flag (CHAT.02)

Status: built and tested with test doubles. **Off by default.** Live model quality is **unverified**: no authorized provider run has compared the answer model's tool choices with the labeled cases.

## What it does

Today an ordinary Chat message first goes to the JEV classifier (`POST /api/learn/chat/route`), and only then to `POST /api/learn/ask`. With the flag on for a mode, the route answers `route: "answer", via: "model"` with no classifier call, and the ask turn gives the answer model the eligible tools as native function definitions (`packages/control-plane/src/chat-tools.js`). The model can answer, ask one focused question, or request one tool. It never forces a tool (`tool_choice` auto, one call at a time, one request per answer).

- **Motion** keeps its signed in-answer review (`propose_generation`). Its description now states the facts the model needs: visual timed explainer, audio off so it cannot narrate, not interactive. A `requirements` field lets the model state what the learner required; a narration or interactivity requirement Motion cannot meet is refused before any review, and the model is told what does fit.
- **Direct tools** (`run_diagram`, `run_graph`, `run_code`, `run_flashcards`, `run_quiz`, `run_youtube`, `run_wikipedia`, `run_arxiv`, `run_image`, `run_3d`, plus `run_explain` where `EXPLAIN_V2_ENABLED` is true and `run_generate_image` where the caller may generate images) are only requests. The server checks availability, the arguments and the fit, then sends `{command, args}` in `answer_meta.toolRequest`. The browser runs the command's existing handler, exactly as a router decision does. The server executes nothing, creates no job and holds no credit.
- A call the server rejects (unfit, unavailable, repeated, malformed) goes back to the model as an error with the qualified alternatives, so it can recover in the same answer: a qualified alternative, else one focused question, else useful help in Chat with a next step.
- `answer_only` turns (CHAT.01) stay absolute: no tools of any kind.

## What is not covered

- `/whiteboard`, `/animation`, `/cad` and every Tutor command adapter (R12) are **not** offered from free text. R12 is on hold.
- A waiting Explain or Animation plan still takes the next plain message as a refinement in the browser (`ask.jsx`), before the route is asked. A waiting Motion plan is already model-driven: ordinary conversation beside it does not revise it. Making the Explain and Animation case intent-based needs the waiting plan sent to the server and a refine tool; it is left as is.
- The Contents (outline-only, wire `tutor`) conversation never uses this path.
- Slash commands, picked capabilities, Tutor roadmap actions and Edit targets use their existing handlers and are unchanged.

## Turning it on, per mode

`CHAT_ANSWER_TOOLS` is a comma list of wire modes, or `all`: `ask`, `auto`. Ordinary Tutor messages travel as `auto`. Unset means today's behavior for every mode. It runs on the app Worker, so it is a plain var in `packages/web/wrangler.rabbit-hole-prod.jsonc`:

```
"CHAT_ANSWER_TOOLS": "auto",
```

Enable one mode at a time, after the fixture comparison below. Nothing sets it in this repository.

## Rollback

Remove the var (or set it empty) and deploy. The next message uses the JEV preflight again. No data migration.

## Before enabling: what is still unverified

The 40 shared routing cases (`packages/control-plane/test/fixtures/chat-routing`) prove wiring with a scripted model. To compare missed and unnecessary tool requests, and time to first reply against the JEV path, the real candidate model has to run those cases with a selection-only stop. That spends provider money and needs the owner's authorization first (see `scripts/routing-live-eval.mjs`, which refuses to run without an explicit approval variable).
