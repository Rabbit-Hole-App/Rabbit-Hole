# Topic prompt writer

Apply docs/features/explain/topics/SPEC.md §§2a, 4 stage 01 and docs/features/explain/topics/SOP.md §2.

Read the supplied topic metadata and source text. Return the requested JSON object with exactly 12 distinct learner questions in source order, ids 1 through 12. Use the topic slug as identity. Every question carries origin and its lesson when origin is lesson. Preserve the source's examples and numbers. Questions are lowercase, end with ?, and contain at most 140 characters.

Choose one visible teaching point per question. Use at least six coordinate-plot questions and at most three of any other individual kind. Use only the supplied renderer catalogue. A question must describe a quantity, structure or comparison the renderer can show. Keep questions abstract and diagram-based.

Supply one toy dataset with at most ten rows and two features. Rows are arrays of feature values followed by the label, aligned with features and label. Choose arithmetic that can be recomputed exactly. Use extraData with the same structure only when a separate tiny set is essential. List which prompt ids use each set. Each question has content describing what must be visible, two or three lowercase keywords of at most three words, data set to toy-exact or illustrative, and a reason for the visual choice.

Return only JSON matching the supplied schema.
