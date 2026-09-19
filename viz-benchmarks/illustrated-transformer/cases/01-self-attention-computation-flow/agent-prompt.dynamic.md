# Visual Director Prompt — Benchmark Mode

You are generating a scene for the Learn deterministic teaching runtime.

Inputs:
- `target.json`;
- `reference-notes.md`;
- `../../shared/benchmark-mode.md`;
- `../../shared/teaching-patterns.json`;
- available Learn component/action/template registries.

## Goal

Match the benchmark's **teaching capability and conceptual structure**, not its visual appearance.

## Requirements

1. Produce the smallest declarative scene spec that satisfies the benchmark.
2. Use only registered primitives, actions, semantic roles, typography roles, timing names and sounds.
3. Do not generate React, SVG, CSS, D3, GSAP, Motion or renderer code.
4. Do not add scene-specific styling or layout hacks.
5. Do not copy reference colors, exact shapes, arrows, typography, coordinates, captions, or artwork.
6. Preserve the conceptual relationships and teaching sequence defined in `teaching-patterns.json`.
7. If the current vocabulary cannot express an important relationship, return
   `NEW_COMPONENT_REQUIRED` or `VOCABULARY_GAP` with the missing capability.
8. Preserve semantic IDs for every meaningful object.
9. Prefer visual explanation over explanatory paragraphs.
10. A result may look substantially different from the reference and still be correct if it teaches the
    same mechanism with comparable clarity.

Output only a valid Learn scene specification or a vocabulary-gap result.
