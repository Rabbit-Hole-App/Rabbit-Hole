# Iteration v001 - static

Two parts, matching the case's own scope. Part 1: X (3 tokens x 4
dimensions, rowLabels river/flows/south) x Wq (shown abstractly, shape
only - same reasoning as case02) = Q, a real matrix product, with Q's own
rowLabels showing "still one row per token" survives the jump to matrix
form - the case's core teaching point. A caption notes the same
multiplication happens for K and V.

Part 2: the rest of attention condensed to one row of six small matrices -
Q, K, V, QKt/root(dk), softmax, Z - connected by plain "->" text (no drawn
arrows needed; a straight sequential row makes the order self-evident, the
same reasoning case02's "=" text used). All values are real: X and the
three weight matrices (Wq shown, Wk/Wv only in caption) were multiplied in
Node before authoring, softmax rows sum to 1.000 exactly, and Z is the
literal softmax x V product - not decorative numbers.

## First case with no first-draft defect

Nothing needed fixing after the first render: no overflow, no crossing, no
clipped text. Cases 01, 02, 04, 09 and 10 each hit some version of "content
exceeded its container" on the first draft; case06 (and case07/08, which
also rendered clean first) did not. This is the accumulated lesson showing
up as prevention rather than repair - sizing boxes generously for their
labels, keeping captions short relative to scene width, and skipping an
arrow where alignment already carries the relationship.

## Failure classification

None. No PRIMITIVE or TEMPLATE gap. No bespoke scene workaround.

## Patterns exercised

Both declared patterns pass and genuinely match the mechanism:
`matrix_operation` (every grid carries a real computed value) and `flow`
(the condensed single row still reads as one staged sequence with each
matrix keeping its own identity).

## Did this case require a bespoke scene workaround?

No.
