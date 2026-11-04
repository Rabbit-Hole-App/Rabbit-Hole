// /whiteboard jobs, one Durable Object per canvas (roadmap W1; docs/features/whiteboard). W0 only binds the class so the binding and its
// migration can ship before any feature code: it answers 404 to everything until W1 replaces this body.
export class WhiteboardJobs {
  constructor(state, env) { this.state = state; this.env = env; }
  async fetch() { return new Response(JSON.stringify({ error: 'whiteboard_not_available' }), { status: 404, headers: { 'Content-Type': 'application/json' } }); }
}
