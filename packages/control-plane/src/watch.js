// Watch - a nightly pass that notices what a person wouldn't: stale apps, silent
// schedules, drifting secrets. SQL plus a few model calls, not an agent loop.
// runWatchPass: 03:00 UTC. weeklyWatchEmail: Monday 08:00 UTC.
import { askOnce } from './ask.js';
import { nextRun, parseCron } from './cron.js';
import { notifySlackObservation, slackWeeklyDigest } from './slack.js';

const DAY = 86400000;
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const sqlTime = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
const parseTs = (s) => (s ? new Date(String(s).includes('T') ? s : s.replace(' ', 'T') + 'Z').getTime() : null);
const cronParts = (s) => String(s || '').split(';').map((x) => x.trim()).filter(Boolean);

// ---------- baselines: one row per app per day, all from existing tables ----------

export async function computeBaseline(env, app, now) {
  const { results: runs } = await env.DB.prepare(
    'SELECT run_id, status, exit_code, started_at, finished_at FROM runs WHERE app_id = ? ORDER BY id DESC LIMIT 20'
  ).bind(app.id).all();
  const durations = runs
    .filter((r) => r.started_at && r.finished_at)
    .map((r) => (parseTs(r.finished_at) - parseTs(r.started_at)) / 1000)
    .filter((s) => s >= 0)
    .sort((a, b) => a - b);
  const median = durations.length ? durations[Math.floor(durations.length / 2)] : null;
  let consecutiveFailures = 0;
  for (const r of runs) {
    if (r.status === 'failed') consecutiveFailures++;
    else if (r.status === 'running') continue; // an in-flight run neither breaks nor extends the streak
    else break;
  }
  // request_logs only keeps 7 days - baselines carry the long memory forward
  // (last_request_at and peak daily average survive the purge day by day).
  let req = { total: 0, last7: 0, last_at: null };
  try {
    const row = await env.DB.prepare(
      'SELECT COUNT(*) AS total, MAX(ts) AS last_at FROM request_logs WHERE org = ? AND slug = ?'
    ).bind(app.org, app.name).first();
    req = { total: row.total || 0, last_at: row.last_at };
  } catch { /* request_logs absent on fresh DBs */ }
  let hist = null;
  try {
    hist = await env.DB.prepare(
      'SELECT MAX(last_request_at) AS last, MAX(daily_req_count) AS peak FROM baselines WHERE app_id = ?'
    ).bind(app.id).first();
  } catch { /* first ever pass */ }
  const lastReqAt = [req.last_at, hist?.last].filter(Boolean).sort().pop() || null;
  const baseline = {
    median_run_secs: median,
    daily_req_count: req.total / 7, // visible window; history keeps the peak
    last_request_at: lastReqAt,
    last_run_at: runs[0]?.started_at || null,
    last_deploy_at: app.deployed_at || app.created_at,
    consecutive_failures: consecutiveFailures,
    // not stored, used by checks:
    runs,
    durations,
    ever_requested: !!(req.total || hist?.last),
    peak_daily: Math.max(req.total / 7, hist?.peak || 0),
  };
  await env.DB.prepare(
    `INSERT INTO baselines (app_id, day, median_run_secs, daily_req_count, last_request_at, last_run_at, last_deploy_at, consecutive_failures)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(app_id, day) DO UPDATE SET median_run_secs = excluded.median_run_secs, daily_req_count = excluded.daily_req_count,
       last_request_at = excluded.last_request_at, last_run_at = excluded.last_run_at, last_deploy_at = excluded.last_deploy_at,
       consecutive_failures = excluded.consecutive_failures`
  ).bind(app.id, isoDay(now), baseline.median_run_secs, baseline.daily_req_count, baseline.last_request_at,
    baseline.last_run_at, baseline.last_deploy_at, baseline.consecutive_failures).run();
  return baseline;
}

// ---------- checks: each fires at most one observation per app per day ----------

export async function evaluateChecks(env, app, b, enabled, now) {
  const fired = [];
  const add = (check, evidence) => enabled.has(check) && fired.push({ check, evidence });

  if (app.schedule && !app.schedule_paused) {
    try {
      const parsed = parseCron(cronParts(app.schedule)[0]);
      const n1 = nextRun(parsed, now);
      const interval = nextRun(parsed, n1 + 60000) - n1;
      const anchor = parseTs(b.last_run_at) || parseTs(app.deployed_at) || parseTs(app.created_at);
      if (anchor && now - anchor > 2 * interval) {
        add('schedule_missed', { schedule: app.schedule, last_run_at: b.last_run_at, expected_interval_ms: interval });
      }
    } catch { /* legacy bad cron */ }
  }

  const lastFinished = b.runs.find((r) => r.finished_at);
  if (lastFinished && b.durations.length >= 5 && b.median_run_secs > 0) {
    const dur = (parseTs(lastFinished.finished_at) - parseTs(lastFinished.started_at)) / 1000;
    // ponytail: guarded to ≥5 finished runs so one odd cold start doesn't page anyone
    if (dur > 3 * b.median_run_secs) {
      add('run_slow', { run_id: lastFinished.run_id, duration_secs: Math.round(dur), median_secs: Math.round(b.median_run_secs) });
    }
  }

  if (b.consecutive_failures >= 3) {
    const failing = b.runs.filter((r) => r.status === 'failed').slice(0, b.consecutive_failures);
    add('run_failing', {
      count: b.consecutive_failures,
      run_ids: failing.map((r) => r.run_id).slice(0, 5),
      since: failing[failing.length - 1]?.started_at,
      inputs_last: failing[0]?.run_id,
    });
  }

  if (app.kind !== 'job') {
    const lastReqMs = parseTs(b.last_request_at);
    if ((lastReqMs == null || now - lastReqMs > 14 * DAY) && b.peak_daily > 1 && b.ever_requested) {
      add('server_silent', { last_request_at: b.last_request_at, previous_daily_avg: Math.round(b.peak_daily * 10) / 10 });
    }
    const deployedMs = parseTs(app.deployed_at || app.created_at);
    if (!b.ever_requested && deployedMs && now - deployedMs > 7 * DAY) {
      add('never_opened', { deployed_at: app.deployed_at || app.created_at });
    }
  }

  try {
    const review = app.review ? JSON.parse(app.review) : null;
    const undeclared = review?.undeclared_secrets || [];
    if (undeclared.length) add('secret_drift', { undeclared: undeclared.slice(0, 5) });
  } catch { /* unparsable review */ }

  if (app.repo_public && app.repo_url && app.repo_commit && enabled.has('stale_deploy')) {
    const gh = String(app.repo_url).match(/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
    if (gh) {
      try {
        const resp = await fetch(`https://api.github.com/repos/${gh[1]}/${gh[2]}/compare/${app.repo_commit}...HEAD`, {
          headers: { 'User-Agent': 'small-watch', Accept: 'application/vnd.github+json' },
        });
        if (resp.ok) {
          const cmp = await resp.json();
          if ((cmp.ahead_by || 0) >= 20) {
            fired.push({ check: 'stale_deploy', evidence: { ahead_by: cmp.ahead_by, deployed_sha: app.repo_commit } });
          }
        }
      } catch { /* rate limit / offline - silently skip */ }
    }
  }

  if (enabled.has('access_unused')) {
    try {
      const { results: members } = await env.DB.prepare('SELECT email FROM members WHERE app_id = ?').bind(app.id).all();
      const appAgeMs = parseTs(app.created_at);
      const unused = [];
      for (const m of members) {
        const row = await env.DB.prepare('SELECT MAX(ts) AS last FROM request_logs WHERE org = ? AND slug = ? AND user = ?')
          .bind(app.org, app.name, m.email).first().catch(() => null);
        const lastMs = parseTs(row?.last);
        // ponytail: members has no shared-at date - a fresh share on an old app counts as unused
        if ((lastMs == null && appAgeMs && now - appAgeMs > 60 * DAY) || (lastMs != null && now - lastMs > 60 * DAY)) {
          unused.push({ email: m.email, last_request_at: row?.last || null });
        }
      }
      if (unused.length) add('access_unused', { members: unused.slice(0, 10) });
    } catch { /* request_logs absent */ }
  }

  return fired;
}

// ---------- observations: upsert, resolve, one model sentence for NEW rows only ----------

const FALLBACK_TEXT = {
  schedule_missed: (e) => `Scheduled (${e.schedule}) but no run for over twice the expected interval - last run ${e.last_run_at || 'never'}.`,
  run_slow: (e) => `Last run ${e.run_id} took ${e.duration_secs}s - over 3× the ${e.median_secs}s median.`,
  run_failing: (e) => `${e.count} consecutive failed runs since ${e.since} (${(e.run_ids || []).join(', ')}).`,
  server_silent: (e) => `No requests in 14 days; it previously averaged ${e.previous_daily_avg}/day (last request ${e.last_request_at}).`,
  never_opened: (e) => `Deployed ${e.deployed_at} and never received a request.`,
  secret_drift: (e) => `Review found undeclared secrets: ${(e.undeclared || []).map((s) => s.name || s).join(', ')}.`,
  stale_deploy: (e) => `Repo HEAD is ${e.ahead_by} commits ahead of the deployed ${e.deployed_sha}.`,
  access_unused: (e) => `${(e.members || []).map((m) => m.email).join(', ')} shared but no requests in 60 days.`,
};

async function observationText(env, app, check, evidence) {
  const fallback = (FALLBACK_TEXT[check] || (() => check))(evidence);
  if (!env.ANTHROPIC_API_KEY) return fallback;
  try {
    const runbook = (app.runbook || '').replace(/\s+/g, ' ').slice(0, 500);
    const text = await askOnce(
      env,
      `App ${app.name} (${app.kind}). Runbook summary: ${runbook || 'none'}.\nWatch check "${check}" fired with evidence:\n${JSON.stringify(evidence)}`,
      'Write ONE sentence for the app owner that names the concrete evidence (run ids, dates, names, counts). No advice, no preamble, no "Sources" line.',
      150,
      app.org
    );
    return text.replace(/\s*Sources:.*$/s, '').trim() || fallback;
  } catch {
    return fallback;
  }
}

export async function upsertObservations(env, app, fired, now) {
  const ts = sqlTime(now);
  const { results: open } = await env.DB.prepare(
    'SELECT * FROM observations WHERE org = ? AND slug = ? AND resolved_at IS NULL'
  ).bind(app.org, app.name).all();
  const openBy = Object.fromEntries(open.map((o) => [o.check, o]));
  const created = [];
  for (const f of fired) {
    const existing = openBy[f.check];
    if (existing) {
      await env.DB.prepare('UPDATE observations SET last_seen = ?, evidence = ? WHERE id = ?')
        .bind(ts, JSON.stringify(f.evidence), existing.id).run();
    } else {
      const text = await observationText(env, app, f.check, f.evidence);
      await env.DB.prepare(
        'INSERT INTO observations (org, slug, "check", first_seen, last_seen, evidence, text) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(app.org, app.name, f.check, ts, ts, JSON.stringify(f.evidence), text).run();
      created.push(f.check);
    }
  }
  const firedKeys = new Set(fired.map((f) => f.check));
  for (const o of open) {
    if (!firedKeys.has(o.check)) {
      await env.DB.prepare('UPDATE observations SET resolved_at = ? WHERE id = ?').bind(ts, o.id).run();
    }
  }
  return created;
}

export async function runWatchPass(env, now = Date.now()) {
  const { results: apps } = await env.DB.prepare('SELECT * FROM apps WHERE deleted_at IS NULL').all();
  const { results: checkRows } = await env.DB.prepare('SELECT key FROM checks WHERE enabled = 1').all();
  const enabled = new Set(checkRows.map((r) => r.key));
  for (const app of apps) {
    try {
      const b = await computeBaseline(env, app, now);
      const fired = await evaluateChecks(env, app, b, enabled, now);
      const created = await upsertObservations(env, app, fired, now);
      // a channel linked to this app hears about NEW observations once
      for (const check of created) {
        const row = await env.DB.prepare(
          'SELECT text FROM observations WHERE org = ? AND slug = ? AND "check" = ? AND resolved_at IS NULL'
        ).bind(app.org, app.name, check).first();
        if (row?.text) await notifySlackObservation(env, app.org, app.name, row.text);
      }
    } catch { /* one bad app must not kill the pass */ }
  }
}

// ---------- weekly email: Monday 08:00 UTC, one per owner, plain text ----------

export async function weeklyWatchEmail(env, now, send) {
  const { results } = await env.DB.prepare(
    `SELECT o.slug, o."check", o.text, o.last_seen, a.owner_email, a.org
     FROM observations o JOIN apps a ON a.org = o.org AND a.name = o.slug AND a.deleted_at IS NULL
     WHERE o.resolved_at IS NULL AND (o.dismissed_until IS NULL OR o.dismissed_until < ?)
     ORDER BY a.owner_email, o.slug`
  ).bind(sqlTime(now)).all();
  const byOwner = {};
  for (const r of results) (byOwner[r.owner_email] = byOwner[r.owner_email] || []).push(r);
  let sentCount = 0;
  const byOrg = {};
  for (const [owner, rows] of Object.entries(byOwner)) {
    const settings = await env.DB.prepare('SELECT notify_weekly FROM org_settings WHERE org = ?').bind(rows[0].org).first();
    if (settings && !settings.notify_weekly) continue; // default (no row) = on
    const lines = rows.map((r) => `- ${r.slug} · ${r.check}: ${r.text}`);
    (byOrg[rows[0].org] = byOrg[rows[0].org] || []).push(...lines);
    await send(env, owner, `small watch: ${rows.length} thing${rows.length > 1 ? 's' : ''} worth a look`,
      `Open observations across your apps:\n\n${lines.join('\n')}\n\nDismiss them from each app's page.`);
    sentCount++;
  }
  // the digest also lands in the org's Slack digest channel, when one is set
  for (const [org, lines] of Object.entries(byOrg)) await slackWeeklyDigest(env, org, lines);
  return sentCount;
}
