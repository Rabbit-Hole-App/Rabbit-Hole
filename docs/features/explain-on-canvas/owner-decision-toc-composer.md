# Owner decision: the Table of contents has its own conversation and composer

**Approved by the owner on 2026-11-07.**

Owner request, in their words:

> On the TOC show the same UI chat composer but add a small dropdown window above it to see the chats, which the user can click to expand and minimize, and a small clear icon. The TOC scrolls above but the chat composer remains fixed below.

> The "Add to chat" on the TOC will create a pill in the chat composer in the TOC.

## What it supersedes

Checklist `UI.02` (2026-11-06): "the Table of contents has no conversation or composer of its own; Tutor talk lives in Chat." The handoff documents on `rabbit-hole/chatgpt/tutor` predate this decision.

## What is built

- The contents conversation (`TocConversation.jsx`, mounted in `LearnPage.jsx` under the outline inside `TocWorkspace`) is the earlier Contents conversation restored: its own thread (slot `toc`, always Tutor), draft and context pills, separate from the right-hand Chat. The Tutor can propose outline changes there (the existing outline tool); an outline change applies at once.
- Layout: the outline scrolls in its own region; the composer is fixed below it. Above the composer, a small window ("TOC conversation") shows the messages; its header expands and minimizes it, and a small clear icon asks "Clear this conversation?" and, on Clear, starts a new empty conversation. The old conversation stays saved and listed in Chat history. With no messages there is no window, only the composer entry.
- Add to chat on a contents row (a heading, sub-section, or a roadmap row's delivered card) adds that block's context ref as a pill in the contents composer. It does not touch the right-hand Chat. The contents composer shows only pills the learner added, never the canvas's auto-offered documents.

## What stays as it was

Roadmap drafts, parameters, Accept / Edit roadmap, card offers and Tutor roadmap entries stay in the right-hand Chat. The accepted roadmap rows in the contents are unchanged.
