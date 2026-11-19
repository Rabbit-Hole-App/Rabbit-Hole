# Prompts selecting a new C05 reference

These 25 prompt and reference pairs selected the listed reference at Brief, Balanced, and Detailed.

## `ml-recurrent-training-gradient-horizons`

- Truncating backpropagation trades a shorter gradient path for less direct training signal from distant steps.
- Compare gradient segment horizons without resetting recurrent state.
- Show forward versus detach at a fixed cutoff.
- Why do sampled gradient segment horizons differ?
- Trace forward versus detach for the final recurrent loss.
- Contrast short and long gradient segment horizons.

## `ml-recurrent-training-shared-parameter-gradients`

- Unrolling recurrence exposes all time steps whose losses contribute gradients to shared parameters.
- Show loss state dependencies for a shared recurrent weight.
- How do shared gradient uses add across time?
- Trace loss state dependencies before summing parameter gradients.
- Show shared gradient uses with two prediction losses.
- Which prior states receive the later loss in loss state dependencies?

## `ml-recurrent-networks-recurrent-update`

- The same recurrent rule updates the state from the previous state and the new input at every step.
- Explain an activated recurrent update with two fresh inputs.
- Trace fresh input readout through a shared recurrent cell.
- Where does ReLU act in an activated recurrent update?
- Compare both fresh input readout steps with state handoff.
- Show activation before readout in an activated recurrent update.

## `ml-recurrent-networks-recurrent-next-token-training`

- A next-token objective can teach a recurrent text model useful internal representations.
- Next-token training compares each recurrent output with a target shifted one position ahead.
- Explain recurrent prefix supervision with shifted observed targets.
- Why do teacher forced states use observed words after a guess?
- Show a hidden representation receiving recurrent prefix supervision.
- Trace two teacher forced states and their next-token predictions.
- Compare a sampled guess with the observed input in teacher forced states.
