# GEM-S2 rerun report

Source: C:\s\sprint2-evidence\gem-s2\results.jsonl, 12 runs, arms batch.

## 1. First-attempt validity and Q0 events

| arm | runs | first attempt valid | attempt-0 "columns ... received object" | any attempt-0 error | runs with a Q0 event | delivered | moved to next provider | planned kind missing | cost US$ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| batch | 12 | 3/12 | 8 | 9 | 11 | 11 | 9 | 11 | 0.0660 |

## 2. Q0 events by arm (action and reason)

| arm | action: reason | events |
| --- | --- | --- |
| batch | left: column lists with no labels for the items (the repair names them; Item 1, Item 2 is never invented) | 11 |
| batch | left: column lists of different lengths | 4 |
| batch | coerced: 0 | 3 |

## 3. Final kinds and who wrote the delivered card

| arm | final kinds | authored by |
| --- | --- | --- |
| batch | heatmap x8, matrix x3, none x1 | gpt-oss-120b x8, gemini-3.5-flash-lite x3, none x1 |

## 4. Offline replay of the raw attempt-0 answers through each arm's Q0

| arm | rh-diagram fences in attempt-0 answers | valid as written | valid after Q0 | still invalid |
| --- | --- | --- | --- | --- |
| batch | 0 | 0 | 0 | 0 |

Shapes that stay invalid after Q0 (this is where the missing row labels, if any, show):

| arm | shape | count |
| --- | --- | --- |
