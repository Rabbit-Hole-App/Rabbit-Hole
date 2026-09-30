# Rabbit Hole Field Guide

Status: original visual concept. The user approved the layout, questioned the
illustration, and then requested developer documentation covering the existing
CLI, API and BYOC implementation. See
[the implemented scope](../../../../docs/features/rabbit-hole-docs.md).

Mockup: [rabbit-hole-docs-v1.png](rabbit-hole-docs-v1.png), generated with the
built-in image tool and visually reviewed for hierarchy, legibility, chapter
navigation and connection to the existing Rabbit Hole identity.

The reference's useful structure is a searchable index, readable article, and
in-page contents. The original concept proposed learner-oriented chapters;
the user's subsequent clarification prioritizes the existing CLI, API and BYOC
for this first implementation.

## Visual approach

Warm ivory paper, black geometric headings, quiet pink selection and a thin
brick-red route in the margin. One engraved diagram shows sources becoming a
learning path. The page should feel related to the landing page and manifesto
while giving most space to reading.

The proposed desktop introduction is a single reading screen, with an index on
the left and a narrow contents trail on the right. In implementation, desktop
side panels should use existing resizable panel patterns and keyboard bounds;
mobile should use an accessible navigation drawer and collapsible contents.

## Proposed chapters

- Get started: Introduction; Your first rabbit hole; Bring your sources.
- Learn: Ask better questions; Interactive canvases; Practice and review;
  Notes and citations.
- Your workspace: Projects and history; Sharing and exports; Usage and credits.

These are draft chapter labels. Publication must reflect actual available
product capabilities, especially exports, metering and collaboration.

## Motion and interaction, if approved

- The contents marker follows the section being read.
- A chapter change advances the small margin trail; reduced motion is immediate.
- Diagram details can highlight on focus/hover, without a perpetual loop behind
  the article. All explanatory information remains visible without interaction.
- Search is a familiar keyboard-accessible dialog. No model calls or AI search
  backend is implied by this visual mockup.
- Previous/next chapter links preserve a clear reading path.

The subsequent implementation adds public Docs navigation with a working
destination. The proposed learner chapters and large diagram above are retained
here only as the original concept, not as published product documentation.

Prompt: [rabbit-hole-docs-v1-prompt.md](rabbit-hole-docs-v1-prompt.md).
