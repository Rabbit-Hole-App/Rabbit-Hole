// Weekly Top 5 in Explore (docs/features/explore-weekly-top.md "Analytics"; the web's home/weekly-top.js builds the events). Browser
// events through the anonymous route POST /api/telemetry/client (ingest: 'client'), because the section is public and a signed-out
// visitor sees it. Ids, enums and counts only: no search text, token, handle, title or personal data; the account is the envelope's
// user_ref, stamped by the server from the session. A browser can send these names (ingest), and nothing else beyond the client
// namespace: the contract owner reviews this addition.
const TAB = { enum: ['canvases', 'creators'] };
const WEEK = { type: 'id' };       // week_start_local, YYYY-MM-DD in America/Los_Angeles
const VERSION = { type: 'token' }; // ranking_version, e.g. weekly-top-v1
export default {
  namespace: 'weekly_top',
  ingest: 'client',
  events: {
    'weekly_top.viewed': { tab: { ...TAB, required: true }, week_start_local: { ...WEEK, required: true }, ranking_version: VERSION, entry_count: { type: 'int' }, duration_ms: { type: 'ms' } },
    'weekly_top.opened': { tab: { ...TAB, required: true }, rank: { type: 'int', required: true }, target: { enum: ['canvas', 'profile'], required: true }, week_start_local: WEEK, ranking_version: VERSION },
    'weekly_top.request_failed': { status: { type: 'int', required: true }, code: { type: 'token' }, duration_ms: { type: 'ms' } },
  },
};
