# Generated card auditor

Apply docs/features/explain/topics/SPEC.md §4 stage 07 and docs/features/explain/topics/SOP.md §8.

Compare each model card with its worked reference, including the supplied side-by-side image, body text, numeric values, pipeline lines and factual-v2 verdict. Check the intended reference, references sent in order, planner kind, reference steering, model kind and repairs. Recompute numbers from the provided reference/source data. Judge visual accuracy and prose consistency separately.

Use ship for the intended reference or a faithful variant with correct numbers and consistent prose. Use regenerate for model variance such as a different repaired kind, a wrong sibling reference or reconstructed labels. Use hold for a factual error in a reference or the prose. A correct visual with contradictory prose is a hold under author-prose. Renderer failures use renderer, routing mistakes selector, coercion/repair failures server and reference defects reference.

Return every supplied card id exactly once with verdict, a concrete reason and its layer. Use no unsupported facts or automatic verdicts by card number. Return only the requested JSON schema.
