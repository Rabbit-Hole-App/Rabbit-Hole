# Home ask

Owner decisions, 2026-10-04.

## Where it fits

- **Home** is "what should I do now?": a personal dashboard plus an assistant. Ask questions, resume canvases and
  Rabbit Holes, see projects and recent activity, start learning something new.
- **Library** is "what do I own or have saved?": your canvases, forks, imported repositories, and things shared
  with you. Search, organize, reopen, rename, share, fork.
- **Explore** is "what have other people made?": public and shared canvases, learning paths, community Rabbit
  Holes, fork counts. Fork one into your Library.
  - Explore is in the sidebar with an empty state for now, because nothing can be public yet.
  - The intended path is Explore, then Fork (docs/features/canvas-forking.md), then it lands in Library, then you
    work on it from Home.

## The rule

- **A normal question** gets an answer in place on Home.
- **An explicit learning request** starts a Rabbit Hole.
- **Anything ambiguous** gets an answer in place, plus an offer to "Start a Rabbit Hole".
- Nothing silently branches on a fuzzy classifier.

## Explicit learning requests

`agent/router.js` `LEARN_INTENT` is a short, literal list of openings:
- teach me;
- walk me through;
- I want / I'd like / I would like to learn;
- help me learn;
- start a rabbit hole;
- optionally preceded by "please".

The `/teach` command and the answer's **Start a Rabbit Hole** button are the other two ways in. The rule runs after
the repository-link rule, so "start a rabbit hole with owner/repo" still connects the repository.

An explicit request creates a canvas titled from the question, keeps the whole question as the learning intent, and
opens Learn. The existing Learn and Tutor pipeline answers there (`AgentBar.jsx` `teach`, `learnAction('teach')`).
There is no Home Tutor.

## The answerer

`POST /api/learn/home-ask` (`control-plane/src/learn-home-ask.js`) runs on the app worker. It replaces the old
apps agent (`/api/ask`), which knows nothing about projects or canvases and stays off for Home.

- **Data:** the signed-in user's own library from LEARN_DB: repository projects, canvases, and Rabbit Holes
  (canvases with a `canvas_dives` parent). Every query is bound to the caller's org and email.
- **Model:** `LEARN_TASKS.home_ask`, which is Sonnet 5.5 at effort low, with one JSON reply:
  `{answer, references, offer_rabbit_hole}`. The prompt forbids inventing a project, canvas or Rabbit Hole, and
  asks the model to say when nothing matches.
- **References:** each one is checked against the library. A name that isn't there is dropped, never linked.
- **Side effects:** it only reads and stores nothing.

The answer shows in the window above the main composer, with link pills to what it names and the offer button
when `offer_rabbit_hole` is true.

## Checks

- **`web/src/agent/home-ask.test.mjs`:**
  - "What canvases do I have?", "Where did I learn about softmax?", "What is softmax?", "Explain attention" and
    ambiguous phrasings stay questions;
  - "Teach me attention", "Start a Rabbit Hole about attention" and the other openings start one;
  - the bar calls `/api/learn/home-ask` and never `/api/ask`, `create_canvas` or `streamAsk` for a Home question.
- **`control-plane/test/learn-home-ask.test.js`:**
  - the library is the caller's own and read-only;
  - invented references are dropped;
  - the request uses the pinned model;
  - the route answers in place for library and general questions;
  - an unauthenticated caller, a foreign origin, a bad body or a missing key ends before any model call;
  - no old apps agent and no Tutor code.
- **`web/e2e/home-ask-check.mjs`** (local stack, scripted answer):
  - the questions above answer in place with no canvas;
  - the explicit requests start a Rabbit Hole;
  - the offer starts one only when pressed;
  - library answers link to the project.
