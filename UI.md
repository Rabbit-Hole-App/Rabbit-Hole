# UI.md

Read this before writing, briefing or reviewing any UI change. It is part of the repository instructions
([CLAUDE.md](CLAUDE.md)) and binds the lead, every lane and subagent, and every reviewer.

## The hard rule

Owner, 2026-11-06: **always check the existing UI, templates and components before any UI work, and reuse them. Never
recreate UI.** UI that already exists, rebuilt from scratch, or UI nobody asked for, means the owner has to redo it.

## Before any UI code

1. **Read what exists.** Open the screen you are changing in the code and find the component, layout, template or
   pattern that already does the job. Search `packages/web/src`, starting with `ui.jsx` and the panel, card, menu and
   chat components next to your change.
2. **Read the design sources.** `packages/web/DESIGN.md` and `packages/web/design/` (`components.html`, `flow.md`,
   `notion.md`, `mockups/`).
3. **Use the owner's template.** If the owner supplied a mockup or HTML template for the feature, it is the target:
   match it, do not reinterpret it. Example: the Tutor Contents panel is `tutor-unified-toc.html` (the table of contents
   is the roadmap, one scroll).
4. **Name the reuse.** The plan, the lane brief and the hand-back each name the existing component or template used,
   for example "failure notice: `toast()` from `ui.jsx`".
5. **Nothing fits: ask first.** If no existing component or template covers it, ask the owner before building
   anything new. Do not decide a new look yourself.

## Never, unless the owner explicitly asked for it

- A new banner, status chip, notice block, fixed or floating overlay, button strip, or toast look-alike. Notices and
  errors use `toast()` from `packages/web/src/ui.jsx`.
- A new component that duplicates an existing one, or a second variant of an existing panel, card or menu.
- Splitting, restructuring or restyling an existing screen beyond what the request names.
- New buttons or actions (Retry, Replace, Omit, Undo and the like) that the request does not name.

## Lane briefs and reviews

- A lane brief that touches UI names the existing components and templates to reuse and links this file.
- A UI diff that adds any visual element not in the owner's request or an existing component is rejected, even when
  its logic and tests pass.
