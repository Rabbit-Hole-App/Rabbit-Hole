# 9.4. Recurrent Neural Networks figure briefs

2 figure occurrences in document order. [Source page](https://d2l.ai/chapter_recurrent-neural-networks/rnn.html) · [Inventory](manifest.json)

## Figure 01

The same recurrent rule updates the state from the previous state and the new input at every step.

- **Kinds.** `relationship` · `block-stack`
- **Elements.** Two unrolled steps with a state handoff, a fresh input and an output per step, plus one inset showing how the inputs combine before an activation.
- **Sequence.** Recurrent networks 1/2. Define the hidden update and readout

## Figure 02

Next-token training compares each recurrent output with a target shifted one position ahead.

- **Kinds.** `matrix` · `relationship`
- **Elements.** A new short token sequence, aligned input and next-target rows, and a state handoff across positions. Mark one prediction/target pair.
- **Sequence.** Recurrent networks 2/2. Align next-token training targets
