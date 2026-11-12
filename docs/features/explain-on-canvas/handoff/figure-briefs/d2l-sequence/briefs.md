# 9.1. Working with Sequences figure briefs

22 figure occurrences in document order. [Source page](https://d2l.ai/chapter_recurrent-neural-networks/sequence.html) · [Inventory](manifest.json)

## Figure 01

Temporal order exposes runs, reversals and changes that would disappear if observations were shuffled.

- **Kinds.** `coordinate-plot`
- **Elements.** A fabricated irregularly moving series with ordered timestamps and one rise or reversal marked. Keep the example descriptive.
- **Sequence.** Sequence models 1/7. See dependence in an ordered signal
- **Phase 02.** [15](../briefs/15-time-series.md)

## Figure 02

A latent-state model carries information forward in an evolving state while recording observations at each time.

- **Kinds.** `relationship`
- **Elements.** An invented two-step unroll with a state-to-state handoff, one earlier observation feeding each state and one prediction emitted per state. Distinguish measurements, state and predictions.
- **Sequence.** Sequence models 2/7. Separate observations from hidden state
- **Phase 02.** [15](../briefs/15-time-series.md)

## Figure 03

A training signal can have recurring structure even when individual measurements are noisy.

- **Kinds.** `coordinate-plot`
- **Elements.** An independent noisy periodic series, evenly spaced timestamps and a marked window of preceding observations used to form a training example.
- **Sequence.** Sequence models 3/7. Introduce the worked signal. Implementation rendering 1/4
- **Phase 02.** [15](../briefs/15-time-series.md)

## Figure 04

A training signal can have recurring structure even when individual measurements are noisy.

- **Kinds.** `coordinate-plot`
- **Elements.** An independent noisy periodic series, evenly spaced timestamps and a marked window of preceding observations used to form a training example.
- **Sequence.** Sequence models 3/7. Introduce the worked signal. Implementation rendering 2/4
- **Phase 02.** [15](../briefs/15-time-series.md)

## Figure 05

A training signal can have recurring structure even when individual measurements are noisy.

- **Kinds.** `coordinate-plot`
- **Elements.** An independent noisy periodic series, evenly spaced timestamps and a marked window of preceding observations used to form a training example.
- **Sequence.** Sequence models 3/7. Introduce the worked signal. Implementation rendering 3/4
- **Phase 02.** [15](../briefs/15-time-series.md)

## Figure 06

A training signal can have recurring structure even when individual measurements are noisy.

- **Kinds.** `coordinate-plot`
- **Elements.** An independent noisy periodic series, evenly spaced timestamps and a marked window of preceding observations used to form a training example.
- **Sequence.** Sequence models 3/7. Introduce the worked signal. Implementation rendering 4/4
- **Phase 02.** [15](../briefs/15-time-series.md)

## Figure 07

Training and validation loss distinguish fitting progress from performance on reserved observations.

- **Kinds.** `coordinate-plot`
- **Elements.** Two loss traces from a new lag regression on chronological train and validation portions. Mark the initial decline and later plateau, and distinguish epochs from forecast time.
- **Sequence.** Sequence models 4/7. Evaluate a fitted lag-based predictor. Implementation rendering 1/4
- **Phase 02.** [09](../briefs/09-model-evaluation.md) · [15](../briefs/15-time-series.md)

## Figure 08

Training and validation loss distinguish fitting progress from performance on reserved observations.

- **Kinds.** `coordinate-plot`
- **Elements.** Two loss traces from a new lag regression on chronological train and validation portions. Mark the initial decline and later plateau, and distinguish epochs from forecast time.
- **Sequence.** Sequence models 4/7. Evaluate a fitted lag-based predictor. Implementation rendering 2/4
- **Phase 02.** [09](../briefs/09-model-evaluation.md) · [15](../briefs/15-time-series.md)

## Figure 09

Training and validation loss distinguish fitting progress from performance on reserved observations.

- **Kinds.** `coordinate-plot`
- **Elements.** Two loss traces from a new lag regression on chronological train and validation portions. Mark the initial decline and later plateau, and distinguish epochs from forecast time.
- **Sequence.** Sequence models 4/7. Evaluate a fitted lag-based predictor. Implementation rendering 3/4
- **Phase 02.** [09](../briefs/09-model-evaluation.md) · [15](../briefs/15-time-series.md)

## Figure 10

Training and validation loss distinguish fitting progress from performance on reserved observations.

- **Kinds.** `coordinate-plot`
- **Elements.** Two loss traces from a new lag regression on chronological train and validation portions. Mark the initial decline and later plateau, and distinguish epochs from forecast time.
- **Sequence.** Sequence models 4/7. Evaluate a fitted lag-based predictor. Implementation rendering 4/4
- **Phase 02.** [09](../briefs/09-model-evaluation.md) · [15](../briefs/15-time-series.md)

## Figure 11

A one-step predictor is refreshed with newly observed history before making each next forecast.

- **Kinds.** `coordinate-plot`
- **Elements.** An independent observed series, aligned one-step predictions and a marked example of a prediction based only on observations available at its forecast origin.
- **Sequence.** Sequence models 5/7. Read one-step predictions. Implementation rendering 1/4
- **Phase 02.** [15](../briefs/15-time-series.md)

## Figure 12

A one-step predictor is refreshed with newly observed history before making each next forecast.

- **Kinds.** `coordinate-plot`
- **Elements.** An independent observed series, aligned one-step predictions and a marked example of a prediction based only on observations available at its forecast origin.
- **Sequence.** Sequence models 5/7. Read one-step predictions. Implementation rendering 2/4
- **Phase 02.** [15](../briefs/15-time-series.md)

## Figure 13

A one-step predictor is refreshed with newly observed history before making each next forecast.

- **Kinds.** `coordinate-plot`
- **Elements.** An independent observed series, aligned one-step predictions and a marked example of a prediction based only on observations available at its forecast origin.
- **Sequence.** Sequence models 5/7. Read one-step predictions. Implementation rendering 3/4
- **Phase 02.** [15](../briefs/15-time-series.md)

## Figure 14

A one-step predictor is refreshed with newly observed history before making each next forecast.

- **Kinds.** `coordinate-plot`
- **Elements.** An independent observed series, aligned one-step predictions and a marked example of a prediction based only on observations available at its forecast origin.
- **Sequence.** Sequence models 5/7. Read one-step predictions. Implementation rendering 4/4
- **Phase 02.** [15](../briefs/15-time-series.md)

## Figure 15

Rolling a predictor forward on its own outputs can amplify errors as measured inputs stop arriving.

- **Kinds.** `coordinate-plot` · `matrix`
- **Elements.** A new series with a marked forecast origin and matched one-step and recursive traces. Use one short row of input provenance to show where a predicted value is fed back. Show the rollout gradually settling below the baseline average.
- **Sequence.** Sequence models 6/7. Switch to recursive rollout. Implementation rendering 1/4
- **Phase 02.** [15](../briefs/15-time-series.md)

## Figure 16

Rolling a predictor forward on its own outputs can amplify errors as measured inputs stop arriving.

- **Kinds.** `coordinate-plot` · `matrix`
- **Elements.** A new series with a marked forecast origin and matched one-step and recursive traces. Use one short row of input provenance to show where a predicted value is fed back. Show a nearly flat rollout while the refreshed predictor still has peaks.
- **Sequence.** Sequence models 6/7. Switch to recursive rollout. Implementation rendering 2/4
- **Phase 02.** [15](../briefs/15-time-series.md)

## Figure 17

Rolling a predictor forward on its own outputs can amplify errors as measured inputs stop arriving.

- **Kinds.** `coordinate-plot` · `matrix`
- **Elements.** A new series with a marked forecast origin and matched one-step and recursive traces. Use one short row of input provenance to show where a predicted value is fed back. Show convergence toward a stable value from below.
- **Sequence.** Sequence models 6/7. Switch to recursive rollout. Implementation rendering 3/4
- **Phase 02.** [15](../briefs/15-time-series.md)

## Figure 18

Rolling a predictor forward on its own outputs can amplify errors as measured inputs stop arriving.

- **Kinds.** `coordinate-plot` · `matrix`
- **Elements.** A new series with a marked forecast origin and matched one-step and recursive traces. Use one short row of input provenance to show where a predicted value is fed back. Show a gradual drift toward the stable value despite a later reversal in the refreshed trace.
- **Sequence.** Sequence models 6/7. Switch to recursive rollout. Implementation rendering 4/4
- **Phase 02.** [15](../briefs/15-time-series.md)

## Figure 19

Forecasts at longer horizons may preserve less short-term structure even when compared at the same target time.

- **Kinds.** `coordinate-plot`
- **Elements.** An original held-out series and several horizon curves plotted at target timestamps. Mark one shared target and indicate the different forecast origins. Contrast the strongly damped longest horizon with the closely grouped shorter horizons.
- **Sequence.** Sequence models 7/7. Compare forecasts by horizon. Implementation rendering 1/4
- **Phase 02.** [15](../briefs/15-time-series.md)

## Figure 20

Forecasts at longer horizons may preserve less short-term structure even when compared at the same target time.

- **Kinds.** `coordinate-plot`
- **Elements.** An original held-out series and several horizon curves plotted at target timestamps. Mark one shared target and indicate the different forecast origins. Mark how the longest forecast underestimates a peak and overestimates a trough.
- **Sequence.** Sequence models 7/7. Compare forecasts by horizon. Implementation rendering 2/4
- **Phase 02.** [15](../briefs/15-time-series.md)

## Figure 21

Forecasts at longer horizons may preserve less short-term structure even when compared at the same target time.

- **Kinds.** `coordinate-plot`
- **Elements.** An original held-out series and several horizon curves plotted at target timestamps. Mark one shared target and indicate the different forecast origins. Use a turning point where the long-horizon trace loses most of the short-horizon variation.
- **Sequence.** Sequence models 7/7. Compare forecasts by horizon. Implementation rendering 3/4
- **Phase 02.** [15](../briefs/15-time-series.md)

## Figure 22

Forecasts at longer horizons may preserve less short-term structure even when compared at the same target time.

- **Kinds.** `coordinate-plot`
- **Elements.** An original held-out series and several horizon curves plotted at target timestamps. Mark one shared target and indicate the different forecast origins. Keep the more modest attenuation here distinct from the earlier renderings.
- **Sequence.** Sequence models 7/7. Compare forecasts by horizon. Implementation rendering 4/4
- **Phase 02.** [15](../briefs/15-time-series.md)
