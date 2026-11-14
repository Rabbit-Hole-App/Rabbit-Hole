# Scene composition guide

**Proposal for owner/reviewer review.** Renderer parts and canonical compositions are not implemented by this documentation change. Pipeline stages stay unchanged.

## Choose the evidence

Teach exactly one aha: the observation answering the learner's opening question. Write a complete story that builds toward it. Specify the initial view, decisive change or comparison, and final evidence. Hold the aha state until the learner acts; a timed scene pauses there automatically. Avoid ornamental physics or movement that contributes no evidence.

Use a family as **tested parts + canonical composition data + rules**. The scene model selects and binds renderer-level tested parts and controls; deterministic code assembles them directly through frozen `sdk8`, without helper APIs. Do not generate a new renderer. Canonical compositions provide starting arrangements:

| Stepper composition form | Reference subject |
| --- | --- |
| Algorithm / collection | Merge sort |
| Protocol | TCP handshake |
| Cycle | Mitosis |
| Pipeline | RAG |

## Bind every part

Name every moving or changing part in the story; keep those names in the picture, controls and explanations. Bind each part's state, geometry, highlight, words and measurements to declared data. Nothing is unbound. A control must change the aha's evidence or experiment, beyond changing a label. Declare assumptions, fixed inputs and each control's effect, default, bounds, increments or options.

For a state stepper, compose a step rail with an active step; a fixed picture with named highlighted regions; value readouts; an anchored active-part callout; a previous-state ghost when needed; and a counter or progress indicator. Pictures can contain array cells, two actors and a wire, or a cell and its phases. Every selected part serves the goal. A step index represents a state, never a fabricated clock.

## Add mechanism with depth

| Depth | Evidence to expose |
| --- | --- |
| Overview / Brief | One changing region and the observation that resolves the question. |
| Standard / Balanced | A comparison that makes the mechanism and its invariant visible. |
| Deep / Detailed | A governing formula or computed count that makes the reasoning inspectable. |

Add mechanism without clutter. Compute measurements from the same state and inputs; declare units, reference points, shared scales and rounding.

## Keep the card readable

Reuse the approved card shell, primitives and controls. Compose at native 640 px width with readable text and label space in every state. Give each number one place: callouts identify **where**; readouts report **values**. Keep explanation and instructions above the experiment. Declare the depth's parameter-control budget separately from navigation/transport.

Use time only when the subject needs it. Steppers use Previous and Next, retaining their names when disabled at boundaries. Reset restores the first state and defaults. Every state persists until the learner acts, including the named aha state; reference captures must show that state. Controls have accessible names, visible focus and keyboard operation. The nine hand-drawn references form the benchmark/high-fidelity tier; evaluate later model-composed scenes against the same evidence.
