# Reference notes — self-attention computation flow

Merged at the restructure from three files that described one case in two modes:
the project-level notes, the dynamic-scene notes and the static-scene notes.
Nothing was dropped; each section keeps its original text under its own heading.

## Project-level notes

# Reference Notes — Illustrated Transformer

## Learning objective

A learner should be able to explain:

`input → Q/K/V → QKᵀ scores → softmax weights → weighted V → output`.

## Why this reference is useful

- it introduces complexity progressively;
- Q/K/V keep stable conceptual identity;
- matrix relationships are spatially understandable;
- the explanation returns from math to model meaning;
- the visual hierarchy carries much of the explanation.

## Match

- conceptual completeness;
- hierarchy;
- stable object identity;
- information density;
- matrix relationships;
- progressive reveal;
- teaching clarity.

## Do not copy

- exact colors;
- exact typography;
- exact block shapes;
- exact arrow style;
- exact coordinates;
- exact wording;
- distinctive decorative artwork.

## Dynamic mode

# Dynamic scene reference notes

## Learning objective
Teach the same self-attention relationship progressively so the learner never has to parse the whole
mechanism at once.

## Required teaching beats
0. Tokens / concrete input.
1. Produce Q, K and V.
2. Compute QKᵀ scores.
3. Normalize scores with softmax.
4. Weight V and reveal the output.

## Motion requirements
- preserve object identity
- one major teaching change at a time
- no decorative motion
- pause after a meaningful transformation
- camera movement may focus but must not disorient
- play / pause / replay / scrub should remain exact
- sound is optional and non-essential

## Benchmark keyframes
`00.png`, `25.png`, `50.png`, `75.png`, `100.png`

These are intentionally schematic. The evaluator should compare teaching structure and clarity rather
than seek pixel equality.

## Static mode

# Static scene reference notes

## Learning objective
A learner can point at the major objects in self-attention and explain the relationship:

`input → Q/K/V → QKᵀ scores → softmax weights → weighted V → output`.

## What makes the reference successful
- One left-to-right reading direction.
- Inputs remain visible while abstractions are introduced.
- Q, K and V have stable identity.
- The score matrix is visually distinct from normalized attention weights.
- The output reconnects the matrix math to the representation.
- Labels are short and subordinate to the diagram.

## Match
- conceptual completeness
- hierarchy
- consistent object identity
- information density
- spatial relationships
- readable labels

## Do not copy
- exact fonts
- exact colors
- exact illustration style
- exact coordinates from any external source

## Failure if
- a paragraph is required to decode the diagram
- arrows cross labels
- Q/K/V identities change midway
- scores and weights look indistinguishable
- the scene requires bespoke renderer code
