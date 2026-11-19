# Roadmap unplugged; a dropped file gets the Tutor's opening (owner 2026-11-19 11:24, option A; Reviewer)

The product has no roadmap. Source arrives, the Tutor opens, the learner picks a topic, the plan fills the table of contents, sections are built. The "Explain on canvas" roadmap goes out of the learner's reach; its modules stay dormant for the explain lane to delete (a ticket, not this lane's).

## A. Unplug
1. `ROADMAP_ENABLED` and its sub-flags (`ROADMAP_AUTO_ENABLED`, `ROADMAP_EDIT_ENABLED`, `ROADMAP_LONG_MARKDOWN_ENABLED`, `ROADMAP_ON_DROP_ENABLED`) are set nowhere: not in the production config (removed from `wrangler.rabbit-hole-prod.jsonc`; `ROADMAP_JOBS` stays bound, its objects and migration tag are applied), not in dev, not in a lane stack's vars. Every roadmap route answers 404 and `useRoadmap` mounts nothing.
2. No way in: the chat's roadmap tool (`start_lesson`) and its policy are removed from `chat-tools.js` and the chat route (`index.js`); the typed course path (the router's `course` capability, the direct `course` command in `ask.jsx`, the chat's `lesson` sources) is removed; the Insert menu's "Create a course" row, the table of contents' "Generate course" button and the canvas op behind them (`startCourse`) are removed.
3. Tests that read those entries now assert they are gone; the roadmap unit tests stay (dormant code still passes).

## B. A dropped Markdown or PDF arrives like a repository
1. On insert of a Markdown file or a PDF on a canvas with no accepted plan, no repository and no opening: Chat opens once, the shimmer says "Reading <file name>", and the browser sends `learn_index { layer: 'overview', source: { kind, name, text | pages, blockId } }`. PDF text comes from the browser's own extraction (the pages it reads for the paper upload).
2. `learn-document.js`: the text is stored once by sha256 (`learn-repositories-dev/shared/files/<sha>/text.json`), cut into sections (Markdown: one per heading, `#heading-slug`; PDF: one per page, `p.3`), and the overview is built in one turn with no research tools (`tasks/learn-index-document.md`, cap US$0.10). Stored at `learn-repositories-dev/shared/files/<sha>/index/overview.json`; `repository_index` row `repo = 'file:<sha>'`. The one dropped file that started a canvas is `canvas_document` (learn-migrations/0049, local only until the owner's go).
3. `sourceArrived` then `learn_open`, then the one saved Tutor message with the topic rows, as for a repository (source-arrived.js, intake-once-spec.md).
4. Topic, depth, plan, table of contents and build read the document where they read a repository: `loadDocumentSnapshot` gives a snapshot-shaped object whose files are the sections, so `read_source`, `search_code`, the anchors checks, `learn_intro`, `learn_plan`, the brief and Make work unchanged; an anchor is `#heading` or `p.3`, optionally with `:start-end` lines.
5. Scope: one dropped file per canvas starts the Tutor; a later file is only a card (server: `status: 'ignored'`; browser: the flow takes only the first).

## Status (Claude Code, learn lane stack 8880)
- A: removed as above; the router's `course` eval file (`test/chat-route/course.json`) and its capability test go with it.
- B: built. Stored overviews: `run/index-overview-document-markdown.json` and `run/index-overview-document-pdf.json`.
- Not done yet: Make for a document source still offers the item types it offers for a repository (a "repository code" item has no document form); the Make section 4 pairing of a passage with a document card and an explain card is the next step.
