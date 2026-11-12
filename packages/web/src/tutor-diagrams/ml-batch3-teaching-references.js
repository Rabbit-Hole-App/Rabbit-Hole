const linkColumns = ['Input links from', 'Output link to'];
const activeLinks = ['$x_1,x_2$', '$y$'];
const hiddenUnits = [
  { id: 'h1', heading: '$h_1$', cells: activeLinks },
  { id: 'h2', heading: '$h_2$', cells: activeLinks },
  { id: 'h3', heading: '$h_3$', cells: activeLinks },
];

export const references = [
  {
    id: 'ml-transformer-attention', lessons: [],
    prompts: ['how does attention work in a transformer?'],
    keywords: ['transformer', 'self attention', 'query key value'],
    useWhen: 'Show one encoder self-attention head with query rows, key columns, row-wise softmax and worked value-vector mixes.',
    spec: { version: 1, diagram: {
      kind: 'matrix', layout: 'teaching', title: 'Transformer self-attention weights',
      columns: ['Key “red”', 'Key “bird”'],
      rows: [
        { id: 'red', heading: 'Query “red”', cells: ['$0.75$', '$0.25$'] },
        { id: 'bird', heading: 'Query “bird”', cells: ['$0.5$', '$0.5$'] },
      ],
      caption: 'Softmax makes each row sum to $1$. In key order, $v_1=(2,0)$ and $v_2=(0,4)$. Row mixes are $0.75v_1+0.25v_2=(1.5,1)$ and $0.5v_1+0.5v_2=(1,2)$.',
    } },
  },
  {
    id: 'ml-rag-retrieval', lessons: [],
    prompts: ['how does RAG work?'],
    keywords: ['rag', 'retrieval augmented generation'],
    useWhen: 'Trace a question through embedding and retrieval, then send the question and retrieved text to the LLM.',
    spec: { version: 1, diagram: {
      kind: 'sequence', title: 'Retrieve evidence before answering',
      actors: [
        { id: 'user', label: 'User' },
        { id: 'app', label: 'App' },
        { id: 'retriever', label: 'Retriever / vector store' },
        { id: 'llm', label: 'LLM' },
      ],
      messages: [
        { from: 'user', to: 'app', label: '“When does the museum close?”' },
        { from: 'app', to: 'retriever', label: 'Question text to embed and search' },
        { from: 'retriever', to: 'app', label: 'Top passages include “Closes at 5 pm”' },
        { from: 'app', to: 'llm', label: 'Prompt with question and top passages' },
        { from: 'llm', to: 'app', label: 'Answer “5 pm” with source passage' },
        { from: 'app', to: 'user', label: '“5 pm” with source' },
      ],
      caption: 'The retriever embeds the question and ranks passages by vector similarity. The language model answers using the retrieved text.',
    } },
  },
  {
    id: 'ml-cpu-vs-gpu', lessons: [],
    prompts: ['what is the difference between a CPU and a GPU?'],
    keywords: ['cpu', 'cpu vs gpu', 'cpu versus gpu'],
    useWhen: 'Compare typical CPU and GPU cores, performance goals and the workloads that suit each.',
    spec: { version: 1, diagram: {
      kind: 'comparison', title: 'How CPUs and GPUs handle work',
      columns: [
        { heading: 'CPU', items: [
          'A few large general-purpose cores',
          'Low latency for a single task',
          'Sequential or branch-heavy work',
        ] },
        { heading: 'GPU', items: [
          'Thousands of small arithmetic cores',
          'High throughput across many tasks',
          'Parallel work on many data elements',
        ] },
      ],
    } },
  },
  {
    id: 'ml-dropout-network', lessons: [],
    prompts: ['how does dropout work?'],
    keywords: ['dropout', 'dropout mask', 'apply dropout', 'dropout during training'],
    useWhen: 'Compare the same hidden units before and after a training mask, then explain classical inference scaling.',
    spec: { version: 1, diagram: {
      kind: 'transformation', variant: 'visual', title: 'Dropout in a small hidden layer',
      operation: 'Randomly mask hidden units during training',
      before: { label: 'All hidden units active', diagram: {
        kind: 'matrix', layout: 'teaching', title: 'All hidden units active', columns: linkColumns, rows: hiddenUnits,
      } },
      after: { label: 'One sampled mask', diagram: {
        kind: 'matrix', layout: 'teaching', title: 'One sampled mask', columns: linkColumns,
        rows: [hiddenUnits[0], { id: 'h2', heading: '$h_2$ off', cells: ['Removed', 'Removed'] }, hiddenUnits[2]],
        emphasis: { rows: ['h2'] },
      } },
      identity: { mode: 'preserved', note: 'Both sets of links for $h_2$ are inactive for this training pass.' },
      caption: String.raw`Classical dropout uses all units at inference and scales each activation by keep rate $p$ ($h_i\mapsto ph_i$).`,
    } },
  },
  {
    id: 'ml-diffusion-denoising', lessons: [],
    prompts: ['how does a diffusion model generate an image?'],
    keywords: ['diffusion model', 'diffusion denoising'],
    useWhen: 'Follow a prompt-conditioned sampler from pure noise to an image and name the forward noising process used in training.',
    spec: { version: 1, diagram: {
      kind: 'sequence', title: 'Denoise an image from pure noise',
      actors: [
        { id: 'app', label: 'Image app' },
        { id: 'sampler', label: 'Sampler' },
        { id: 'denoiser', label: 'Denoiser' },
      ],
      messages: [
        { from: 'app', to: 'denoiser', label: 'Prompt embedding for “a red fox”' },
        { from: 'sampler', to: 'denoiser', label: 'Pure noise $x_T$ and step $T$' },
        { from: 'denoiser', to: 'sampler', label: 'Noise predicted from $x_T$ and prompt' },
        { from: 'sampler', to: 'denoiser', label: 'Less noisy $x_{T-1}$ and next step' },
        { from: 'denoiser', to: 'sampler', label: 'Next noise prediction' },
        { from: 'sampler', to: 'app', label: 'Clean image $x_0$ after $T$ steps' },
      ],
      caption: 'Remove some predicted noise at each step using the same prompt. The forward process in training adds noise to clean images.',
    } },
  },
  {
    id: 'ml-kv-cache-decode', lessons: [],
    prompts: ['how does KV caching speed up inference?'],
    keywords: ['kv cache', 'kv caching', 'key value cache', 'key value caching'],
    useWhen: 'Show new-token projections and the append-and-read operations at two successive decoder steps.',
    spec: { version: 1, diagram: {
      kind: 'sequence', title: 'Reuse keys and values during decoding',
      actors: [
        { id: 'decoder', label: 'Decoder' },
        { id: 'cache', label: 'KV cache' },
        { id: 'attention', label: 'Attention' },
      ],
      messages: [
        { from: 'decoder', to: 'attention', label: 'Project only token $t$ to $q_t$, $k_t$, $v_t$' },
        { from: 'attention', to: 'cache', label: 'Append $k_t$ and $v_t$, then read cache' },
        { from: 'cache', to: 'attention', label: String.raw`All keys $K_{\le t}$ and values $V_{\le t}$` },
        { from: 'attention', to: 'decoder', label: 'Context for next-token prediction' },
        { from: 'decoder', to: 'attention', label: 'Project only token $t+1$ to $q_{t+1}$, $k_{t+1}$, $v_{t+1}$' },
        { from: 'attention', to: 'cache', label: 'Append $k_{t+1}$ and $v_{t+1}$, then read cache' },
        { from: 'cache', to: 'attention', label: String.raw`All keys $K_{\le t+1}$ and values $V_{\le t+1}$` },
        { from: 'attention', to: 'decoder', label: 'Context for next-token prediction' },
      ],
      caption: 'Attention uses the new query with cached keys and values. Reuse saves projecting past tokens again.',
    } },
  },
  {
    id: 'ml-robot-arm-pickup', lessons: [],
    prompts: ['how does a robot arm pick up an object?'],
    keywords: ['robot arm', 'robotic arm'],
    useWhen: 'Show the robot pickup procedure as a flow, from camera sensing to checking the grip.',
    spec: { version: 1, diagram: {
      kind: 'flow', title: 'Pick up an object with a robot arm',
      nodes: [
        { id: 'sense', label: 'Find the object with a camera', role: 'process' },
        { id: 'plan', label: 'Plan the grasp pose', role: 'process' },
        { id: 'move', label: 'Move the joints to the grasp pose', role: 'process' },
        { id: 'close', label: 'Close the gripper around the object', role: 'process' },
        { id: 'lift', label: 'Lift the object', role: 'process' },
        { id: 'verify', label: 'Verify the grip with sensor feedback', role: 'outcome' },
      ],
      edges: [
        { from: 'sense', to: 'plan' },
        { from: 'plan', to: 'move' },
        { from: 'move', to: 'close' },
        { from: 'close', to: 'lift' },
        { from: 'lift', to: 'verify' },
      ],
    } },
  },
];
