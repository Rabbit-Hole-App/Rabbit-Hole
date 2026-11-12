export const references = [
  {
    id: 'ml-batch-vs-online-inference', lessons: ['19'],
    prompts: ['How is predicting on a schedule different from predicting when a request comes in?'],
    keywords: ['batch inference', 'online inference', 'scheduled predictions', 'request-time predictions', 'batch versus online inference'],
    useWhen: 'Trace a scheduled feature snapshot through the model and store before requests. At request time, batch reads a stored score and online uses current features to compute a fresh score.',
    spec: {
      version: 1,
      diagram: {
        kind: 'sequence', title: 'Batch and online inference',
        actors: [
          { id: 'job', label: 'Batch job' },
          { id: 'model', label: 'Model' },
          { id: 'store', label: 'Score store' },
          { id: 'app', label: 'App' },
        ],
        messages: [
          { from: 'job', to: 'model', label: 'Batch · score feature snapshot' },
          { from: 'model', to: 'job', label: 'Return batch scores' },
          { from: 'job', to: 'store', label: 'Store scores before requests' },
          { from: 'app', to: 'store', label: 'Batch request · read score' },
          { from: 'store', to: 'app', label: 'Return stored score' },
          { from: 'app', to: 'model', label: 'Online request · current features' },
          { from: 'model', to: 'app', label: 'Return fresh score' },
        ],
        caption: 'The batch job runs on a schedule. At request time, the app reads a stored score for batch or sends current features for online.',
      },
    },
  },
  {
    id: 'ml-serving-latency-cost', lessons: ['19'],
    prompts: ['How do I compare the latency and cost of batch and online predictions?'],
    keywords: ['model serving cost', 'serving latency and cost', 'latency and cost of batch', 'batch and real-time predictions', 'batch serving cost', 'online inference cost'],
    useWhen: 'Compare batch and online on one illustrative workload with shared freshness and latency limits. Batch pays for scores and reads. Online rounds up peak QPS divided by replica capacity and pays for 24 hours.',
    spec: {
      version: 1,
      diagram: {
        kind: 'matrix', layout: 'teaching', title: 'Serving latency and daily cost',
        columns: ['Batch', 'Online'],
        rows: [
          { id: 'capacity', heading: 'Capacity', cells: ['1 h job every 24 h', '3 replicas at 200 QPS each'] },
          { id: 'prices', heading: 'Unit prices', cells: ['0.40 USD/M scores and 0.25 USD/M reads', '0.50 USD/hour per replica'] },
          { id: 'daily-cost', heading: 'Daily cost', cells: ['0.90 USD (0.40 scoring, 0.50 lookup)', '36 USD for 3 replicas all day'] },
          { id: 'latency', heading: 'Request latency', cells: ['4 ms lookup', '35 ms end to end'] },
          { id: 'freshness', heading: 'Score age', cells: ['Up to 25 h old', 'Current request features'] },
        ],
        emphasis: { rows: ['daily-cost'] },
        caption: 'The same toy workload has 1M entities, 2M requests/day and 500 peak QPS. Both meet the 25 h staleness and 40 ms latency limits.',
      },
    },
  },
  {
    id: 'ml-shadow-canary-ab-rollout', lessons: ['19'],
    prompts: ['When would I shadow a new model, canary it, or run an A/B test?'],
    keywords: ['shadow deployment', 'shadow traffic', 'canary rollout', 'canary deployment', 'a/b test for a model'],
    useWhen: 'Compare who sees the new model, which model drives decisions and what each test measures. Use stable random user groups for the A/B comparison.',
    spec: {
      version: 1,
      diagram: {
        kind: 'comparison', title: 'Shadow, canary and A/B testing',
        columns: [
          { heading: 'Shadow', items: ['Copy live requests to the new model', 'Current model alone decides', 'Compare error rates and latency'] },
          { heading: 'Canary', items: ['Route 5% of live requests to the new model', 'New model decides for that 5%', 'Roll back if a guardrail breaks'] },
          { heading: 'A/B test', items: ['Randomly assign users to stable groups', 'Assigned model decides for each user', 'Compare a business metric'] },
        ],
        caption: 'Error rate can be a canary guardrail. Conversion rate can be the A/B test outcome.',
      },
    },
  },
];
