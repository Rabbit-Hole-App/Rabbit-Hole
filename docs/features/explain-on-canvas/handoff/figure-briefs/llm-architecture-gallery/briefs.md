# LLM Architecture Gallery figure briefs

125 figure occurrences in document order. [Source page](https://sebastianraschka.com/llm-architecture-gallery/) · [Inventory](manifest.json)

## Figure 01

The gallery overview shows the breadth of models available for comparison.

- **Kinds.** Source navigation or incidental visual.
- **Elements.** Navigation montage. Its small panels are represented by the individual figures below.
- **Sequence.** Opening overview

## Figure 02

The poster preview shows the same gallery in a printed format.

- **Kinds.** Source navigation or incidental visual.
- **Elements.** Presentation of the poster. No new teaching mechanism.
- **Sequence.** Opening poster preview

## Figure 03

A dense autoregressive decoder can combine learned absolute position vectors with ordinary multi-head attention.

- **Kinds.** `block-stack` · `transformation`
- **Elements.** Add position-specific embeddings to token embeddings, name the causal multi-head mixer, and show a per-token feed-forward update with residual additions.
- **Sequence.** Classic dense decoder baseline

## Figure 04

Grouped-query attention can share key and value projections while keeping separate query heads in a pre-normalized decoder.

- **Kinds.** `block-stack` · `relationship`
- **Elements.** Show normalization before each sublayer, a many-query-to-fewer-key/value grouping, rotary position handling, and the two residual additions.
- **Sequence.** Modern dense decoder baseline
- **Existing reference.** `ml-llama-decoder-block`

## Figure 05

A compact decoder can shrink its layer stack while keeping grouped-query attention and a dense token update.

- **Kinds.** `block-stack` · `comparison`
- **Elements.** Use two toy depth-and-width settings, show the same internal block in both, and make separate the layer count and the width of the token state.
- **Sequence.** Compact dense decoder scale comparison

## Figure 06

Normalizing a sublayer's result inside its residual branch differs from normalizing the stream before the sublayer.

- **Kinds.** `block-stack` · `matrix`
- **Elements.** Show the unmodified shortcut, separate query/key normalization in attention, and the order sublayer → normalization → addition. Compare pre-normalization using identical blocks.
- **Sequence.** Normalization placement comparison

## Figure 07

A model can compress the attention cache and still route token updates through a large expert bank.

- **Kinds.** `block-stack` · `flow`
- **Elements.** Show the compact cached representation and routed expert section with an always-on branch. Mark the dense opening when showing the full stack.
- **Sequence.** Latent-attention sparse decoder baseline

## Figure 08

Different post-training objectives can produce a reasoning-oriented model with the same decoder topology.

- **Kinds.** `comparison` · `block-stack`
- **Elements.** Show one compressed-attention and sparse-update stack. Explain the reasoning-focused training objective alongside it. Both gallery entries use the same architecture image.
- **Sequence.** Compare with figure 7

## Figure 09

A mostly local decoder uses occasional global layers to reconnect information beyond the local window.

- **Kinds.** `block-stack` · `token-links`
- **Elements.** Show the recurring local and global attention pattern, shared key/value groups, and the placement of normalization around attention and the gated token update.
- **Sequence.** Local/global dense decoder baseline
- **Existing reference.** `ml-gemma-decoder-stack`

## Figure 10

A dense grouped-query decoder can give every layer full context while reducing cache size through head sharing.

- **Kinds.** `block-stack` · `comparison`
- **Elements.** Show the full causal receptive field at each layer, a small shared key/value bank, and a dense token update. Hold the toy sequence constant against a windowed example.
- **Sequence.** Compare with figure 9

## Figure 11

Changes to the attention field and changes to the feed-forward route can follow different schedules in the same decoder.

- **Kinds.** `block-stack` · `matrix`
- **Elements.** Use a toy layer table that marks chunk-local versus full grouped-query attention independently from dense versus expert-based token updates. The original figure shows the update schedule and the page lists the attention mix.
- **Sequence.** Sparse decoder with two layer schedules

## Figure 12

Small decoder capacity can be allocated to more narrow layers instead of fewer wide layers.

- **Kinds.** `comparison` · `block-stack`
- **Elements.** Use the same attention and dense update mechanisms in both toy stacks. Change the number of repeats and state width separately.
- **Sequence.** Compare compact scaling with figure 5

## Figure 13

A routed-expert bank can update a token using selected experts without any shared expert branch.

- **Kinds.** `flow` · `block-stack`
- **Elements.** Rank candidate experts for a toy token, activate and combine the chosen routes, and keep a normalized grouped-query attention block upstream.
- **Sequence.** Routed-only decoder baseline

## Figure 14

Sparse routing separates the size of the available expert bank from the work performed for one token.

- **Kinds.** `flow` · `block-stack`
- **Elements.** Draw the per-token selection and weighted combine, plus a depth marker showing that this routing repeats within a deeper decoder.
- **Sequence.** Compact routed-only decoder

## Figure 15

A dense grouped-query block can normalize its queries and keys before measuring their similarity.

- **Kinds.** `flow` · `block-stack`
- **Elements.** Trace separate query/key projections through normalization into the score computation, showing values joining only after the scores become weights.
- **Sequence.** Dense Q/K-normalized baseline

## Figure 16

A compact dense decoder can keep the vocabulary interface distinct from the narrower internal token state.

- **Kinds.** `block-stack` · `tensor`
- **Elements.** Keep embedding/output dimensions distinct from hidden state width. Show one normalized-attention block and a dense update with illustrative widths.
- **Sequence.** Compact instance of the dense normalized-attention family

## Figure 17

Matching depth and attention grouping does not imply matching token-state or feed-forward widths.

- **Kinds.** `comparison` · `block-stack`
- **Elements.** Align two same-depth stacks and annotate the toy state and hidden dimensions while keeping the grouped attention and normalization paths identical.
- **Sequence.** Compare with figure 16

## Figure 18

Position rotations can be omitted in selected decoder layers while other layers still inject positional information.

- **Kinds.** `block-stack` · `matrix`
- **Elements.** Show a short layer schedule with rotation enabled or absent, keep grouped attention in both layer types, and distinguish the causal mask from positional encoding.
- **Sequence.** Position-encoding schedule variant

## Figure 19

Compressed attention and expert routing can be retained while capacity is shifted between the attention heads and the expert bank.

- **Kinds.** `comparison` · `block-stack`
- **Elements.** Compare two illustrative decoders with the same latent cache and selected expert paths but different head and expert counts. Keep total and active capacity separate.
- **Sequence.** Compare sparse scaling with figure 7

## Figure 20

A sparse decoder can combine normalized grouped attention with a dense opening and an always-on shared token update.

- **Kinds.** `block-stack` · `flow`
- **Elements.** Trace the dense prefix and normalized query/key path. Show selected experts and one shared expert contributing to the same token update.
- **Sequence.** Grouped-query alternative to figure 7

## Figure 21

An alternating local/global attention schedule can stay fixed as the sparse decoder is scaled up.

- **Kinds.** `block-stack` · `matrix`
- **Elements.** Alternate receptive-field types on an illustrative layer schedule, preserve expert routing in both kinds, and compare repeats separately from active experts.
- **Sequence.** Larger model in the alternating-attention pair

## Figure 22

The smaller decoder can use the same number of routed experts per token while offering a smaller expert bank.

- **Kinds.** `comparison` · `flow`
- **Elements.** Compare two banks with different sizes, show the same active route count, and keep the local/global attention schedule fixed. A learned sink score is optional context from the article and separate from expert routing.
- **Sequence.** Smaller model in the alternating-attention pair

## Figure 23

A tiny decoder can reuse one key/value head while preserving a mix of local and global attention.

- **Kinds.** `relationship` · `block-stack`
- **Elements.** Connect several query heads to one key/value projection and distinguish that sharing from the separate receptive-field schedule.
- **Sequence.** Compare attention sharing with figure 9

## Figure 24

An unconditional gated update can contribute alongside the selected expert outputs.

- **Kinds.** `flow` · `block-stack`
- **Elements.** Fork one token through an always-on branch and selected specialists. Show the gated dense branch once and make their contributions meet at a sum.
- **Sequence.** Shared-path sparse variant
- **Existing reference.** `ml-moe-top-two-experts`

## Figure 25

A hybrid decoder can handle most layers with gated state updates and use attention in selected layers.

- **Kinds.** `block-stack` · `matrix`
- **Elements.** Contrast state read/update with token-to-token attention, show the repeating hybrid pattern, and place routed and shared token updates after mixing.
- **Sequence.** Gated-state hybrid baseline

## Figure 26

A full-context sparse decoder can rotate only part of each query/key vector and normalize before scoring.

- **Kinds.** `tensor` · `block-stack`
- **Elements.** Mark rotated and unchanged cells on a toy query/key strip. Show full causal attention and a sparse expert update separately.
- **Sequence.** Partial-position sparse decoder variant

## Figure 27

A recurrent mixer can preprocess nearby tokens while a separate residual mechanism gathers information from earlier block groups.

- **Kinds.** `flow` · `block-stack`
- **Elements.** Trace the query, key, and value projections through local convolutions into a gated state update. Distinguish the occasional latent-attention layer and show how the input embedding and prior group summaries feed an across-depth weighted residual.
- **Sequence.** Short-convolution hybrid with cross-layer residual aggregation

## Figure 28

A large post-normalized decoder can share key/value groups and apply a context extension only in its global attention layers.

- **Kinds.** `block-stack` · `matrix`
- **Elements.** Mark local and global layer types and where the position scaling applies. Show normalization on the sublayer output before residual addition.
- **Sequence.** Larger post-normalized local/global decoder

## Figure 29

A smaller post-normalized decoder can use independent key/value heads while retaining the same local/global layout.

- **Kinds.** `comparison` · `block-stack`
- **Elements.** Hold the normalization and layer schedule constant, then show independent key/value heads beside a grouped sharing example.
- **Sequence.** Compare with figure 28

## Figure 30

Sparse attention first narrows the candidate tokens, then scores that selected subset using a compact cache.

- **Kinds.** `flow` · `matrix`
- **Elements.** Show the inexpensive candidate filter, the selected token set, the attention score over that set, and the later expert update as a distinct routing problem.
- **Sequence.** Token-selection extension of figure 7

## Figure 31

A latent-attention sparse decoder can redistribute capacity into larger expert networks without changing its attention mechanism.

- **Kinds.** `comparison` · `block-stack`
- **Elements.** Keep one compressed-attention block fixed. Vary the size and count of expert networks while showing which paths a toy token actually uses.
- **Sequence.** Expert granularity comparison with figure 7

## Figure 32

A hybrid stack can mix token history mainly through a carried state and invoke attention only at selected depths.

- **Kinds.** `block-stack` · `relationship`
- **Elements.** Show a state update between successive tokens, occasional attention layers, and the independent sparse token update blocks.
- **Sequence.** State-space and expert hybrid baseline

## Figure 33

A narrow local attention window limits the positions most layers can read, while occasional global layers restore long-range links.

- **Kinds.** `token-links` · `block-stack`
- **Elements.** Contrast two illustrative receptive fields with one sequence. Mark the sparse token update and keep extra prediction heads outside the attention comparison.
- **Sequence.** Narrow-window sparse decoder variant

## Figure 34

An auxiliary prediction stack can predict more future positions while the backbone retains its grouped attention and sparse expert structure.

- **Kinds.** `flow` · `block-stack`
- **Elements.** Show the grouped-attention backbone with its dense opening and expert branches. Use a separate visual for the future-position predictions described by the page, since the architecture image shows the core stack only.
- **Sequence.** Compare additional prediction heads with figure 20

## Figure 35

A decoder can combine local/global attention, selective position rotation, and normalization on both sides of a sublayer.

- **Kinds.** `block-stack` · `matrix`
- **Elements.** Mark position rotation and attention reach as separate columns of a short layer schedule. Show the normalization order and sparse feed-forward branch.
- **Sequence.** Gated local/global sparse decoder variant

## Figure 36

Switching the attention path to latent storage and token selection changes the cost of reading history while preserving expert-based updates.

- **Kinds.** `comparison` · `flow`
- **Elements.** Compare grouped attention to compressed-cache plus candidate filtering on the same toy prefix. Keep expert routing fixed.
- **Sequence.** Attention migration from figure 34

## Figure 37

Projecting into a smaller expert space can reduce the work done inside routed networks without changing the outer state size.

- **Kinds.** `transformation` · `block-stack`
- **Elements.** Route using the original input, then down-project the inputs to selected specialists and up-project their combined output. Show the always-on expert operating on the original full-width input before the final sum.
- **Sequence.** Latent-expert extension of figure 32

## Figure 38

Global layers can reuse a joint key/value projection while local layers use the family's ordinary attention path.

- **Kinds.** `comparison` · `block-stack`
- **Elements.** Show the same toy token state in both paths, one unified projection for global layers, and where the chosen subset of coordinates receives position rotation.
- **Sequence.** Joint-projection extension of figure 9

## Figure 39

The attention schedule can remain the same when dense token-update networks are replaced by sparse routing.

- **Kinds.** `comparison` · `block-stack`
- **Elements.** Align local/global and shared projection blocks, then highlight the substitution of selected and shared experts for the dense feed-forward update.
- **Sequence.** Sparse counterpart to figure 38
- **Existing reference.** `ml-dense-vs-moe-architecture`

## Figure 40

The text decoder can retain the same local/global pattern even when a model's surrounding input system changes.

- **Kinds.** `block-stack`
- **Elements.** Bound the figure to token embeddings, the repeated local/global decoder blocks, and the output head. Distinguish text-decoder mechanics from other input paths.
- **Sequence.** Text backbone view, compare with figure 38

## Figure 41

Input embeddings and the output score projection can share one parameter matrix in a compact decoder.

- **Kinds.** `relationship` · `tensor`
- **Elements.** Draw one embedding table read at input and reused at output, mark the token and vocabulary dimensions, and keep hidden blocks between the two uses.
- **Sequence.** Tied weights in the compact Llama family

## Figure 42

A coding-trained checkpoint can use a conventional grouped-query and sparse-expert decoder.

- **Kinds.** `block-stack` · `flow`
- **Elements.** Show the grouped-attention mixer and a token-specific route into a selected expert subset. Separate coding data from the decoder's block structure.
- **Sequence.** Specialized checkpoint using the Qwen routed-only pattern

## Figure 43

A latent-attention sparse backbone can serve as the text decoder in a multimodal system without showing the modality front end.

- **Kinds.** `block-stack`
- **Elements.** Mark the decoder boundary, compressed attention, and selected expert updates. Clearly state that input encoders and projections sit outside the pictured stack.
- **Sequence.** Text backbone of the extension to figure 19

## Figure 44

Additional next-token heads can propose future tokens alongside a decoder that alternates local and global attention.

- **Kinds.** `flow` · `block-stack`
- **Elements.** Keep the pictured local/global backbone and its expert routing together. Show the draft heads described by the page separately from the ordinary next-token output and the verifier.
- **Sequence.** Draft-head sparse decoder variant

## Figure 45

A model can leave its embedding table and vocabulary projection untied while using otherwise similar decoder blocks.

- **Kinds.** `comparison` · `relationship`
- **Elements.** Compare one shared parameter table with two separate ones. Keep the block stack fixed and follow the shapes in each direction.
- **Sequence.** Untied counterpart to figure 41

## Figure 46

Sparse feed-forward computation can coexist with full causal attention in every layer.

- **Kinds.** `block-stack` · `flow`
- **Elements.** Trace normalized grouped attention, per-token expert selection, and the output. The comparison with figure 26 can hold routing fixed and focus on the common full-prefix attention path.
- **Sequence.** Compare with figure 26

## Figure 47

In a parallel decoder block, attention and the per-token update can both read the same input before their results are combined.

- **Kinds.** `flow` · `comparison`
- **Elements.** Fork a normalized state into attention and feed-forward routes, merge their results with the shortcut, and contrast a serial block where the second sublayer reads the first result.
- **Sequence.** Parallel residual-block example

## Figure 48

A long-context sparse decoder can use recurrent linear mixing most of the time and latent attention at intervals.

- **Kinds.** `block-stack` · `relationship`
- **Elements.** Show both mixing modes on a toy stack and distinguish the recurring state summary from the stored latent token history.
- **Sequence.** Alternative hybrid mixer to figures 25 and 27

## Figure 49

A hybrid mixing schedule can scale up independently of the number of experts available for token updates.

- **Kinds.** `comparison` · `block-stack`
- **Elements.** Keep the sequence of gated state and attention blocks aligned across two toy sizes, then compare the selected expert work against the capacity of each bank.
- **Sequence.** Scaled companion to figure 25

## Figure 50

Changing the token inventory for language coverage is separate from how a grouped-attention MoE decoder routes a token.

- **Kinds.** `block-stack` · `tensor`
- **Elements.** Show the token-to-state and state-to-vocabulary projections around a compact normalized-attention stack, then mark the selected expert routes inside a block.
- **Sequence.** Smaller model in the language-coverage pair

## Figure 51

A larger member of the same sparse family can trade grouped key/value heads for a normalized latent cache.

- **Kinds.** `comparison` · `transformation`
- **Elements.** Keep the vocabulary and expert update roles aligned. Trace full key/value projections versus one smaller cached representation, separating positional coordinates.
- **Sequence.** Compare attention with figure 50

## Figure 52

A dense pre-normalized decoder can return to full-prefix attention while sharing keys and values across query heads.

- **Kinds.** `block-stack` · `token-links`
- **Elements.** Show the full set of earlier tokens visible at one layer, group queries around shared key/value heads, and place normalization before both sublayers.
- **Sequence.** Full-context pre-normalized dense baseline

## Figure 53

A recurrent decoder can carry a matrix memory forward instead of retaining key/value entries for every earlier token.

- **Kinds.** `relationship` · `cycle`
- **Elements.** Show the current token reading and updating a carried memory state, then pass the resulting state to the next step. Contrast this with looking up old token entries.
- **Sequence.** Matrix-memory recurrent alternative

## Figure 54

The smaller member of a sparse family can keep a short dense prefix and the same expert and auxiliary prediction roles.

- **Kinds.** `block-stack` · `comparison`
- **Elements.** Compare two layer counts with a dense-to-routed transition and grouped attention. Mark the compact model's smaller expert bank and note any prediction heads outside the depicted stack.
- **Sequence.** Compact counterpart to figure 20

## Figure 55

Reapplying one decoder stack increases the number of block applications without learning separate parameters for each pass.

- **Kinds.** `cycle` · `flow`
- **Elements.** Draw one shared stack with a return edge and candidate outputs scored by a learned exit gate. Clarify that the implementation described in the source computes all passes before choosing an output.
- **Sequence.** Shared-stack recurrent pass example

## Figure 56

A post-trained model can retain the same dense-to-sparse decoder stack while changing its behavior through training.

- **Kinds.** `comparison` · `block-stack`
- **Elements.** Show the unchanged decoder once, and place supervised and reward-based training changes on a separate track without adding inference blocks.
- **Sequence.** Post-training comparison with figure 54

## Figure 57

A shortcut router can mix learned experts with bypass paths, so some selected routes contribute no new transformation.

- **Kinds.** `flow` · `block-stack`
- **Elements.** Show a dense backbone with an auxiliary shortcut that selects learned experts and no-computation choices. Keep nearby-token embedding features and the later shortcut sum distinct from the router.
- **Sequence.** Shortcut expert-routing example

## Figure 58

A decoder family can switch from a dense grouped-attention design to latent attention and sparse token updates.

- **Kinds.** `comparison` · `block-stack`
- **Elements.** Align the two decoder backbones, emphasize the cache and token-update changes, and show one always-on expert beside the routed subset.
- **Sequence.** Architecture change relative to figure 10

## Figure 59

A compact hybrid decoder can use mostly state-space mixing and keep the feed-forward blocks dense.

- **Kinds.** `block-stack` · `matrix`
- **Elements.** Show state-space, attention, and dense update blocks as independent scheduled components. Distinguish this from a routed expert hybrid.
- **Sequence.** Dense hybrid counterpart to figure 32

## Figure 60

The same sparse decoder can support speculative generation through auxiliary draft heads.

- **Kinds.** `flow` · `block-stack`
- **Elements.** Show the retained full grouped-attention and routed-expert backbone. Use a second visual for the future-token proposals described on the page and their verification against the ordinary model output.
- **Sequence.** Inference companion to figure 46

## Figure 61

Small layer-specific token embeddings can add information at depth without expanding the entire residual stream.

- **Kinds.** `relationship` · `block-stack`
- **Elements.** Draw the main token stream and small layer-local vectors entering separate blocks. Keep attention grouping and layer-local additions distinct.
- **Sequence.** Smaller layer-embedding edge decoder

## Figure 62

Layer-specific embeddings can be retained while more key/value groups and a wider token stream increase model capacity.

- **Kinds.** `comparison` · `block-stack`
- **Elements.** Align two toy edge decoders with the same layer-local feature path. Emphasize the different state widths and shared attention grouping.
- **Sequence.** Larger counterpart to figure 61

## Figure 63

A decoder can begin with only recent-token attention and use two history-compression paths in later layers.

- **Kinds.** `block-stack` · `matrix`
- **Elements.** Show the local-only opening followed by layers with compressed history reads. Use a small illustrative token history to distinguish more selective fine-grained reads from coarser summaries. Keep expert routing and residual mixing as separate functions.
- **Sequence.** Smaller dual-compression decoder

## Figure 64

Multiple residual streams can exchange information around attention and expert blocks while attention itself uses compressed history.

- **Kinds.** `relationship` · `matrix`
- **Elements.** Show several carried streams reduced to one sublayer input and mixed back into separate outputs. Use an illustrative mixing matrix and contrast the early coarse-history reads with the local-only opening of figure 63.
- **Sequence.** Larger dual-compression decoder, compare with figure 63

## Figure 65

Local attention and sparse feed-forward routing solve different problems inside one decoder block.

- **Kinds.** `block-stack` · `flow`
- **Elements.** Contrast a nearby window with periodic wider lookup. Show a dense opening stage and the later split between an always-on expert and the selected experts.
- **Sequence.** Gallery model card 63; standalone comparison entry

## Figure 66

Convolution can compact the history used by grouped attention while a separate router chooses one expert for the feed-forward update.

- **Kinds.** `block-stack` · `flow`
- **Elements.** Show one short convolution on the attention side, grouped query sharing, then one selected expert. Keep the two choices in distinct blocks.
- **Sequence.** Gallery model card 64; standalone comparison entry

## Figure 67

A decoder can retrieve a subset of compressed token states before applying sparse expert updates in its later layers.

- **Kinds.** `block-stack` · `flow`
- **Elements.** Separate the compressed-attention index from expert routing. Mark the dense opening blocks before the repeated sparse feed-forward blocks.
- **Sequence.** Gallery model card 65; standalone comparison entry

## Figure 68

A decoder can alternate recurrent-style token mixing with occasional direct attention while routing feed-forward updates sparsely in both.

- **Kinds.** `block-stack` · `flow`
- **Elements.** Show several state-mixing stages followed by one full token-lookup stage. Attach the same kind of sparse feed-forward routing to each mixer.
- **Sequence.** Gallery model card 66; standalone comparison entry

## Figure 69

A single text backbone can combine compressed attention history with a mixture of shared and selected expert updates.

- **Kinds.** `block-stack` · `flow`
- **Elements.** Separate compact attention memory from expert choice. Identify the opening dense block and show a shared expert running alongside the routed subset.
- **Sequence.** Gallery model card 67; standalone comparison entry

## Figure 70

A hybrid token-mixing schedule can coexist with a dense feed-forward update.

- **Kinds.** `block-stack` · `comparison`
- **Elements.** Show several gated state layers between direct attention stages. Put the same kind of dense feed-forward network after either mixer.
- **Sequence.** Gallery model card 68; standalone comparison entry

## Figure 71

Within a multimodal model's language backbone, most layers use nearby context while selected layers reach farther back.

- **Kinds.** `block-stack`
- **Elements.** Show the text stream, several nearby attention stages between wide stages, and sparse per-token experts. A dense first block is outside the repetition. Keep image and audio processing outside the depicted text subsystem.
- **Sequence.** Gallery model card 69; standalone comparison entry

## Figure 72

Expanding a model can add more expert capacity without turning the sparse feed-forward stage into a dense one.

- **Kinds.** `comparison` · `flow`
- **Elements.** Compare smaller and larger pools on a single token, marking selected experts and alternating nearby and broad context stages separately.
- **Sequence.** Gallery model card 70; standalone comparison entry

## Figure 73

The decoder can mix a state-based attention path with latent attention and attach an auxiliary predictor to propose later tokens.

- **Kinds.** `block-stack` · `flow`
- **Elements.** Show a long sequence of efficient mixers between latent-attention stages, the dense-to-expert feed-forward switch, and a separate auxiliary prediction head.
- **Sequence.** Gallery model card 71; standalone comparison entry

## Figure 74

A dense first feed-forward layer can feed a repeated sparse expert stack that also supports an auxiliary token proposal.

- **Kinds.** `block-stack` · `flow`
- **Elements.** Mark the opening dense block and the repeating attention-and-expert stack. A separate annotation places multi-token prediction beyond the main output.
- **Sequence.** Gallery model card 72; standalone comparison entry

## Figure 75

A dense block can normalize the query and key vectors before grouped attention, while the feed-forward gate works on a separate per-token branch.

- **Kinds.** `block-stack` · `flow`
- **Elements.** Show query and key normalization and a position transform entering attention. Draw the two residual joins and isolate the gated dense feed-forward step.
- **Sequence.** Gallery model card 73; standalone comparison entry

## Figure 76

Attention and expert computation can consume the same input in parallel and merge their updates.

- **Kinds.** `flow` · `block-stack`
- **Elements.** Fork one normalized stream into the attention route and the expert route, then join their outputs with the residual stream.
- **Sequence.** Gallery model card 74; standalone comparison entry

## Figure 77

A decoder can change how frequently attention appears at different depths while keeping short convolution and dense token updates.

- **Kinds.** `block-stack` · `matrix`
- **Elements.** Group neighboring short-convolution layers, show periods with different gaps between grouped attention, and keep a dense feed-forward update under either mixer.
- **Sequence.** Gallery model card 75; standalone comparison entry

## Figure 78

Short convolution mixes nearby tokens between layers that can read a wider token context.

- **Kinds.** `block-stack` · `flow`
- **Elements.** Use a short input-varying convolution stage and a grouped-attention stage in a shared layer schedule. Pair each with a dense update and show how several query heads share memory heads.
- **Sequence.** Gallery model card 76; standalone comparison entry

## Figure 79

Short convolution and grouped attention can both feed a routed per-token update from the start of a decoder.

- **Kinds.** `block-stack` · `matrix`
- **Elements.** Show the convolution-only opening and later groups that include grouped attention. Expert routing follows both mixer types from the start.
- **Sequence.** Gallery model card 77; standalone comparison entry

## Figure 80

A sparse expert decoder can allocate some layers to full-prefix attention and use a positional transform across a schedule dominated by windows.

- **Kinds.** `block-stack` · `comparison`
- **Elements.** Mark short-window and full-prefix stages and the extended-position input to attention. Keep expert selection in the per-token branch.
- **Sequence.** Gallery model card 78; standalone comparison entry

## Figure 81

A state-space mixer, grouped attention layer, and latent expert update serve distinct roles within one hybrid decoder.

- **Kinds.** `block-stack` · `flow`
- **Elements.** Show where state-space updates and grouped direct lookup appear. Trace a feed-forward input through a width reduction, selected experts, a width restoration, and an always-on expert bypass.
- **Sequence.** Gallery model card 79; standalone comparison entry

## Figure 82

Parallel attention and expert updates can share one block while nearby and full attention use different position rules.

- **Kinds.** `flow` · `block-stack`
- **Elements.** Use a fork and merge for the two updates; label local position encoding as a property of the local attention stage.
- **Sequence.** Gallery model card 80; standalone comparison entry

## Figure 83

A coding-oriented decoder can use compressed attention for context and keep the experts as independent feed-forward modules.

- **Kinds.** `block-stack` · `flow`
- **Elements.** Use one dense opening block and a repeated latent-attention-plus-experts block. Trace one selected expert and the separate shared expert without attributing the ability to code to a block alone.
- **Sequence.** Gallery model card 81; standalone comparison entry

## Figure 84

Dense opening layers can hand off to later layers that sparsify both attention targets and expert updates.

- **Kinds.** `block-stack` · `flow`
- **Elements.** Identify the dense prefix; in the repeated section use distinct selectors for earlier token blocks and feed-forward experts.
- **Sequence.** Gallery model card 82; standalone comparison entry

## Figure 85

A small dense reasoning model can share attention memory across query heads while giving every token the same gated feed-forward network.

- **Kinds.** `block-stack` · `token-links`
- **Elements.** Keep position handling on the grouped attention side and a single gated FFN in the second residual branch. Illustrate more query groups than key and value pairs.
- **Sequence.** Gallery model card 83; standalone comparison entry

## Figure 86

Reusing the attention index lets several layers read the same selected positions instead of repeating the search.

- **Kinds.** `relationship` · `flow`
- **Elements.** Draw one index computation and connect its results to later attention stages; keep each stage's scoring and update separate.
- **Sequence.** Gallery model card 84; standalone comparison entry

## Figure 87

A decoder refresh can extend usable context without routing every token through the whole expert bank.

- **Kinds.** `comparison` · `block-stack`
- **Elements.** Show the context setting as the changed row. The opening dense block, short-window schedule, and shared-plus-routed expert split can all stay in the same positions.
- **Sequence.** Gallery model card 85; standalone comparison entry

## Figure 88

Irregularly grouped state and attention layers can all feed one style of sparse token update.

- **Kinds.** `block-stack` · `matrix`
- **Elements.** Show groups of state-space layers of different lengths with direct attention between some groups. Keep an expert update after each mixer and distinguish the shared expert.
- **Sequence.** Gallery model card 86; standalone comparison entry

## Figure 89

A decoder can express position through relative score bias while short convolutions mix nearby tokens inside each block.

- **Kinds.** `block-stack` · `matrix`
- **Elements.** Trace a causal convolution on the keys and values into attention. Add a learned relative offset to the score. Show separate output convolutions on the attention and expert branches.
- **Sequence.** Gallery model card 87; standalone comparison entry

## Figure 90

A small adapter can add a learned correction to selected weight projections while leaving the hybrid backbone in place.

- **Kinds.** `relationship` · `transformation`
- **Elements.** Use the diagram’s base-versus-adapted distinction to draw one frozen projection plus a learned low-rank correction. Keep the state/attention schedule and dense updates shared.
- **Sequence.** Gallery model card 88; standalone comparison entry

## Figure 91

Grouped attention and a gated dense update can use separate pre-normalized residual branches in a small decoder.

- **Kinds.** `block-stack` · `flow`
- **Elements.** Put a position transform on the query/key path. Give each residual branch its own normalization and show the gate multiplying the two feed-forward projections.
- **Sequence.** Gallery model card 89; standalone comparison entry

## Figure 92

Expert capacity, the number of experts used per token, and attention head grouping are separate choices.

- **Kinds.** `block-stack` · `flow`
- **Elements.** Hold the local/global schedule constant; mark a dense prefix, an always-on expert, and a configurable selected subset.
- **Sequence.** Gallery model card 90; standalone comparison entry

## Figure 93

A decoder can mix several residual streams around a sublayer while keeping its gated differential attention and expert computations distinct.

- **Kinds.** `relationship` · `block-stack`
- **Elements.** Show a read from several residual streams, one sublayer computation, and redistribution to the streams. On the attention side identify a difference between score maps. Keep the expert gate separate.
- **Sequence.** Gallery model card 91; standalone comparison entry

## Figure 94

Applying a stack twice can double the number of block applications without creating a second set of weights.

- **Kinds.** `cycle` · `block-stack`
- **Elements.** Show two passes returning to the same parameter group and distinguish unique blocks from total executions.
- **Sequence.** Gallery model card 92; standalone comparison entry

## Figure 95

A hybrid layer schedule can pair a recurrent mixer with a local convolution and periodic gated token lookup.

- **Kinds.** `block-stack` · `flow`
- **Elements.** Mark the short convolution and gated state update inside the recurrent mixer. Interleave full grouped attention and keep shared plus routed experts after either mixer.
- **Sequence.** Gallery model card 93; standalone comparison entry

## Figure 96

An attention residual can read selected earlier block summaries instead of relying only on the latest stream.

- **Kinds.** `relationship` · `block-stack`
- **Elements.** Let the embedding and earlier block summaries contribute to the current attention and feed-forward inputs. Distinguish those depth-wise reads from each mixer’s token-context path.
- **Sequence.** Gallery model card 94; standalone comparison entry

## Figure 97

A fine-grained recurrent gate controls how each part of the state carries forward while occasional latent attention handles direct lookup.

- **Kinds.** `block-stack` · `flow`
- **Elements.** Place the gate on the state update and contrast the latent-attention stage. Mark the dense opening blocks and note that the source leaves the auxiliary predictor outside the drawing.
- **Sequence.** Gallery model card 95; standalone comparison entry

## Figure 98

Nearby and full-context attention can treat position differently while sharing the same output gate.

- **Kinds.** `block-stack` · `comparison`
- **Elements.** Contrast the local positional transform with the global score path, then show both producing an attention output that is gated before projection.
- **Sequence.** Gallery model card 96; standalone comparison entry

## Figure 99

Grouping state-space, grouped attention and expert blocks can keep token mixing separate from per-token routing through a long decoder.

- **Kinds.** `block-stack` · `matrix`
- **Elements.** Label the macroblock sequence and use only the confirmed roles for the attention inset. The diagram leaves the detailed attention breakdown and auxiliary predictor outside the teaching example.
- **Sequence.** Gallery model card 97; standalone comparison entry

## Figure 100

A diagram of a vision-language model's text backbone can show the state and attention schedule without claiming to show image processing.

- **Kinds.** `block-stack`
- **Elements.** Use different block roles for gated recurrent mixing and direct attention, keep dense feed-forward updates, and mark the text-only scope.
- **Sequence.** Gallery model card 98; standalone comparison entry

## Figure 101

The same recurrent/direct-attention schedule can retain its expert stage across a decoder release.

- **Kinds.** `block-stack` · `comparison`
- **Elements.** Hold the state layers, periodic full token lookup, and expert updates fixed. Compare the two mixer forms and focus on what the text stack still computes.
- **Sequence.** Gallery model card 99; standalone comparison entry

## Figure 102

Several residual streams can pass state to one shared sublayer and be redistributed after it.

- **Kinds.** `relationship` · `block-stack`
- **Elements.** Use parallel residual streams feeding a learned read/mix stage and a shared sublayer. Return the updated signal through a learned redistribution; keep the outer token-mixing and expert schedule distinct.
- **Sequence.** Gallery model card 100; standalone comparison entry

## Figure 103

Block-level sparse attention can read all visible positions in the current partial block and a selected subset of completed blocks.

- **Kinds.** `heatmap` · `block-stack`
- **Elements.** Mark selected older blocks and legal positions in the partial current block on a causal grid. Show the early token-fragment feature lookup and gated residual state separately.
- **Sequence.** Gallery model card 101; standalone comparison entry

## Figure 104

A decoder can gate a sparse read from earlier tokens while collapsing and updating parallel residual streams with a separate rule.

- **Kinds.** `heatmap` · `relationship`
- **Elements.** Mark the selected causal positions on a mask. Draw a gated sum into one sublayer, then gated writes back to the same streams with each original branch kept.
- **Sequence.** Gallery model card 102; standalone comparison entry

## Figure 105

An autoregressive decoder can reuse global keys and values produced by an encoder while maintaining its own local history.

- **Kinds.** `relationship` · `block-stack`
- **Elements.** Separate the causal encoder from the output decoder and trace a shared global key/value path between them. Differentiate index creation, index refresh, and reuse from local context.
- **Sequence.** Gallery model card 103; standalone comparison entry

## Figure 106

The sparse attention mask and the expert router select from different sets within one decoder.

- **Kinds.** `flow` · `block-stack`
- **Elements.** Show the permitted previous-token positions for grouped attention separately from the per-token choice of experts. Mark the dense prefix before later expert updates.
- **Sequence.** Gallery model card 104; standalone comparison entry

## Figure 107

A decoder can pick only routed experts after a dense prefix and still use a separate mechanism for draft generation.

- **Kinds.** `block-stack` · `flow`
- **Elements.** Separate the dense prefix from later routed expert stages without an always-on expert. Keep the separate draft decoder as an annotation outside the text backbone.
- **Sequence.** Gallery model card 105; standalone comparison entry

## Figure 108

Making the decoder deeper or enlarging the expert pool does not require changing the basic local/global mixing pattern.

- **Kinds.** `comparison` · `block-stack`
- **Elements.** Compare two illustrative scale settings with the same routing semantics and a visible local/global layer schedule.
- **Sequence.** Gallery model card 106; standalone comparison entry

## Figure 109

Depth-wise reads can bring embeddings and earlier block summaries into both mixers and latent expert updates.

- **Kinds.** `relationship` · `block-stack`
- **Elements.** Show previous block summaries as depth-side inputs, then alternate recurrent and gated latent token mixing. Keep the first dense update and later latent experts distinct.
- **Sequence.** Gallery model card 107; standalone comparison entry

## Figure 110

A decoder can use a nearby window in most layers and a retrieved shortlist in the rest without doing full attention anywhere.

- **Kinds.** `block-stack` · `heatmap`
- **Elements.** Use a contiguous band for the window and an irregular selected set for retrieved positions. Put the dense opening layer on the retrieved branch and show the later mixed schedule.
- **Sequence.** Gallery model card 108; standalone comparison entry

## Figure 111

A local/global attention schedule can use rotation only locally and place normalization on both sides of the update.

- **Kinds.** `block-stack` · `comparison`
- **Elements.** Show attention's two position treatments, a normalization pair around the update, and the routed and shared expert paths below.
- **Sequence.** Gallery model card 109; standalone comparison entry

## Figure 112

Latent bottlenecks compress the query and the cached key/value state separately within a mixed decoder.

- **Kinds.** `transformation` · `block-stack`
- **Elements.** Trace one query and one cache state through different narrow projections and place that stage beside recurrent layers and the dense prefix.
- **Sequence.** Gallery model card 110; standalone comparison entry

## Figure 113

Latent experts can work at a narrower width and have their outputs normalized before the routed outputs are combined.

- **Kinds.** `transformation` · `flow`
- **Elements.** Show width reduction, selected expert outputs, per-output normalization, and the return to the residual width. Do not add a shared branch.
- **Sequence.** Gallery model card 111; standalone comparison entry

## Figure 114

A hybrid can put selected experts in a latent space while letting a shared expert operate at the full residual width.

- **Kinds.** `flow` · `block-stack`
- **Elements.** Split narrow routed work from full-width shared work and merge only after restoring a common width. Limit the figure to language processing.
- **Sequence.** Gallery model card 112; standalone comparison entry

## Figure 115

A decoder can combine sparse experts, residual scaling, and a bounded scoring head without conflating their purposes.

- **Kinds.** `block-stack` · `coordinate-plot`
- **Elements.** Mark the dense opening and routed later FFNs. Show residual scaling as its own block rule and draw the separate output-scoring curve that approaches a bound.
- **Sequence.** Gallery model card 113; standalone comparison entry

## Figure 116

A looped decoder can send its input-stack output back into every pass through the same core before one final output stack.

- **Kinds.** `cycle` · `block-stack`
- **Elements.** Distinguish fixed input and output stages from the reused core. Mark the reintroduced input signal at each pass.
- **Sequence.** Gallery model card 114; standalone comparison entry

## Figure 117

A decoder can combine windowed attention with learned sink scores and still use global attention on some layers.

- **Kinds.** `heatmap` · `block-stack`
- **Elements.** Draw ordinary recent-token access on a mask and represent the sink as a separate learned score. Contrast the local window with the global layers.
- **Sequence.** Gallery model card 115; standalone comparison entry

## Figure 118

Changing the token-selection rule throughout a decoder need not remove the distinction between dense opening layers and later sparse experts.

- **Kinds.** `block-stack` · `comparison`
- **Elements.** Keep sparse attention common across both parts of the stack, then emphasize the change from a dense feed-forward update to selected experts.
- **Sequence.** Gallery model card 116; standalone comparison entry

## Figure 119

A dense hybrid may use local convolution, windowed attention, and global attention as three distinct token mixers.

- **Kinds.** `block-stack` · `comparison`
- **Elements.** Mark the three mixer roles, distinguish their reach and position handling, and leave feed-forward dense throughout.
- **Sequence.** Gallery model card 117; standalone comparison entry

## Figure 120

Sharing selected indices and compressed key/value state reduces repeated work at two different points in sparse attention.

- **Kinds.** `relationship` · `block-stack`
- **Elements.** Draw a shared index shortlist and shared compressed key/value state as separate inputs to later readers. Mark what is selected separately from what is stored.
- **Sequence.** Gallery model card 118; standalone comparison entry

## Figure 121

Sparse token selection can replace one attention route while leaving the recurrent mixer and latent expert stages in place.

- **Kinds.** `comparison` · `block-stack`
- **Elements.** Hold the recurrent schedule and routed experts fixed, then highlight only the attention stage that changes from general lookup to indexed selection.
- **Sequence.** Gallery model card 119; standalone comparison entry

## Figure 122

A side-by-side architecture survey helps a learner separate differences in context mixing from differences in feed-forward routing.

- **Kinds.** `comparison` · `block-stack`
- **Elements.** Align two representative toy decoders with the same visual roles. Highlight the altered attention or feed-forward stage. Do not reproduce the whole catalogue as one figure.
- **Sequence.** Linked reading 1; after the model catalogue
- **Existing reference.** `ml-dense-vs-moe-architecture`

## Figure 123

Two sparse expert decoders can trade fewer, wider experts for more, narrower experts while arranging a different number of layers.

- **Kinds.** `comparison` · `block-stack`
- **Elements.** Align two toy decoder stacks by role. Compare expert capacity and number used per token separately from width and depth.
- **Sequence.** Gallery overview links, figure 123. This is a compact comparison preview.

## Figure 124

A release timeline can locate the arrival of sparse attention, then a causal mask can show what changed inside a token read.

- **Kinds.** `timeline` · `heatmap`
- **Elements.** Place a few representative milestones on a timeline. In a separate original mask, separate selected earlier tokens from unavailable future positions.
- **Sequence.** Gallery overview links, figure 124. The upper section is chronological and the lower section explains the mechanism.

## Figure 125

A sequence of releases can contain models that share sparse expert routing but differ in what context each token can read.

- **Kinds.** `timeline` · `comparison`
- **Elements.** Place several toy releases on a time strip and compare two decoder stages using the same expert roles and different token lookup.
- **Sequence.** Gallery overview links, figure 125. The top sketches compare roles and the bottom strip orders releases.
