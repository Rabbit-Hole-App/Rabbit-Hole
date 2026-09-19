# Benchmark Optimization Loop

```text
reference + benchmark intent
          ↓
extract reusable teaching pattern
          ↓
visual-director agent
          ↓
declarative Learn scene spec
          ↓
Learn runtime
          ↓
generated keyframes
          ↓
visual critic
          ↓
pedagogical gap + failure taxonomy
          ↓
reusable system change
          ↓
regenerate
```

## Objective

Optimize for **semantic / pedagogical parity**, not screenshot similarity.

The benchmark should teach the library to express the same important relationships and learner
experience through Learn's own design system.

## Rules

1. Never patch the benchmark scene to make the benchmark pass.
2. Never optimize exact color, typography, node shape, arrow style, coordinates or wording toward the reference.
3. Fix the smallest reusable abstraction responsible for a teaching-quality failure.
4. Re-run every previously passing benchmark after a vocabulary/runtime change.
5. Keep generation and evaluation agents separate.
6. Human review is the final quality gate.
7. Record imitation risk as well as teaching-quality scores.
8. Production generation never receives benchmark screenshots.

## After a benchmark passes

Promote only the reusable result:

- teaching pattern;
- component/template capability;
- layout variant;
- motion rule;
- evaluation lesson.

Do **not** promote external-reference-specific styling.
