# The Illustrated Stable Diffusion figure briefs

33 figure occurrences in document order. [Source page](https://jalammar.github.io/illustrated-stable-diffusion/) · [Inventory](manifest.json)

## Figure 01

Text-to-image generation uses a description as the condition for a new image.

- **Kinds.** `flow`
- **Elements.** One original text request, generation step and a newly authored raster example whose subject visibly matches the request.
- **Sequence.** What an image generator does · step 1
- **Missing kind.** A raster panel kind would let readers inspect the generated image or an image pair as evidence.

## Figure 02

Image-to-image generation changes an existing picture while preserving selected parts of its structure.

- **Kinds.** `transformation`
- **Elements.** One original input and output image, an edit instruction, and a spatial feature preserved in both.
- **Sequence.** What an image generator does · step 2
- **Missing kind.** A raster panel kind would let readers inspect the generated image or an image pair as evidence.

## Figure 03

Text understanding and visual generation are distinct stages connected by a learned representation.

- **Kinds.** `block-stack`
- **Elements.** Prompt, text encoder, condition vectors, image generator and output; clarify that words do not go directly to pixels.
- **Sequence.** What an image generator does · step 3

## Figure 04

The prompt reaches the visual generator as a grid of numeric token representations.

- **Kinds.** `block-stack`
- **Elements.** Original prompt, encoder, token-by-feature tensor and image generator; connect the generator to the tensor rather than the raw words.
- **Sequence.** What an image generator does · step 4

## Figure 05

The image generator uses repeated latent updates before decoding a final pixel image.

- **Kinds.** `block-stack`
- **Elements.** Group the iterative latent maker and single decoder inside the image stage; a condition vector enters the latent maker.
- **Sequence.** What an image generator does · step 5

## Figure 06

A text encoder, a denoiser with a scheduler, and an image decoder divide the work in latent diffusion.

- **Kinds.** `flow`
- **Elements.** Show the prompt-to-vector, noise-to-latent and latent-to-pixel boundaries with one pass through the final decoder.
- **Sequence.** What an image generator does · step 6

## Figure 07

Connecting model components requires compatible text, latent and image shapes.

- **Kinds.** `block-stack`
- **Elements.** Show an original toy sequence shape, compressed spatial tensor and decoded pixel shape; name the operation at each boundary.
- **Sequence.** What an image generator does · step 7

## Figure 08

The text condition steers repeated latent updates rather than painting each pixel at once.

- **Kinds.** `cycle`
- **Elements.** Initial noise, time-conditioned update, prompt embedding feed, and final latent.
- **Sequence.** Noise and denoising · step 1
- **Offline example.** `ml-diffusion-denoising`

## Figure 09

A decoder projects noisy and denoised latents into pixel images while the sampler works only in latent space.

- **Kinds.** `transformation`
- **Elements.** Show matching early and late latent states, one shared decoder and separate pixel outcomes.
- **Sequence.** Noise and denoising · step 2

## Figure 10

Each denoising stage consumes the current latent and yields the next latent for the following stage.

- **Kinds.** `timeline`
- **Elements.** Consecutive time indices, shared predictor, and arrows carrying one updated state forward.
- **Sequence.** Noise and denoising · step 3
- **Offline example.** `ml-diffusion-denoising`

## Figure 11

Decoding intermediate states can reveal progressively clearer spatial structure as denoising advances.

- **Kinds.** `heatmap`
- **Elements.** Aligned raster samples of one seed across early, middle and late stages; distinguish visualization decodes from the model's internal state.
- **Sequence.** Noise and denoising · step 4
- **Missing kind.** A raster panel kind would let readers inspect the generated image or an image pair as evidence.

## Figure 12

Forward diffusion can create a training input by adding a known noise sample to a clean example.

- **Kinds.** `transformation`
- **Elements.** Three aligned toy grids for clean signal, sampled noise and noisy observation; an explicit noise coefficient.
- **Sequence.** Noise and denoising · step 5

## Figure 13

Repeating forward corruption with a new image, timestep and noise sample creates another independent example.

- **Kinds.** `transformation`
- **Elements.** Use a different clean toy pattern and a different sampled grid from the previous step, with a new coefficient; display the corrupted result.
- **Sequence.** Noise and denoising · step 6

## Figure 14

A denoiser's training table pairs each noisy state and timestep with the known noise used to create that example.

- **Kinds.** `matrix`
- **Elements.** Keep the timestep and noisy input on the feature side and the sampled noise on the target side; show examples at several levels.
- **Sequence.** Noise and denoising · step 7
- **Phase 02.** [01](../briefs/01-what-is-machine-learning.md)

## Figure 15

The denoiser learns by comparing predicted noise against the noise actually used to construct the input.

- **Kinds.** `flow`
- **Elements.** Noisy input, timestep, noise prediction, known noise and a loss-driven weight update.
- **Sequence.** Noise and denoising · step 8

## Figure 16

At generation time the trained predictor estimates the noise component of the current state.

- **Kinds.** `flow`
- **Elements.** Current noisy state and timestep feed a trained model that returns a noise estimate of matching shape.
- **Sequence.** Noise and denoising · step 9

## Figure 17

A denoising step uses the estimate to construct a slightly cleaner next state.

- **Kinds.** `transformation`
- **Elements.** Current grid, estimated noise contribution, scheduler coefficient and updated grid; label this a toy update.
- **Sequence.** Noise and denoising · step 10

## Figure 18

A reverse process estimates noise again after each update, gradually making structure emerge from the same seed.

- **Kinds.** `timeline` · `heatmap`
- **Elements.** Two successive predictor calls on the same toy grid, with separate noise estimates and a progressively clearer geometric pattern.
- **Sequence.** Noise and denoising · step 11

## Figure 19

An autoencoder compresses a pixel image into a smaller latent and decodes it into a reconstruction.

- **Kinds.** `transformation`
- **Elements.** Before and after shapes, a compressed intermediate, and separate encoder and decoder labels.
- **Sequence.** Latent diffusion · step 1

## Figure 20

Training can add noise directly to the compressed tensor instead of corrupting a full-resolution image.

- **Kinds.** `heatmap`
- **Elements.** Latent channels or a selected slice, aligned sampled noise, and the resulting noisy latent at one timestep.
- **Sequence.** Latent diffusion · step 2

## Figure 21

The training and generation paths traverse corruption in opposite directions and use opposite ends of the autoencoder.

- **Kinds.** `comparison`
- **Elements.** Matched train and inference paths; encoder appears before forward training corruption, decoder after reverse generation.
- **Sequence.** Latent diffusion · step 3

## Figure 22

A latent diffusion model has a pixel domain, a denoising domain and a separate condition input.

- **Kinds.** `block-stack`
- **Elements.** Group encoding/decoding at the pixel boundary, repeated latent updates and a cross-attention input from the condition encoder.
- **Sequence.** Latent diffusion · step 4

## Figure 23

Evaluating the text encoder requires comparing both visual fidelity and alignment with the prompt.

- **Kinds.** `coordinate-plot` · `bar-chart`
- **Elements.** Show clearly illustrative trade-off curves and a two-metric comparison for toy encoders; use independently chosen scores and define which direction is better.
- **Sequence.** Learning text and image representations · step 1
- **Phase 02.** [09](../briefs/09-model-evaluation.md)

## Figure 24

Paired images and captions supply matched examples for learning a shared representation.

- **Kinds.** `matrix`
- **Elements.** Several independently described samples with one image identity and its corresponding text; mark the pair ID.
- **Sequence.** Learning text and image representations · step 2

## Figure 25

Separate encoders turn an image and its caption into comparable vectors.

- **Kinds.** `block-stack`
- **Elements.** Parallel inputs, distinct encoders and vectors in a shared feature space.
- **Sequence.** Learning text and image representations · step 3

## Figure 26

A similarity grid exposes which image-text pairs align and which cross-pairs are negatives.

- **Kinds.** `heatmap`
- **Elements.** Small cosine score matrix with rows and columns indexed by different modalities, matching positions highlighted.
- **Sequence.** Learning text and image representations · step 4
- **Phase 02.** [06](../briefs/06-knn-and-distances.md)

## Figure 27

Updating both encoders can increase matching image-caption similarity relative to mismatched pairs.

- **Kinds.** `transformation`
- **Elements.** Keep pair identities fixed and use toy before-and-after scores; show the training signal reaching both encoders.
- **Sequence.** Learning text and image representations · step 5

## Figure 28

Adding text conditioning gives the denoiser a prompt representation alongside the latent and timestep.

- **Kinds.** `block-stack`
- **Elements.** Latent, time and text input ports; one output noise tensor with the latent shape.
- **Sequence.** Conditioning the denoiser · step 1

## Figure 29

Each conditional training example binds a noisy latent, timestep, prompt embedding and known noise target.

- **Kinds.** `matrix`
- **Elements.** One row with four distinct fields; prompt and image originate from the same example.
- **Sequence.** Conditioning the denoiser · step 2

## Figure 30

An unconditioned denoiser maps a noisy state and timestep to a same-shaped estimate without a prompt input.

- **Kinds.** `flow`
- **Elements.** Two named input roles feeding a predictor and one output tensor.
- **Sequence.** Conditioning the denoiser · step 3

## Figure 31

Residual image-processing blocks receive the timestep representation and pass earlier features to later stages through skip connections.

- **Kinds.** `block-stack` · `relationship`
- **Elements.** Show successive residual blocks, a shared timestep embedding feeding both, a feature bypass, and the predicted noise tensor.
- **Sequence.** Conditioning the denoiser · step 4

## Figure 32

Text-conditioned denoising adds prompt vectors as a third input while preserving the output's meaning.

- **Kinds.** `block-stack`
- **Elements.** Same state and time as the baseline, an added text embedding port and the same noise-estimate endpoint.
- **Sequence.** Conditioning the denoiser · step 5

## Figure 33

Cross-attention injects the text condition into selected image-feature blocks inside the denoiser.

- **Kinds.** `block-stack`
- **Elements.** Alternate residual and attention blocks, then route timestep embeddings to the residual blocks and prompt embeddings to the attention blocks; show image features supplying attention queries.
- **Sequence.** Conditioning the denoiser · step 6
