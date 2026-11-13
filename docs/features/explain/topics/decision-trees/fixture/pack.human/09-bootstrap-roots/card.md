# Bootstrap Sample of Training Rows

- Prompt: what does a bootstrap sample of the training rows look like, and which rows repeat?
- Depth: Balanced (bench key standard)
- Expected reference: ml-trees-bootstrap-roots; expected kind: sample-set
- Sent bare: only the prompt (no lesson, no context, no selection); depth standard
- Selector hit (expected reference among the references sent to the author): yes; first pick (expected reference sent first): no
- References sent to the author (attempt 0, selector order): shape-sample-set, ml-trees-bootstrap-roots, bootstrap-replacement-oob
- Steer (explanation_plan_kind_from_reference): no (event absent)
- Planner kind: sample-set (fixed); planner kind = expected: yes
- Model kind (first diagram): sample-set; all visuals: sample-set; model kind = expected: yes
- Picture routing: planner pictures 0; pictures in the card 0; dropped none
- Repaired: yes; cause (first attempt error): attempt 0: explanation_bad_diagram: the rh-diagram spec is not valid (diagram.samples: Invalid input: expected array, received undefined; diagram.groups: Invalid input: expected array, received undefined) | attempt 1: explanation_missing_visual: the card must keep one to three visuals; every diagram was invalid and none could be rebuilt from its labels.; visual fallback: no; server corrections: null
- Authored by fireworks / accounts/fireworks/models/gpt-oss-120b
- Time 10522 ms (model call(s) 2331 + 1858 + 6156 ms); tokens in/out 16991/1389; cost US$0.006343
- Factual (factual-v2): 2/5, error yes - Example is inconsistent: a bootstrap sample of 8 draws is described as 6 rows, and the diagram lists C, E, G, H in the sample though the prose says they were omitted; OOB error is also only approximately unbiased.

![card](card.png)

| model (440 px) | reference (408 px) |
|---|---|
| ![visual 1](visual-1.svg) | ![reference](reference-408.svg) |

## Body (as saved, visual markers in place)

Imagine you have eight training rows labeled A through H. A bootstrap sample draws the same number of rows (eight) but each draw is independent, so a row can appear more than once.

[[visual:1]]

In the example, rows B and F were selected twice, while C, E, G, and H did not appear. The sample therefore contains the multiset {A, B, B, D, F, F, …} with six drawn rows; the omitted rows form the out‑of‑bag set.

The repeated rows matter because they receive more weight when the model is trained on this sample, while the out‑of‑bag rows can be used to estimate error without bias.

## Visuals

- [[visual:1]] diagram, kind **sample-set**, title "Bootstrap sample of training rows", caption "Worked example. Rows A–H are drawn with replacement; repeats are shown." ([spec](visual-1.json), [svg](visual-1.svg), [png](visual-1.png))

## Regeneration note

Regenerated once (run 2026-11-09T122905-demo-lesson04-regen-05-09, no loop). Same defects again: the same repair path (attempt 0 invalid sample-set without samples and groups, attempt 1 missing visual, authored by the Fireworks fallback) and the same body-versus-diagram contradiction (judge: 8 draws described as 6 rows; C, E, G, H drawn in the sample although the prose says they were omitted). The card body and diagram are identical to the previous run (the factual judge worded its finding differently; same score and finding).

## Previous run (replaced on regeneration)

- Prompt: what does a bootstrap sample of the training rows look like, and which rows repeat?
- Depth: Balanced (bench key standard)
- Expected reference: ml-trees-bootstrap-roots; expected kind: sample-set
- Sent bare: only the prompt (no lesson, no context, no selection); depth standard
- Selector hit (expected reference among the references sent to the author): yes; first pick (expected reference sent first): no
- References sent to the author (attempt 0, selector order): shape-sample-set, ml-trees-bootstrap-roots, bootstrap-replacement-oob
- Steer (explanation_plan_kind_from_reference): no (event absent)
- Planner kind: sample-set (fixed); planner kind = expected: yes
- Model kind (first diagram): sample-set; all visuals: sample-set; model kind = expected: yes
- Picture routing: planner pictures 0; pictures in the card 0; dropped none
- Repaired: yes; cause (first attempt error): attempt 0: explanation_bad_diagram: the rh-diagram spec is not valid (diagram.samples: Invalid input: expected array, received undefined; diagram.groups: Invalid input: expected array, received undefined) | attempt 1: explanation_missing_visual: the card must keep one to three visuals; every diagram was invalid and none could be rebuilt from its labels.; visual fallback: no; server corrections: null
- Authored by fireworks / accounts/fireworks/models/gpt-oss-120b
- Time 11630 ms (model call(s) 1999 + 1665 + 7413 ms); tokens in/out 16923/1149; cost US$0.005722
- Factual (factual-v2): 2/5, error yes - The card contradicts itself. A bootstrap sample of 8 draws cannot contain only six rows. With B and F twice and A and D once, that is 6 draws, and C, E, G, H would be absent, which leaves 2 draws unaccounted for. The prose says 'six drawn rows', but the sample must have eight. The diagram also lists C, E, G, H inside the bootstrap sample even though the prose says they were omitted. The claim that out-of-bag error is estimated 'without bias' is also overstated, since OOB error is only approximately unbiased.

## Follow-up questions

1. What effect does a row appearing multiple times have on model training?
2. How many unique rows can appear in a bootstrap sample of size eight?
3. Why are out‑of‑bag rows useful for error estimation?
