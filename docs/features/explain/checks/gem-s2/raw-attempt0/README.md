# GEM-S2: the raw attempt-0 shape (transformer-decoder prompt), for the Codex brief

Source: the 12-run capture on the batch arm (`../results.jsonl`, `rawGoogle[0]` = Gemini's first answer, `rawGoogle[1]` = its repair). No new provider call was made for this folder: the answers were already saved. The 155 report said the saved attempt-0 answers carried no rh-diagram fences so the raw shapes were not visible. That was wrong. Gemini answers as one JSON object (`title`, `visuals`, `body`, `questions`, `terms`), the diagram is `visuals[i].spec.diagram`, and there is no fence to search for. The shape is saved for all 12 runs.

Prompt: "How does the transformer decoder avoid looking ahead at later words?" (planned kind token-links; Gemini wrote a heatmap).

Files: `idx1-balanced-attempt0.json` / `-attempt1.json` (balanced, the answer and its repair), `idx2-detailed-attempt0.json` / `-attempt1.json` (detailed), `census.txt` (the diagram shape of all 12 attempt-0 answers).

## What Gemini writes

A heatmap whose `columns` are comparison-style objects, `{ heading, items }`, with no `rows` and no `range`:

```
"kind": "heatmap",
"columns": [
  { "heading": "the 1", "items": ["1.209"] },
  { "heading": "cat 2", "items": ["null", "3.33"] },
  { "heading": "sat 3", "items": ["-0.381", "2.145", "0.923"] },
  ... up to { "heading": "mat 6", "items": [6 strings] }
]
```

- Column k has k items: a triangle written as ragged columns, so the lengths differ (Q0 event "column lists of different lengths").
- Cells are strings, including the literal string `"null"` for a blocked cell; the numbers are raw scores, not 0/1 mask values.
- There is no row label anywhere (heatmap needs `rows: [{ label, cells }]` with unique labels) and no `range`.
- The repair (attempt 1) keeps the same object columns and pads each column to 6 items with `"null"`, only three columns; it still has no rows, so the step fails `explanation_missing_visual` and the card moves to the next provider (gpt-oss wrote the delivered heatmap).

## Census of the 12 attempt-0 answers (`census.txt`)

- Heatmaps with `{ heading, items }` columns, no rows, no range: 9 of 12 (cells 1, 2, 3). Item counts per column: ragged triangle 1..6 (3 runs), uniform 6 (1), uniform 4 (2), uniform 2 (1), single column of 1 (1), six columns of 1 (1).
- Matrix (cell 6, gini split): `columns` as strings plus 3 rows: valid shape, no error at attempt 0 in any of its 3 runs.

## What this says for the fix

Q0 cannot repair it (no row labels, ragged lengths; inventing labels is forbidden since release 126). The model is using the `comparison` column shape for a heatmap. The fix belongs in the reference or prompt: the heatmap reference needs to show `columns: [strings]` + `rows: [{ label, cells }]` + `range`, and a mask-style card (causal mask) should be shown as a 0/1 or blocked/allowed grid, not raw scores with a `"null"` string. Both sides of this are the Codex brief.
