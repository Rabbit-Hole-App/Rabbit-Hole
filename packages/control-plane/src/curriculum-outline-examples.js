// Authored, synthetic input/output examples, not generated results or measured
// course timings. They illustrate scope choices; no example is a default syllabus.
export const OUTLINE_EXAMPLES = [
  {
    input: {
      app: 'A sensor viewer plots raw readings and a trailing moving average. Its CSV export contains the averages only.',
      audience: 'New to data analysis', knowledge: 'Basic arithmetic',
      goal: 'Explain smoothing and interpret the plots', duration: '20 minutes',
    },
    output: {
      title: 'Understanding a Smoothed Sensor Reading',
      modules: [
        { title: 'Measurements and averages', lessons: [
          { title: 'Reading a time series', topics: ['Measurements ordered in time', 'Variation, noise, and genuine changes'] },
          { title: 'The moving average', topics: ['Arithmetic mean over a trailing window', 'Window width and which readings contribute'] },
        ] },
        { title: 'Interpreting the result', lessons: [
          { title: 'What smoothing changes', topics: ['Reduced short-term variation and delayed response', 'Smoothing does not establish measurement accuracy'] },
          { title: 'The viewer and its export', topics: ['Comparing raw and averaged curves', 'Averages-only CSV versus raw readings visible in the plot'] },
        ] },
      ],
      prerequisites: ['Basic arithmetic and reading axes'],
      scopeNotes: ['Frequency analysis and filter design are excluded because the goal is interpreting this average, not designing general filters.'],
      duration: { fit: 'fits', explanation: 'A brief conceptual introduction at arithmetic level is plausible within 20 minutes; this is a planning judgment, not a measured learning time.' },
      ownerQuestions: [],
    },
  },
  {
    input: {
      app: 'The same sensor viewer: raw and trailing-average plots, averages-only CSV.',
      audience: 'Experienced signal-processing engineers', knowledge: 'Time series, filters, and moving averages',
      goal: 'Use this viewer and interpret its exported files', duration: '10 minutes',
    },
    output: {
      title: 'Using the Sensor Viewer',
      modules: [
        { title: 'Mapping known concepts to this viewer', lessons: [
          { title: 'Window semantics', topics: ['Trailing rather than centered windows', 'Window selection and its effect on responsiveness'] },
        ] },
        { title: 'Inspecting and exporting results', lessons: [
          { title: 'Comparing representations', topics: ['Raw and smoothed plots', 'Exported averages and information omitted from that CSV'] },
        ] },
      ],
      prerequisites: ['Moving averages and time-series interpretation'],
      scopeNotes: ['No introductory statistics: these learners already know the concepts.', 'Missing-reading and boundary handling are undocumented in the supplied description.'],
      duration: { fit: 'fits', explanation: 'Ten minutes is plausible for this narrow orientation because conceptual foundations are already known; it does not include learning signal processing.' },
      ownerQuestions: [],
    },
  },
  {
    input: {
      app: 'A route planner uses a library implementation of Dijkstra shortest paths with nonnegative edge costs.',
      audience: 'Beginners', knowledge: 'Basic arithmetic, no graph theory',
      goal: 'Explain how the algorithm finds a route and why it is correct, then use the planner', duration: '20 minutes',
    },
    output: {
      title: 'Understanding Shortest-Path Planning',
      modules: [
        { title: 'Representing a routing problem', lessons: [
          { title: 'Graphs and costs', topics: ['Nodes, edges, and reachable paths', 'Adding edge costs and defining the shortest path'] },
        ] },
        { title: 'How the algorithm works', lessons: [
          { title: 'Dijkstra search', topics: ['Tentative distances and the search frontier', 'Selecting the smallest distance and relaxing neighboring edges'] },
          { title: 'When the guarantee holds', topics: ['Why nonnegative edge costs matter', 'Settled distances and the shortest-path guarantee'] },
        ] },
        { title: 'Connecting the model to the planner', lessons: [
          { title: 'Interpreting a planned route', topics: ['What the supplied edge costs optimize', 'A shortest modeled route versus real-world travel conditions'] },
        ] },
      ],
      prerequisites: ['Basic arithmetic'],
      scopeNotes: ['Other pathfinding algorithms are excluded: comparing algorithms is not the requested goal.'],
      duration: { fit: 'needs-more-time', explanation: 'A beginner needs time to learn the graph representation and reason about correctness. Twenty minutes can provide an overview, but does not credibly promise the full stated depth.' },
      ownerQuestions: ['Extend the course for the stated depth, or explicitly approve an overview that postpones the correctness argument?'],
    },
  },
  {
    input: {
      app: 'A document search app splits text into chunks, embeds them with a pretrained model, and ranks matches by vector similarity. It returns passages, not generated answers.',
      audience: 'Writers new to semantic search', knowledge: 'Comfort reading documents; no machine learning',
      goal: 'Explain why results can match different wording and recognize search limitations', duration: '30 minutes',
    },
    output: {
      title: 'Understanding Semantic Document Search',
      modules: [
        { title: 'Representing text for search', lessons: [
          { title: 'Meaning beyond exact words', topics: ['Keyword matches versus semantic matches', 'Representing text as a vector with a pretrained embedding model'] },
          { title: 'Comparing representations', topics: ['Vector similarity as the ranking criterion', 'Related meaning versus factual correctness'] },
        ] },
        { title: 'Retrieving and interpreting passages', lessons: [
          { title: 'Chunks and context', topics: ['Splitting documents into searchable units', 'Chunk boundaries and missing surrounding context'] },
          { title: 'What a search result establishes', topics: ['Ranked passages as evidence to inspect', 'Retrieval without answer generation in the described app'] },
        ] },
      ],
      prerequisites: ['Reading documents; vectors are introduced within the course'],
      scopeNotes: ['Training objectives and model architecture are excluded: the goal concerns interpreting matches, not explaining how the embedding model is trained.'],
      duration: { fit: 'overview-only', explanation: 'Thirty minutes can introduce these relationships qualitatively. It does not cover the mathematics or training of the embedding model.' },
      ownerQuestions: [],
    },
  },
];
