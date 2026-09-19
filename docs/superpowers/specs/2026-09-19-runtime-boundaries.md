# Runtime boundaries — what we borrow from the benchmarks, and what we refuse

Decided 2026-09-19, at the vocabulary checkpoint, after inspecting the
Transformer Explainer implementation.

The benchmarks are evidence of **capabilities our runtime should support**. They
are not architectures to adopt. The thing that must survive every borrowing:

```text
declarative scene spec  →  pure deterministic evaluator  →  generic renderer
```

`getSceneState(scene, t, inputs, derived)` stays authoritative. Same time in, same
state out, with no renderer involved. That is what makes scrubbing exact, replay
possible and screenshots reproducible, and it is worth more than any effect it
costs us.

## The stack decisions

| technology | decision |
|---|---|
| **Svelte** | **No.** The existing React architecture stays. |
| **D3** | **Yes, as a pure calculation layer only.** |
| **GSAP** | **Not for timing or state.** Possible later for renderer-local effects only. |
| **ONNX Runtime Web** | **Later**, as an execution adapter. Not in A.5d. |
| **Shared reactive state** | **Yes, in Plan B**, as declared inputs — never callbacks. |

### D3 — calculation, never DOM

Permitted for quantitative scales, signed and sequential heat scales, axes,
path and curve geometry, interpolation utilities, and deterministic layout
calculation.

**D3 must not own DOM state or create a second rendering and state system.**
React and SVG remain the renderer. A D3 selection that mutates the document is a
second source of truth, and two sources of truth is the thing this architecture
exists to avoid.

**A caveat that decides where D3 actually helps.** Our colours are CSS custom
properties resolved at render time — a scene names a role, the renderer emits
`color-mix(in srgb, var(--viz-input) 24%, transparent)`, and the browser resolves
it per theme. A D3 colour scale wants concrete values in JavaScript, which would
mean resolving tokens to hex at evaluation time and **losing the property that a
scene re-skins itself when the learner switches appearance**. So D3's colour
interpolators are the one part we should not reach for; the diverging heat scale
is a value-to-percentage mapping plus a token choice, which is arithmetic.

Where D3 will genuinely earn its place: axis generation, curve and path geometry,
and layout that is deterministic. Add it when one of those lands, not before.

### GSAP — renderer-local presentation only

Scene timing and state never move into GSAP. It may be considered later for
effects that do not affect semantic scene state: an animated gradient flowing
along an existing edge, a decorative path pulse, non-semantic micro-motion.

Any such effect must be **reproducible from evaluator state** and must not break
scrub, replay or screenshot determinism. An effect that cannot be reconstructed
from `(scene, t)` is not allowed, however good it looks.

### ONNX Runtime Web — a future execution adapter

Not in this phase. When lessons want real browser inference, the boundary is:

```text
learner input  →  ONNX / model execution  →  typed result  →  scene data binding  →  visualization
```

**The visualization runtime must not depend on ONNX directly.** It receives typed
data and does not know or care where the numbers came from — which is the same
boundary that lets a scene be driven by authored values today.

### Shared semantic state — Plan B

One learner action must be able to coordinate several views:

```text
select token 3
  → the token row highlights token 3
  → the attention matrix highlights row 3
  → the Q vector view highlights the corresponding vector
  → the code view highlights the corresponding operation
  → the tutor receives the same semantic selection
```

**Not through component-specific callbacks.** Coordination flows through declared
scene inputs and semantic bindings, so the same mechanism serves a view nobody has
written yet. This is the `coordinated_views` pattern in the benchmark suite, and
it is blocked until the input axis exists — which is why those benchmark cases
are marked `blocked_by: input_axis` rather than approximated early.

## Components the benchmarks prove we need

Generic and declarative, never hand-authored one-off React scenes: Matrix, Vector,
TokenRow, QKV projection, probability bars, flow edges, row and column
highlighting, expand and drill-down, quantitative colour scales.

Each earns its place by serving more than the scene that motivated it. A component
that can only draw attention is a scene with extra steps.

## Backlog — `flowPulse`

The reference gets much of its polish from animated gradients travelling along
static edges. A semantic action — `flowPulse(edgeId)` — would communicate
information moving through an existing connection without changing scene semantics
or object positions, and generalises to VLM patch flow, MoE routing, world models,
agents and robotics.

**Not during the five A.5d fixes**, unless the attention benchmark demonstrates it
is necessary. It is a continuous visual, so it needs its own pass against the
Motion invariant — Motion may spring a value only while that value is discrete —
rather than being squeezed into a phase that is fixing something else.
