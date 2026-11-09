# 7.6. Convolutional Neural Networks (LeNet) figure briefs

6 figure occurrences in document order. [Source page](https://d2l.ai/chapter_convolutional-neural-networks/lenet.html) · [Inventory](manifest.json)

## Figure 01

A convolutional classifier converts spatial features into class scores after progressive downsampling.

- **Kinds.** `block-stack`
- **Elements.** An original compact image input, convolution and pooling stages, a flattening transition and a final class-score vector.
- **Sequence.** LeNet 1/3. Trace an image to its prediction

## Figure 02

Convolutions, pooling and dense layers change different dimensions of the representation.

- **Kinds.** `block-stack` · `tensor`
- **Elements.** An invented input shape, two convolution/pooling pairs with channel and spatial sizes, the flattened width and the final output width. Derive dimensions from the toy setup.
- **Sequence.** LeNet 2/3. Account for shapes along the network

## Figure 03

Loss and held-out accuracy track different aspects of training progress.

- **Kinds.** `coordinate-plot` · `comparison`
- **Elements.** An independent training run on aligned epoch axes. Plot training and held-out loss together, and held-out accuracy on a separate scale. Distinguish the early plateau from later improvement.
- **Sequence.** LeNet 3/3. Read the training diagnostics. Implementation rendering 1/4
- **Phase 02.** [09](../briefs/09-model-evaluation.md)

## Figure 04

Loss and held-out accuracy track different aspects of training progress.

- **Kinds.** `coordinate-plot` · `comparison`
- **Elements.** An independent training run on aligned epoch axes. Plot training and held-out loss together, and held-out accuracy on a separate scale. Distinguish the early plateau from later improvement.
- **Sequence.** LeNet 3/3. Read the training diagnostics. Implementation rendering 2/4
- **Phase 02.** [09](../briefs/09-model-evaluation.md)

## Figure 05

Loss and held-out accuracy track different aspects of training progress.

- **Kinds.** `coordinate-plot` · `comparison`
- **Elements.** An independent training run on aligned epoch axes. Plot training and held-out loss together, and held-out accuracy on a separate scale. Distinguish the early plateau from later improvement.
- **Sequence.** LeNet 3/3. Read the training diagnostics. Implementation rendering 3/4
- **Phase 02.** [09](../briefs/09-model-evaluation.md)

## Figure 06

Loss and held-out accuracy track different aspects of training progress.

- **Kinds.** `coordinate-plot` · `comparison`
- **Elements.** An independent training run on aligned epoch axes. Plot training and held-out loss together, and held-out accuracy on a separate scale. Distinguish the early plateau from later improvement.
- **Sequence.** LeNet 3/3. Read the training diagnostics. Implementation rendering 4/4
- **Phase 02.** [09](../briefs/09-model-evaluation.md)
