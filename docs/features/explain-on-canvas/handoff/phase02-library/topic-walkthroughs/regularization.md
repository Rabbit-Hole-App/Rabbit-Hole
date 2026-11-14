# C01 — linear units, hidden features, and regularization

These four source figures share one exact toy dataset. They form the approved regularization batch; each reference keeps its own subject and lesson metadata. Content specifications: [C01](../../../../explain/composition/batches/C01/content-specs.md).

| Feature A | Feature B | Target | Linear prediction | Squared error |
|---:|---:|---:|---:|---:|
| 1 | 1 | 5 | 4 | 1 |
| 1 | 2 | 6 | 5 | 1 |
| 2 | 1 | 8 | 6 | 4 |
| 2 | 2 | 9 | 7 | 4 |

Linear parameters are $w=(2,1)$, $b=1$. For the selected input $(1,2)$, the weighted terms are $(2,2)$ and the prediction is $5$. Changing feature A alone gives $7$.

The hidden map is $W=\begin{bmatrix}1&1\\2&-1\end{bmatrix}$, $c=(0,1)$, followed by ReLU. Its linear readout has $v=(1,2)$ and bias $1$. The selected input gives $z=h=(3,1)$ and output $6$. The separate probe input $(0,2)$ gives $z=(2,-1)$, $h=(2,0)$. This probe is not an added training observation.

For the linear predictor, mean squared error is $2.5$ and $\|w\|^2=5$; the bias is excluded from the penalty.

| Strength | Data loss | Weight penalty | Objective |
|---:|---:|---:|---:|
| 0 | 2.5 | 0 | 2.5 |
| 0.2 | 2.5 | 1 | 3.5 |
| 0.4 | 2.5 | 2 | 4.5 |

Inverted dropout uses keep probability $q=0.5$. Mask $(1,0)$ changes activations to $(3,0)$, then scales them to $(6,0)$.

| Mask | Probability | Linear readout |
|---|---:|---:|
| (0,0) | 0.25 | 1 |
| (1,0) | 0.25 | 7 |
| (0,1) | 0.25 | 5 |
| (1,1) | 0.25 | 11 |

The exact mean readout is $6$, equal to inference for this linear readout. This is not a claim about the expectation after an arbitrary nonlinear output function.

Overview introduces the idea with two panels. Standard shows the operations and intermediate values. Deep retains that mechanism and adds a changed-input or invariant check. Numeric values are drawn as bar lengths, stacked shares, or stems on matching axes; symbolic dependencies use block stacks. The [batch report](../../../../explain/composition/batches/C01/REPORT.md) links the three contact sheets and receipts.

All tables above were generated from `topic-regularization-data.js`; the C01 tests independently recompute its arithmetic.
