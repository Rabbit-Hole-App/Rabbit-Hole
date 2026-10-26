// READ-ONLY inspection of one Chat thread: did a duplicated user turn (bug lane 3aba249a: one /motion showed two identical user
// bubbles) leave two persisted messages, two proposals, two jobs or two charges? It only runs single SELECT statements: its runner
// rejects anything else, so it has no way to write. It never prints a credential, a proposal signature or a message body past 160 characters.
//
//   node C:/s/spec/day-1021/with-cf.mjs <this worktree> node scripts/chat-turn-inspect.mjs <dev|prod> --thread <canvaschat-... id, or the browser URL containing it>
//   node C:/s/spec/day-1021/with-cf.mjs <this worktree> node scripts/chat-turn-inspect.mjs <dev|prod> --text "/motion 15s explain photosynthesis, 16:9" [--from <ISO with offset>] [--to <ISO with offset>]
//   ... add --print-sql to print the statements and read nothing (no network, no credential needed).
//
// with-cf.mjs puts CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in this process's environment by NAME; this script reads only those two names.
// --text matches user messages containing the words (a leading /command is ignored, because the page-saved copy keeps it and the chat
// turn's copy does not) saved inside the window. The default window is the owner's report: 3:54 to 4:20 PM PT, 2026-10-26 (UTC-7).
// Times in D1: chat_message_meta.created_at is UTC text; usage rows are unix seconds. Orchestrator job ids are NOT in D1 (the job lives in
// the LearnVideos Durable Object and the orchestrator's log): see the closing note this script prints.
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const WINDOW = Object.freeze({ from: '2026-10-26T15:54:00-07:00', to: '2026-10-26T16:20:00-07:00' });
const DATABASES = { prod: ['rabbit-hole-learn-prod', 'wrangler.rabbit-hole-prod.jsonc'], dev: ['rabbit-hole-learn-dev', 'wrangler.dev.jsonc'] };
const THREAD = /(?:canvaschat|repochat)-[a-f0-9-]+/;
const TZ = /(?:Z|[+-]\d\d:\d\d)$/;
const SAME_TURN_SECONDS = 120; // two user messages of the same words this close together read as one submission recorded twice
export const CREDIT_MICROS = 10_000; // learn-usage.js: 1 AI credit = 10,000 micro-USD (motion-refund-failed-job.mjs divides the same way)

export function parseArgs(argv) {
  const [which, ...rest] = argv;
  if (!DATABASES[which]) return { error: 'usage: chat-turn-inspect.mjs <dev|prod> (--thread <id> | --text "<words>") [--from <ISO with offset>] [--to <ISO with offset>] [--print-sql]' };
  const out = { which, from: WINDOW.from, to: WINDOW.to, printSql: false };
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    if (flag === '--print-sql') out.printSql = true;
    else if (flag === '--dry-run') continue; // this script has no write mode: every run is a dry run
    else if (['--thread', '--text', '--from', '--to'].includes(flag) && rest[i + 1] !== undefined) out[flag.slice(2)] = rest[++i];
    else return { error: `unknown or incomplete flag: ${flag}` };
  }
  if ((out.thread === undefined) === (out.text === undefined)) return { error: 'give exactly one of --thread or --text' };
  if (out.thread !== undefined) {
    out.thread = out.thread.match(THREAD)?.[0];
    if (!out.thread) return { error: 'no canvaschat-/repochat- thread id found in --thread' };
  } else if (!out.text.trim()) return { error: '--text is empty' };
  for (const key of ['from', 'to']) if (!TZ.test(out[key]) || Number.isNaN(Date.parse(out[key]))) return { error: `--${key} needs an ISO time with its offset, for example 2026-10-26T15:54:00-07:00` };
  return out;
}

// A runner that can only read: one SELECT, nothing else (the shape motion-refund-failed-job.mjs uses).
export const readOnly = run => sql => {
  if (!/^\s*SELECT\b/i.test(sql) || /;\s*\S/.test(sql)) throw new Error(`read-only runner refused a statement that is not a single SELECT: ${sql.slice(0, 60)}`);
  return run(sql);
};
const lit = value => {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string') return `'${value.replaceAll("'", "''")}'`;
  throw new Error(`cannot put ${typeof value} in a statement`);
};
const utc = ms => new Date(ms).toISOString().slice(0, 19).replace('T', ' '); // chat_message_meta.created_at: datetime('now') text, UTC
const epoch = text => Date.parse(`${text.replace(' ', 'T')}Z`);
const core = text => String(text).trim().replace(/^\/[\w-]+\s+/, ''); // the words, without a leading /command
const credits = micros => `${Math.round((Number(micros) / CREDIT_MICROS) * 100) / 100} credits`;
const parse = text => { try { return JSON.parse(text); } catch { return {}; } };

// -> { lines, facts }. run(sql) -> { results: [...] }, already a read-only runner.
export function inspect(run, { thread, text, from, to }) {
  const lines = [], say = line => lines.push(line);
  const rows = sql => run(sql).results ?? [];
  let threads = [thread];
  if (!thread) {
    threads = rows(`SELECT DISTINCT m.thread_id FROM messages m JOIN chat_message_meta mm ON mm.message_id = m.id WHERE m.role = 'user' AND instr(m.content, ${lit(core(text))}) > 0
      AND mm.created_at >= ${lit(utc(Date.parse(from)))} AND mm.created_at <= ${lit(utc(Date.parse(to)))} LIMIT 10`).map(row => row.thread_id);
    say(`threads holding a user message with "${core(text)}" saved ${utc(Date.parse(from))} to ${utc(Date.parse(to))} UTC: ${threads.length ? threads.join(', ') : 'none'}`);
  }
  const facts = { threads: threads.length, found: 0, duplicateClusters: 0, proposals: 0, usedProposals: 0, videoActions: 0, chargedVideoActions: 0, askActions: 0 };
  if (!threads.length) { say('nothing found: check the thread id, the words and the window (UTC rows, so the window must carry its offset)'); return { lines, facts }; }
  for (const id of threads) {
    const head = rows(`SELECT id, user, scope_ref, title, created_at FROM threads WHERE id = ${lit(id)}`)[0];
    say(`\nthread ${id}${head ? ` (user ${head.user}, canvas ${head.scope_ref}, created ${head.created_at} UTC)` : ' NOT FOUND in threads'}`);
    if (!head) continue;
    facts.found += 1;
    const messages = rows(`SELECT m.id, m.role, substr(m.content, 1, 160) AS content, mm.created_at, mm.meta_json FROM messages m LEFT JOIN chat_message_meta mm ON mm.message_id = m.id
      WHERE m.thread_id = ${lit(id)}${thread ? '' : ` AND mm.created_at >= ${lit(utc(Date.parse(from)))} AND mm.created_at <= ${lit(utc(Date.parse(to)))}`} ORDER BY m.id DESC LIMIT 80`).reverse()
      .map(row => ({ ...row, meta: parse(row.meta_json), at: row.created_at ? epoch(row.created_at) : null }));
    say(`${messages.length} message(s)${thread ? ' (the newest 80)' : ' in the window'}:`);
    for (const m of messages) {
      const bits = [m.meta.clientId && `page-saved client id ${m.meta.clientId}`, m.meta.command && `command ${m.meta.command}`, m.meta.proposal && `PROPOSAL ${m.meta.proposal.proposal_id} v${m.meta.proposal.version} (${m.meta.proposal.command})`,
        m.meta.proposalState && `state v${m.meta.proposalState.version}, ${m.meta.proposalState.used ? `GENERATE PRESSED (key ${m.meta.proposalState.used.key})` : 'not generated'}`].filter(Boolean);
      say(`  #${m.id} ${m.role} ${m.created_at ?? 'no meta row'} ${JSON.stringify(m.content)}${bits.length ? `  [${bits.join('; ')}]` : ''}`);
    }
    // The same words saved twice close together: one submission recorded by two paths (the page's own save and the chat turn's).
    const users = messages.filter(m => m.role === 'user' && m.at && (!text || core(m.content).includes(core(text)))).sort((a, b) => a.at - b.at);
    const clusters = [];
    for (const m of users) {
      const last = clusters.at(-1);
      if (last && core(last.at(-1).content) === core(m.content) && m.at - last.at(-1).at <= SAME_TURN_SECONDS * 1000) last.push(m); else clusters.push([m]);
    }
    const doubled = clusters.filter(cluster => cluster.length > 1);
    facts.duplicateClusters += doubled.length;
    for (const cluster of doubled) say(`TWO persisted user messages with the same words: ${cluster.map(m => `#${m.id} (${m.meta.clientId ? 'saved by the page' : 'saved by the chat turn'})`).join(' and ')}, ${Math.round((cluster.at(-1).at - cluster[0].at) / 1000)} s apart`);
    const proposals = new Map(), used = new Set();
    for (const m of messages) {
      if (m.role !== 'assistant') continue;
      if (m.meta.proposal) proposals.set(m.meta.proposal.proposal_id, m.meta.proposal.command);
      if (m.meta.proposalState?.used && m.meta.proposal) used.add(m.meta.proposal.proposal_id);
    }
    facts.proposals += proposals.size; facts.usedProposals += used.size;
    // Usage: rows carry the account id (users.id or the email), not always the email, so they are matched by time: from a minute before the
    // first message to 40 minutes after the last (a Motion job runs about 10 minutes).
    const stamps = messages.map(m => m.at).filter(Boolean);
    if (!stamps.length) { say('no timed messages, so no usage window'); continue; }
    const t0 = Math.floor(Math.min(...stamps) / 1000) - 60, t1 = Math.floor(Math.max(...stamps) / 1000) + 40 * 60;
    const actions = rows(`SELECT action_id, user_id, feature, charge_class, payer, status, result, period, started_at, ended_at FROM usage_actions WHERE started_at >= ${t0} AND started_at <= ${t1} ORDER BY started_at LIMIT 40`);
    const attempts = actions.length ? rows(`SELECT t.action_id, t.attempt_id, t.kind, t.model, t.reserved_micros, t.cost_micros, t.cost_state, t.status, COALESCE(d.refunded_micros, 0) AS refunded_micros
      FROM usage_attempts t LEFT JOIN usage_attempt_detail d ON d.attempt_id = t.attempt_id WHERE t.action_id IN (${actions.map(a => lit(a.action_id)).join(', ')}) ORDER BY t.started_at`) : [];
    say(`usage actions started ${new Date(t0 * 1000).toISOString()} to ${new Date(t1 * 1000).toISOString()} (all users, by time; user_id is the account id): ${actions.length}${actions.length === 40 ? ' (capped at 40)' : ''}`);
    for (const a of actions) {
      const mine = attempts.filter(t => t.action_id === a.action_id);
      const cost = mine.reduce((sum, t) => sum + (Number(t.cost_micros) || 0), 0), refunded = mine.reduce((sum, t) => sum + Number(t.refunded_micros), 0);
      say(`  ${a.action_id} user ${a.user_id} feature ${a.feature} ${a.charge_class} ${a.status}${a.result ? `/${a.result}` : ''} at ${new Date(a.started_at * 1000).toISOString()}: ${mine.length} attempt(s) ${mine.map(t => `${t.kind}:${t.cost_state}`).join(',')}, settled ${credits(cost)}${refunded ? `, refunded ${credits(refunded)}` : ''}`);
      if (a.feature === 'ask') facts.askActions += 1;
      if (a.feature === 'video') { facts.videoActions += 1; if (a.charge_class === 'would_charge' && cost > refunded) facts.chargedVideoActions += 1; }
    }
  }
  if (!facts.found) { say('\nno such thread, so no answer: check the id'); return { lines, facts }; }
  say('\nANSWER (plain words)');
  say(`two persisted user messages?  ${facts.duplicateClusters ? `YES: ${facts.duplicateClusters} pair(s) of identical words saved within ${SAME_TURN_SECONDS} s` : 'no'}`);
  say(`two proposals?                ${facts.proposals > 1 ? 'YES' : 'no'}: ${facts.proposals} distinct proposal id(s)`);
  say(`two jobs?                     ${facts.usedProposals > 1 || facts.videoActions > 1 ? 'YES' : 'no'}: ${facts.usedProposals} proposal(s) with Generate pressed, ${facts.videoActions} video usage action(s) in the window`);
  say(`two charges?                  ${facts.chargedVideoActions > 1 ? 'YES' : 'no'}: ${facts.chargedVideoActions} video action(s) charged to a learner; ask actions (model calls) in the window: ${facts.askActions}`);
  say('Not in D1: orchestrator job ids and the Motion job record (the LearnVideos Durable Object). A pressed Generate shows above as the proposal state key; the orchestrator logs each job: `fly logs -a rabbit-hole-motion-orchestrator --no-tail` (read-only, as in C:/s/spec/motion-validation/failed-job-61f70171-diagnosis.md).');
  return { lines, facts };
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.error) { console.error(parsed.error); process.exit(2); }
  const ROOT = fileURLToPath(new URL('..', import.meta.url));
  const [database, config] = DATABASES[parsed.which];
  let run;
  if (parsed.printSql) {
    run = sql => { console.log(sql.replace(/\s+/g, ' ').trim()); return { results: [] }; };
    console.log(`--print-sql: ${parsed.which} (${database}); nothing is read\n`);
  } else {
    for (const name of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']) if (!process.env[name]) { console.error(`${name} is not set: run this through C:/s/spec/day-1021/with-cf.mjs (it passes the credentials by name)`); process.exit(2); }
    run = sql => {
      const r = spawnSync(process.execPath, [`${ROOT}node_modules/wrangler/bin/wrangler.js`, 'd1', 'execute', database, '--remote', '--config', config, '--json', '--command', sql.replace(/\n\s*/g, ' ')],
        { cwd: `${ROOT}packages/web`, env: process.env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      const out = r.stdout.slice(r.stdout.indexOf('['));
      if (r.status !== 0 || !out) { console.error(`wrangler failed (${r.status}); stderr tail:\n${(r.stderr || '').slice(-400)}`); process.exit(1); }
      return JSON.parse(out)[0];
    };
    console.log(`${parsed.which} (${database}) at ${new Date().toISOString()}: READ-ONLY, SELECT statements only`);
  }
  const { lines } = inspect(readOnly(run), parsed);
  for (const line of lines) console.log(line);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
