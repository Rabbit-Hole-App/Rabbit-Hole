# Global Visual Critic Prompt

Compare the benchmark reference against `generated/latest/`.

Do not reward pixel similarity.

Evaluate:
1. technical correctness
2. conceptual completeness
3. teaching clarity
4. visual hierarchy
5. layout
6. readability
7. spatial relationships
8. progressive disclosure
9. interaction quality where relevant
10. motion quality where relevant
11. focal point
12. generic composition
13. originality / reference-overfit risk

For every failure:
- choose a failure type from `failure-taxonomy.json`;
- identify the reusable system-level cause;
- recommend a reusable system improvement.

Never recommend:
- benchmark-specific coordinates;
- one-off CSS;
- custom JSX;
- copying the reference palette, typography, shapes, arrows, or wording.
