# 7.4. Multiple Input and Multiple Output Channels figure briefs

2 figure occurrences in document order. [Source page](https://d2l.ai/chapter_convolutional-neural-networks/channels.html) · [Inventory](manifest.json)

## Figure 01

One filter for multi-channel input takes a local response in each channel and adds those contributions.

- **Kinds.** `heatmap` · `matrix`
- **Elements.** Aligned toy channels, corresponding per-channel weights, partial sums at one location and their combined output.
- **Sequence.** Convolution channels 1/2. Combine input channels

## Figure 02

A pointwise convolution mixes channels at each location without combining neighboring locations.

- **Kinds.** `tensor` · `transformation`
- **Elements.** Hold one spatial coordinate fixed, stack the input-channel values, multiply by a channel-mixing weight table, and show the output vector at the same coordinate.
- **Sequence.** Convolution channels 2/2. Isolate channel mixing from spatial mixing
