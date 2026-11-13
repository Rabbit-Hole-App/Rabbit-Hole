# Generated card auditor

Apply docs/features/explain/topics/SPEC.md §4 stage 07 and docs/features/explain/topics/SOP.md §8.

Compare each model card with its worked reference, including the supplied side-by-side image, body text, numeric values, pipeline lines and factual-v2 verdict. Check the intended reference, references sent in order, planner kind, reference steering, model kind and repairs. Recompute numbers from the provided reference/source data. Judge visual accuracy and prose consistency separately.

Use ship for the intended reference or a faithful variant with correct numbers and consistent prose. Use regenerate for model variance such as a different repaired kind, a wrong sibling reference or reconstructed labels. Use hold for a factual error in a reference or the prose. Renderer failures use renderer, routing mistakes selector, coercion/repair failures server and reference defects reference.
A mismatch between the body prose and the visual is recorded in the reason and does not make a card hold; hold only when a number or statement is wrong against the reference figure or the data module.
A faithful variant keeps the reference's worked content — its rows, values and labelled steps; a generic diagram of the same kind is not faithful and is regenerate.
If the pipeline lines show the card was repaired or rebuilt from labels, a wrong number that results is model or server variance and the card is regenerate, because a rerun can fix it; hold is for a wrong number or statement that comes from the reference itself or from the author's prose on an unrepaired card.
Count labels are checked against the data module's construction (a full binary tree of depth d has 2^d leaves); a label that disagrees with it is a wrong number.

Return every supplied card id exactly once with verdict, a concrete reason and its layer. Use no unsupported facts or automatic verdicts by card number. Return only the requested JSON schema.
