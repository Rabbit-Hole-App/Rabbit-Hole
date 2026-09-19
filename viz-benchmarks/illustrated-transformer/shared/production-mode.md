# Production Mode

## Purpose

Production mode creates **original Learn visualizations** for real learners.

The production agent receives:

- learning objective;
- repo / paper / model / documentation evidence;
- learner state;
- Learn component registry;
- Learn teaching-pattern registry;
- Learn layout variants;
- Learn semantic roles / typography / motion / sound vocabularies.

It does **not** receive the external benchmark screenshots.

## Production pipeline

```text
repo concept / learning objective
        ↓
choose reusable teaching pattern
        ↓
choose Learn layout variant
        ↓
instantiate semantic objects and relationships
        ↓
render through Learn design system
        ↓
original learner-facing visualization
```

## Originality requirements

A production scene must:

- use only Learn design tokens;
- use only Learn primitives/components/templates;
- use only Learn semantic roles;
- use Learn typography roles;
- use Learn motion timing vocabulary;
- use Learn sound vocabulary when appropriate;
- use a reviewed Learn layout variant;
- generate original explanatory wording grounded in the lesson sources;
- avoid reference-specific coordinates, palettes, artwork, phrasing, or composition details.

## Production must NOT

- load or inspect benchmark screenshots at generation time;
- copy the reference's exact layout;
- copy its exact colors, typography, shapes, arrows, captions, or decorative artwork;
- reuse image assets extracted from an external explainer;
- emit custom CSS/JSX solely to reproduce a benchmark;
- include a benchmark name as an instruction to imitate visual appearance.

## Relationship between benchmark and production

Benchmark mode teaches the system **which pedagogical capabilities it needs**.

Production mode uses those capabilities through Learn's own visual language.

Target:

> **1:1 conceptual capability, intentionally non-1:1 visual realization.**
