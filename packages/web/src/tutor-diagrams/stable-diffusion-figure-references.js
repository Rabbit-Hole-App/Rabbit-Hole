import {
  captionVectors, clean, coordinates, encoderEvaluation, imageTextScores, latentChannels, latentSize, meanSquaredError,
  pixelSize, reverseNoise, reverseStates, round, schedule, training, trainingErrors, trainingPrediction, visualVectors,
} from './stable-diffusion-figure-data.js';

const spec = diagram => ({ version: 1, diagram });
const row = (heading, ...cells) => ({ heading, cells: cells.map(String) });
const matrix = (title, caption, columns, rows) => ({ kind: 'matrix', title, caption, columns, rows });
const isBrief = depth => depth === 'brief';
const isDetailed = depth => depth === 'detailed';
const tuple = values => '$(' + values.map(round).join(',') + ')$';
const list = (label, ...items) => ({ label, items });
const strip = (name, values, role) => ({ tensor: { name, rows: 1, columns: 2, dimensions: '1 × 2', role, ...(values ? { values } : {}) } });
const blocks = (...items) => items.map(([label, role, input], index) => ({
  id: 'b' + index, label, role, ...(input ? { inputs: [{ label: input }] } : {}),
}));
const reference = (id, lessons, prompts, paraphrases, keywords, useWhen, makeDiagram) => ({
  id: 'ml-stable-diffusion-' + id, lessons, prompts, paraphrases, keywords, useWhen,
  spec: spec(makeDiagram('balanced')),
  depths: { overview: { spec: spec(makeDiagram('brief')) }, deep: { spec: spec(makeDiagram('detailed')) } },
});
const heatmap = (title, caption, columns, cellValues) => ({
  kind: 'heatmap', title, caption, columns,
  rows: coordinates.map((label, index) => ({ label, cells: cellValues.map(values => values[index]) })),
  range: { min: -1, max: 1 },
});

const pipeline = reference('latent-pipeline', [],
  ['What are the three main stages in the Stable Diffusion latent pipeline?'],
  ['Where do the text encoder, noise predictor and image decoder fit in Stable Diffusion?'],
  ['three main stages in the stable diffusion latent pipeline', 'text encoder noise predictor and image decoder fit in stable diffusion'],
  'Separate prompt encoding, iterative latent denoising and one final image decode. The noise state and prompt embedding are distinct inputs.',
  depth => ({
    kind: 'block-stack', title: isBrief(depth) ? 'How a description helps make an image' : 'Stable Diffusion’s three main stages',
    caption: isDetailed(depth) ? 'The prompt becomes embeddings. A scheduler updates latent $z_t$ using U-Net noise estimates. Decode the final latent once.' :
      'Turn the words into numbers, use them while refining a noisy state, then turn the result into pixels.',
    blocks: blocks(
      [isBrief(depth) ? 'Word reader' : 'Text encoder', 'embedding', clean[0].caption],
      [isBrief(depth) ? 'Noise removal stages' : 'U-Net and scheduler', 'attention', 'Initial random latent'],
      [isBrief(depth) ? 'Image maker' : 'Autoencoder decoder', 'output'],
    ),
  }));

const stageShapes = reference('latent-shapes', [],
  ['What is the difference between text embeddings, latents and pixels in Stable Diffusion?'],
  ['How do the shapes change from the Stable Diffusion prompt to the final image?'],
  ['text embeddings latents and pixels in stable diffusion', 'shapes change from the stable diffusion prompt to the final image'],
  'Use small illustrative shapes. Keep token features separate from spatial latent channels and show that the denoiser preserves its latent shape.',
  depth => matrix(isBrief(depth) ? 'Words and pictures use different arrays' : 'Follow data shapes through latent diffusion',
    isDetailed(depth) ? 'Toy shapes only. The predicted noise must have the same shape as latent $z_t$ for the scheduler update.' :
      'The word rows guide the model. The smaller image-shaped array is what it refines.',
    ['Toy shape', isBrief(depth) ? 'What it contains' : 'Role'],
    [
      row(isBrief(depth) ? 'Prompt numbers' : 'Token embeddings', clean[0].condition.length + ' tokens, ' + clean[0].condition[0].length + ' features', 'Text condition'),
      row(isBrief(depth) ? 'Small image array' : 'Noisy latent', latentSize + ' by ' + latentSize + ', ' + latentChannels + ' channel', 'State being denoised'),
      row('Noise estimate', latentSize + ' by ' + latentSize + ', ' + latentChannels + ' channel', 'Same shape as the state'),
      row('Output pixels', pixelSize + ' by ' + pixelSize + ' grayscale', 'Final decode'),
    ]));

const sampler = reference('latent-sampler', [],
  ['How does Stable Diffusion keep denoising in latent space before decoding?'],
  ['When does the Stable Diffusion sampler run the decoder after repeated U-Net calls?'],
  ['stable diffusion keep denoising in latent space before decoding', 'stable diffusion sampler run the decoder after repeated u net calls'],
  'Trace the first and a later conditioned U-Net call in a single generation. The scheduler refines the latent and sends the final state to the image decoder once.',
  depth => ({
    kind: 'sequence', title: isBrief(depth) ? 'Refine the noisy state, then make pixels' : 'Repeat latent denoising before one image decode',
    caption: isDetailed(depth) ? 'The text condition $c$ stays fixed. The toy latent is $' + latentSize + '\\times' + latentSize +
      '$. Each estimate helps the scheduler update the current state.' :
      'The same words guide each estimate. The decoder sees only the final state.',
    actors: [
      { id: 'sam', label: isBrief(depth) ? 'Noise updater' : 'Latent sampler' },
      { id: 'net', label: isBrief(depth) ? 'Noise predictor' : 'Conditioned U-Net' },
      { id: 'dec', label: isBrief(depth) ? 'Picture maker' : 'Image decoder' },
    ],
    messages: [
      { from: 'sam', to: 'net', label: isDetailed(depth) ? 'Initial latent $z_T$, step $T$, text condition $c$' :
        'Random state, first step, “' + clean[0].caption + '” condition' },
      { from: 'net', to: 'sam', label: isDetailed(depth) ? 'First estimate $\\hat\\epsilon_T$' : 'First noise estimate' },
      { from: 'sam', to: 'net', label: isDetailed(depth) ? 'Updated $z_{T-1}$, next step, same $c$' : 'Updated state, next step, same text condition' },
      { from: 'net', to: 'sam', label: isDetailed(depth) ? 'Next estimate $\\hat\\epsilon_{T-1}$' : 'Next noise estimate' },
      { from: 'sam', to: 'dec', label: isDetailed(depth) ? 'Final latent $z_0$ after all updates' : 'Final state after the remaining updates' },
      { from: 'dec', to: 'sam', label: 'Decoded pixel image' },
    ],
  }));

const primary = training[0];
const forwardNoising = reference('forward-noise', [],
  ['Can you show the numbers when forward diffusion adds known noise to a latent?'],
  ['In a tiny forward diffusion example, how do the clean signal and sampled noise combine?'],
  ['forward diffusion adds known noise to a latent', 'tiny forward diffusion example how do the clean signal and sampled noise combine'],
  'Work one two-by-two toy latent cell by cell. The known noise is sampled first and combined with scaled clean values. Both coefficients depend on the step.',
  depth => heatmap(isBrief(depth) ? 'Make a noisy example from a clean one' : 'Forward diffusion with known noise',
    isDetailed(depth) ? 'At this step, $z_t=' + primary.level.a + 'z_0+' + primary.level.b + '\\epsilon$. Top left: $' + primary.noisy[0] + '$.' :
      'Each cell combines part of the clean value with part of the known noise. The noise is kept as the target.',
    ['Clean', 'Sampled noise', 'Noisy result'], [primary.example.values, primary.noise, primary.noisy]));

const trainingRows = reference('noise-target-table', ['01'],
  ['What is the training target in a Stable Diffusion noise prediction dataset?'],
  ['Can you show why noisy latents and timesteps are features while sampled noise is the label?'],
  ['training target in a stable diffusion noise prediction dataset', 'noisy latents and timesteps are features while sampled noise is the label'],
  'Build several rows by varying the source pattern, noise sample and timestep. The clean source is used to make the row, but the predictor receives the noisy latent and timestep.',
  depth => matrix(isBrief(depth) ? 'The added noise is the answer to learn' : 'Features and targets for the noise predictor',
    isDetailed(depth) ? 'The target is sampled noise $\\epsilon$, not the noisy state $z_t$. The second row uses a different clean example and noise sample.' :
      'The predictor reads the noisy version and how far along it is. The recorded answer is the noise used to make it.',
    [isBrief(depth) ? 'Noise level' : 'Timestep', isBrief(depth) ? 'Noisy values' : 'Noisy latent', 'Noise target'],
    training.map(({ example, level, noisy, noise }) => row(example.label, level.id === 'low' ? 'Earlier' : 'Later',
      isBrief(depth) ? 'Corrupted pattern' : tuple(noisy), isBrief(depth) ? 'Recorded noise' : tuple(noise)))));

const denoiserLoss = reference('denoiser-loss', [],
  ['How does the Stable Diffusion noise predictor learn from its error?'],
  ['How are known noise and predicted noise compared during diffusion training?'],
  ['stable diffusion noise predictor learn from its error', 'known noise and predicted noise compared during diffusion training'],
  'For the shared noisy toy example, compare the predictor’s estimate with the known added noise, compute mean squared error, and use it to update the predictor.',
  depth => matrix(isBrief(depth) ? 'Compare the noise guess to the answer' : 'One noise-prediction training step',
    isDetailed(depth) ? 'Average $(\\hat\\epsilon_i-\\epsilon_i)^2$ to get $' + meanSquaredError.toFixed(4) + '$. Backpropagate the loss to the predictor.' :
      'The same noisy example is the input. The error in the estimated noise tells the predictor how to improve.',
    ['Known noise', 'Predicted noise', 'Difference'],
    coordinates.map((label, i) => row(label, primary.noise[i], trainingPrediction[i], trainingErrors[i]))));

const predictorInterface = reference('denoiser-inputs', [],
  ['What changes in the Stable Diffusion denoiser inputs when I add a text prompt?'],
  ['What does a text-conditioned denoiser predict compared with a denoiser without text?'],
  ['stable diffusion denoiser inputs when i add a text prompt', 'text conditioned denoiser predict compared with a denoiser without text'],
  'Hold the latent, timestep and output meaning fixed. The conditioned version also receives token representations. Compare network interfaces, not measured outputs.',
  depth => ({
    kind: 'comparison', title: isBrief(depth) ? 'A prompt adds an input to the noise predictor' : 'Unconditioned and text-conditioned denoising',
    caption: isDetailed(depth) ? 'The output is still estimated noise $\\hat\\epsilon$ at the shape of $z_t$. Conditioning can change the estimate.' :
      'With or without words, the model estimates noise. The words can change which estimate it makes.',
    columns: [
      { heading: isBrief(depth) ? 'Without words' : 'Without text conditioning', items: ['Read current noisy state', 'Read current step', 'Return a noise estimate'] },
      { heading: isBrief(depth) ? 'With words' : 'With text conditioning', items: ['Read the same noisy state', 'Read the same step', 'Read the prompt numbers', 'Return a noise estimate'] },
    ],
  }));

const reverseSteps = reference('reverse-latent-steps', [],
  ['Can you show two reverse diffusion steps on the same small latent with numbers?'],
  ['What actually changes when the diffusion scheduler uses a fresh noise estimate?'],
  ['two reverse diffusion steps on the same small latent with numbers', 'diffusion scheduler uses a fresh noise estimate'],
  'Use one deterministic illustrative reverse rule. Each predictor call estimates noise again from its current latent. This is not measured output from a deployed sampler.',
  depth => heatmap(isBrief(depth) ? 'A fresh estimate cleans up the next state' : 'Track one latent through two reverse steps',
    isDetailed(depth) ? 'Estimate $z_0=(z_t-b_t\\hat\\epsilon)/a_t$, then reweight at the next step. Top-left noise estimates: $' +
      reverseNoise[0][0] + '$ then $' + reverseNoise[1][0] + '$.' :
      'The scheduler updates the same state twice. At each step the predictor estimates noise again.',
    ['Start', 'After first step', 'After second step'], reverseStates));

const autoencoder = reference('image-autoencoder', [],
  ['What does the autoencoder compress and reconstruct in Stable Diffusion?'],
  ['How does the Stable Diffusion image encoder differ from its image decoder?'],
  ['autoencoder compress and reconstruct in stable diffusion', 'stable diffusion image encoder differ from its image decoder'],
  'Separate pixel-to-latent encoding from latent-to-pixel decoding. Use illustrative dimensions and distinguish a reconstruction from a guarantee of exact recovery.',
  depth => ({
    kind: 'block-stack', title: isBrief(depth) ? 'Store a smaller picture description' : 'Pixel image, latent and reconstruction',
    caption: isDetailed(depth) ? 'Toy shapes: $' + pixelSize + '\\times' + pixelSize + '$ pixels and $' + latentSize + '\\times' + latentSize +
      '$ latent cells. A reconstruction can differ from its input.' :
      'The reading stage compresses the image. The writing stage reconstructs an image from the smaller representation.',
    blocks: blocks(
      [isBrief(depth) ? 'Picture reader' : 'Image encoder', 'embedding', pixelSize + ' by ' + pixelSize + ' pixels'],
      [isBrief(depth) ? 'Smaller picture description' : 'Spatial latent', 'attention', latentSize + ' by ' + latentSize + ' toy cells'],
      [isBrief(depth) ? 'Picture writer' : 'Image decoder', 'output'],
    ),
  }));

const directions = reference('training-versus-generation', [],
  ['How do forward training corruption and reverse image generation differ in latent diffusion?'],
  ['Why does Stable Diffusion encode an image during training but decode one during generation?'],
  ['forward training corruption and reverse image generation differ in latent diffusion', 'encode an image during training but decode one during generation'],
  'Contrast creating training inputs by corrupting encoded images with generating an image by denoising from a fresh noisy latent and decoding once. The encoder and decoder are part of the toy system, not repeated denoiser stages.',
  depth => ({
    kind: 'comparison', title: isBrief(depth) ? 'Add noise to teach, remove noise to make' : 'Forward training and reverse generation',
    caption: isDetailed(depth) ? 'During training, learn to predict the added noise. During inference, use the learned predictor to update the current latent.' :
      'For training, start from a real example. For a new picture, start from noise.',
    columns: [
      { heading: 'Build training examples', items: ['Encode a clean image', 'Sample a timestep and noise', 'Corrupt the latent and keep the noise target'] },
      { heading: 'Generate a new image', items: ['Draw a noisy latent', 'Repeatedly predict noise and update the latent', 'Decode the final latent into pixels'] },
    ],
  }));

const evaluation = reference('encoder-evaluation', ['09'],
  ['How can I tell whether a different text encoder helps a diffusion image model?'],
  ['Can you compare image fidelity and prompt alignment while changing a diffusion text encoder?'],
  ['whether a different text encoder helps a diffusion image model', 'image fidelity and prompt alignment while changing a diffusion text encoder'],
  'Illustrate a two-metric comparison. Each point represents a different setting. The values are invented and make no published performance claim.',
  depth => ({
    kind: 'coordinate-plot', title: isBrief(depth) ? 'Do the pictures match their prompts?' : 'Evaluate encoder choices on two measures',
    caption: isDetailed(depth) ? 'Illustrative points only. Prefer higher prompt alignment and lower visual error. Each curve changes a setting within one encoder.' :
      'These are toy results. The best direction is toward stronger matches and fewer visual errors.',
    x: { label: 'Prompt alignment', min: 0.2, max: 0.8 },
    y: { label: 'Visual error', min: 0.1, max: 0.6 },
    series: encoderEvaluation.map(({ label, points }) => ({ label, kind: 'line', smooth: false, points })),
  }));

const imageCaptionRows = reference('image-caption-pairs', ['01'],
  ['What does an image and caption pair look like in CLIP training data?'],
  ['How do original image-caption matches become examples for the Stable Diffusion text encoder?'],
  ['image and caption pair look like in clip training data', 'image caption matches become examples for the stable diffusion text encoder'],
  'Keep an original image identity and its associated text on the same row. The toy patterns illustrate the kind of examples used in CLIP pretraining.',
  depth => matrix(isBrief(depth) ? 'Keep the image and its description together' : 'Paired image-caption training examples',
    isDetailed(depth) ? 'A dataset row stores a matched image and text. Mismatches can be made by pairing that image with other captions in the batch.' :
      'Each pattern has a short description. When pairing the examples, keep the matching row identities.',
    ['Original toy pattern', 'Associated caption'],
    clean.map(({ label, caption }, i) => row('Pair ' + (i + 1), label, caption))));

const separateEncoders = reference('clip-two-encoders', [],
  ['Why does CLIP have separate encoders for the picture and caption?'],
  ['How do the CLIP image encoder and text encoder produce comparable vectors?'],
  ['clip have separate encoders for the picture and caption', 'clip image encoder and text encoder produce comparable vectors'],
  'For one matched pair, preserve distinct inputs and output roles. Both encoders map into comparable vector spaces. The model only uses the text side for the later denoising condition.',
  depth => ({
    kind: 'transformation', title: isBrief(depth) ? 'A picture and its words become comparable' : 'Encode one CLIP image-caption pair',
    caption: isDetailed(depth) ? 'Two separate encoders output vectors of the same width. Compare image vector $v$ and caption vector $u$ after normalization.' :
      'One reader sees the picture. The other reads the description. Their outputs use the same number of entries.',
    before: list('Matched original example', clean[0].label, clean[0].caption),
    operation: isBrief(depth) ? 'Read each input with its own reader' : 'Encode the image and text separately',
    after: list('Comparable rows', strip('Picture vector', isBrief(depth) ? undefined : visualVectors[0], 'input'),
      strip('Caption vector', isBrief(depth) ? undefined : captionVectors[0], 'output')),
  }));

const contrastive = reference('clip-contrastive-scores', ['06'],
  ['How does CLIP training make matching image and text embeddings more similar?'],
  ['Can you show the before and after cosine scores for matching and mismatched CLIP pairs?'],
  ['clip training make matching image and text embeddings more similar', 'before and after cosine scores for matching and mismatched clip pairs'],
  'Compare all pair combinations in a small batch. The illustrative after-state updates both image and text representations, raising the matching scores relative to mismatches.',
  depth => matrix(isBrief(depth) ? 'Correct matches should score higher' : 'Learn image and text matches together',
    isDetailed(depth) ? 'Score pairs with $s_{ij}=\\cos(v_i,u_j)$. This toy after-state illustrates the goal, not a measured gradient step.' :
      'Each image is scored against both captions. Training pulls the correct matches ahead of the others.',
    ['Pair type', 'Before learning', 'After learning'],
    imageTextScores.map(({ image, text, before, after }) => row('Image ' + (image + 1) + ', caption ' + (text + 1),
      image === text ? 'Match' : 'Mismatch', before, after))));

const conditionalRows = reference('conditional-training-rows', ['01'],
  ['What is inside a text-conditioned noise training row in Stable Diffusion?'],
  ['How do the caption embedding, noisy latent, timestep and noise target line up in Stable Diffusion training?'],
  ['text conditioned noise training row in stable diffusion', 'caption embedding noisy latent timestep and noise target line up'],
  'Extend the training-row schema to include text features from the caption paired with the source image. The noise used for corruption remains the target.',
  depth => matrix(isBrief(depth) ? 'Add the matching words to a training example' : 'A conditional denoising training record',
    isDetailed(depth) ? 'Input is $(z_t,t,c)$, where $c$ is the token embedding array. The target remains the sampled noise $\\epsilon$.' :
      'The prompt describes the original pattern. Keep its words paired with the same noisy example.',
    [isBrief(depth) ? 'Noise level' : 'Timestep', 'Noisy state', 'Caption condition', 'Target noise'],
    training.slice(0, 2).map(({ example, level, noisy, noise }) => row(example.label,
      level.id === 'low' ? 'Earlier' : 'Later', isBrief(depth) ? 'Corrupted pattern' : tuple(noisy),
      isDetailed(depth) ? tuple(example.condition.flat()) : example.caption, isBrief(depth) ? 'Recorded noise' : tuple(noise)))));

const residuals = reference('unet-timestep-and-skips', [],
  ['How do timestep embeddings and skip connections enter the Stable Diffusion U-Net?'],
  ['Can you show where the U-Net gets noise level information and reuses earlier features?'],
  ['timestep embeddings and skip connections enter the stable diffusion u net', 'u net gets noise level information and reuses earlier features'],
  'Follow earlier image features both through later processing and along a skip to a later resolution-matched block. The timestep reaches multiple residual stages.',
  depth => ({
    kind: 'relationship', layout: 'graph',
    title: isBrief(depth) ? 'The noise predictor reuses features' : 'Timestep inputs and skip paths inside a U-Net',
    caption: isDetailed(depth) ? 'A timestep embedding of $t$ conditions residual stages. The skip reuses earlier features at the matching scale.' :
      'Both stages get the noise level. The shortcut carries earlier details.',
    nodes: [
      { id: 'x', label: isBrief(depth) ? 'Noisy features' : 'Noisy latent' }, { id: 't', label: isBrief(depth) ? 'Noise level' : 'Timestep embedding' },
      { id: 'down', label: isBrief(depth) ? 'Early features' : 'Down residual block' },
      { id: 'middle', label: isBrief(depth) ? 'Smaller map' : 'Bottleneck' },
      { id: 'up', label: isBrief(depth) ? 'Later features' : 'Up residual block' },
      { id: 'output', label: 'Noise estimate' },
    ],
    edges: [
      ['x', 'down', 'Supplies features'], ['t', 'down', 'Sets noise level'], ['t', 'up', 'Sets the same level'],
      ['down', 'middle', 'Compresses features'], ['middle', 'up', 'Sends refined features'],
      ['down', 'up', 'Reuses early details'], ['up', 'output', 'Predicts noise'],
    ].map(([from, to, label]) => ({ from, to, label })),
  }));

const conditioningRoute = reference('unet-text-attention', [],
  ['Where do text prompt embeddings go inside the Stable Diffusion U-Net?'],
  ['Do Stable Diffusion residual blocks read the prompt or does cross-attention handle it?'],
  ['text prompt embeddings go inside the stable diffusion u net', 'stable diffusion residual blocks read the prompt or does cross attention handle it'],
  'Alternate time-conditioned residual blocks and text-conditioned attention blocks. Image features supply the queries; token embeddings supply keys and values.',
  depth => ({
    kind: 'block-stack', title: isBrief(depth) ? 'Words enter at particular stages' : 'Cross-attention routes text into the U-Net',
    caption: isDetailed(depth) ? 'Image features supply $Q$. The prompt embeddings supply $K$ and $V$. Time features go to the residual blocks.' :
      'Image stages receive the noise level. The attention stages pull in information from the prompt.',
    blocks: blocks(
      [isBrief(depth) ? 'First image stage' : 'Residual block A', 'feedforward', 'Noise level'],
      [isBrief(depth) ? 'First word-aware stage' : 'Cross-attention A', 'attention', 'Prompt embeddings'],
      [isBrief(depth) ? 'Second image stage' : 'Residual block B', 'feedforward', 'Noise level'],
      [isBrief(depth) ? 'Second word-aware stage' : 'Cross-attention B', 'attention', 'Prompt embeddings'],
    ),
  }));

export const stableDiffusionFigureReferences = [
  pipeline, stageShapes, sampler, autoencoder, forwardNoising, trainingRows, denoiserLoss, predictorInterface,
  reverseSteps, directions, evaluation, imageCaptionRows, separateEncoders, contrastive,
  conditionalRows, residuals, conditioningRoute,
];
