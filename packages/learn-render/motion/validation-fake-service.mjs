// An in-process stand-in for the Motion render service, for the validation harness's dry run and its unit tests. It answers the same
// routes with the same shapes (health with counters and settings, an idempotent POST /render, a polled record) and renders nothing.
// behavior: ready | failed | busy | invalid | throw | hang | proxy-retry (the service sees every POST twice, as a retrying proxy would).
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export function fakeService({ behavior = 'ready', polls = 1, cpus = 1.5, memoryGiB = 3, revision = 'fake-revision' } = {}) {
  const counters = { posts: 0, started: 0, replayed: 0 };
  const jobs = new Map(), keys = new Map();
  const settings = { git_revision: revision, sandbox: 'linux', cpus, memory_gib: memoryGiB, cpu_period_us: 100000, pids_max: 1024, timeout_seconds: 420, deadline_formula: { enabled: false } };
  const health = () => ({ ok: true, service: 'fake', version: 'fake-1', boot_id: 'fakeboot', busy: false, counters: { ...counters }, settings });
  const log = [];
  const fetchImpl = async (url, init = {}) => {
    const { pathname } = new URL(url), method = init.method || 'GET';
    log.push(`${method} ${pathname}`);
    if (behavior === 'throw' && method === 'POST') throw new TypeError('fetch failed');
    if (pathname === '/health') return json(200, health());
    if (pathname === '/render' && method === 'POST') {
      counters.posts += behavior === 'proxy-retry' ? 2 : 1;
      const key = init.headers?.['idempotency-key'];
      if (behavior === 'busy') return json(429, { error: 'busy', detail: 'one render at a time' });
      if (behavior === 'invalid') return json(400, { error: 'invalid_job', errors: ['request.schema'] });
      if (key && keys.has(key)) { counters.replayed++; return json(202, { render_id: keys.get(key), status: 'rendering', replayed: true }); }
      const request = JSON.parse(init.body), id = String(jobs.size + 1).padStart(32, '0'), brief = request.brief, o = brief.output_requirements, final = (request.stage ?? 'final') === 'final';
      counters.started++;
      jobs.set(id, { request, polls: 0, final, o, seconds: brief.duration.seconds, key });
      if (key) keys.set(key, id);
      return json(202, { render_id: id, status: 'rendering', poll: `/render/${id}`, deadline_seconds: 420 });
    }
    const m = pathname.match(/^\/render\/([0-9]{32})$/);
    if (m && method === 'GET') {
      const job = jobs.get(m[1]);
      if (!job) return json(404, { error: 'not_found' });
      if (behavior === 'hang' || ++job.polls < polls) return json(200, { render_id: m[1], status: 'rendering' });
      const base = { render_id: m[1], stage: job.final ? 'final' : 'preview', settings, deadline_seconds: 420, created_at: '2026-10-23T20:00:00.000Z', finished_at: '2026-10-23T20:02:00.000Z' };
      const resources = { backend: 'cgroup-v1', memory_bytes: memoryGiB * 1024 ** 3, swap_bytes: 0, pids_max: 1024, cpu_period_us: 100000, cpu_quota_us: cpus * 100000, cpu_quota: cpus, memory_peak: 1.2 * 1024 ** 3, oom_kills: 0, cpu_throttled: 10, cpu_throttled_time_us: 2000000, cpu_usage_us: 90000000, cleanup: { ok: true } };
      if (behavior === 'failed') return json(200, { ...base, status: 'failed', error: 'timeout', detail: 'the render exceeded 420s and was stopped', resources });
      const frames = job.seconds * 30, pw = Math.round(job.o.stage_width * job.o.preview_scale), ph = Math.round(job.o.stage_height * job.o.preview_scale);
      return json(200, { ...base, status: 'ready', duration_seconds: job.seconds, fps: 30, width: job.o.stage_width, height: job.o.stage_height, frame_count: frames, output_bytes: frames * 4000,
        preview: { width: pw, height: ph, frame_count: frames, bytes: frames * 800 }, timings: { bundle: 12.5, preview: 30, final: 40, total: 110 }, resources });
    }
    if (m && method === 'DELETE') return json(200, { render_id: m[1] });
    return json(404, { error: 'not_found' });
  };
  return { fetch: fetchImpl, counters, log, jobs };
}
