// A support report (brief Task 11): a user-submitted bug or idea gets a reference they can quote. The server writes this event
// when the report arrives (the browser cannot send it); it links the reference to what the page saw just before: the
// fingerprints of its latest client errors and the trace ids of its latest failed requests. Never the report's text. The owner
// dashboard looks a reference up and shows the linked client errors and, through the traces, the server events and actions.
export default {
  namespace: 'support',
  events: {
    'support.report': {
      ref: { type: 'id', required: true },        // RH-XXXX-XXXX
      kind: { enum: ['bug', 'idea'], required: true },
      fingerprints: { type: 'ids' },              // the page's latest client.error fingerprints
      traces: { type: 'ids' },                    // the trace ids of the page's latest failed requests
      route: { type: 'route' },
    },
  },
};
