// Synthetic UI fixtures only. This module does not read files, call APIs, or run a model.
export const files = {
  'app.py': `import sqlite3
from flask import Flask, jsonify, request

app = Flask(__name__)
DB_PATH = "/data/counter.db"

def connect():
    db = sqlite3.connect(DB_PATH)
    db.execute("CREATE TABLE IF NOT EXISTS counter (value INTEGER)")
    return db

@app.post("/increment")
def increment():
    with connect() as db:
        db.execute("UPDATE counter SET value = value + 1")
        value = db.execute("SELECT value FROM counter").fetchone()[0]
    return jsonify(value=value)

@app.post("/reset")
def reset():
    if request.headers.get("X-Confirm-Reset") != "yes":
        return jsonify(error="Confirm before resetting"), 400
    with connect() as db:
        db.execute("UPDATE counter SET value = 0")
    return jsonify(value=0)
`,
  'small.toml': 'name = "shared-counter"\nentry = "app.py"\n\n[storage]\npath = "/data"\nsize_gb = 1\n',
  'requirements.txt': 'Flask==3.1.0\n',
};

const messages = [
  { id: 'm1', role: 'User', time: '09:14:02', text: 'Build a shared counter for our team. It should keep its value when the app restarts.' },
  { id: 'm2', role: 'Claude Code', time: '09:14:08', text: 'We could start with an in-memory counter and add persistence later. I will first inspect the app configuration.' },
  { id: 'm3', role: 'Tool', time: '09:14:09', text: 'Read small.toml', body: { tool: 'Read', arguments: { file_path: 'small.toml' }, result: files['small.toml'] } },
  { id: 'm4', role: 'User', time: '09:14:31', text: 'No, use SQLite now. The counter must survive restarts. A separate database service is unnecessary for one small app.', evidence: true },
  { id: 'm5', role: 'Claude Code', time: '09:14:38', text: 'I will put the SQLite database under /data, the persistent storage path. Both reads and increments will use that database.' },
  { id: 'm6', role: 'Tool', time: '09:15:04', text: 'Write app.py', body: { tool: 'Write', arguments: { file_path: 'app.py', content: files['app.py'] }, result: 'File written.' } },
  { id: 'm7', role: 'User', time: '09:15:22', text: 'Keep reset explicit too. A colleague should not erase the shared count by clicking the wrong button.', evidence: true },
  { id: 'm8', role: 'Claude Code', time: '09:15:29', text: 'The reset endpoint will require an explicit confirmation header. A request without confirmation returns an error and leaves the count unchanged.' },
  { id: 'm9', role: 'Tool', time: '09:16:01', text: 'Check persistence and reset', body: { tool: 'Bash', arguments: { command: 'python -m unittest tests.test_counter' }, result: 'test_increment_persists ... ok\ntest_restart_keeps_count ... ok\ntest_reset_requires_confirmation ... ok\n\nRan 3 tests\nOK' } },
  { id: 'm10', role: 'Claude Code', time: '09:16:06', text: 'The database is on the persistent volume. The persistence and confirmation checks passed in this example session.' },
];

export const decisions = [
  { id: 'sqlite', title: 'Use SQLite for a persistent counter', status: 'Approved', kind: 'Design', reason: 'The counter must survive restarts. A separate database service is unnecessary for one small app.', alternatives: ['An in-memory counter', 'A separate database service'], constraints: ['Keep the database on the persistent /data volume.'], revisit: 'No condition was recorded.', anchor: 'app.py:5–10', evidence: messages[3].text, messageId: 'm4', sessionId: 'session-build', file: 'app.py', line: 5 },
  { id: 'reset', title: 'Require confirmation before resetting', status: 'Draft', kind: 'Operational', reason: 'A colleague should not erase the shared count by clicking the wrong button.', alternatives: [], constraints: ['Reject reset requests without explicit confirmation.'], revisit: 'No condition was recorded.', anchor: 'app.py:19–25', evidence: messages[6].text, messageId: 'm7', sessionId: 'session-build', file: 'app.py', line: 19 },
  { id: 'ttl', title: 'Cache the displayed value for 45 seconds', status: 'Needs review', kind: 'Design', reason: null, alternatives: [], constraints: [], revisit: 'Review against the latest deployed source.', anchor: 'Previous deploy · app.py:7', evidence: 'Set CACHE_TTL_SECONDS to 45.', messageId: 'm2', sessionId: 'session-cache' },
];

const cacheMessages = [
  { id: 'm1', role: 'Codex', time: '16:20:00', text: 'How long should the displayed value be cached?' },
  { id: 'm2', role: 'User', time: '16:20:12', text: 'Set CACHE_TTL_SECONDS to 45.' },
];
const original = rows => rows.map(m => JSON.stringify({ type: m.role === 'User' ? 'user' : m.role === 'Tool' ? 'tool_result' : 'assistant', timestamp: m.time, message: { content: m.body || m.text } })).join('\n');

export const inputs = [
  { id: 'session-build', title: 'Build a persistent counter', type: 'Session', use: 'Capture', version: 'Sep 8 · 09:14', subtitle: 'Claude Code · build-counter.jsonl', messages, original: original(messages) },
  { id: 'session-cache', title: 'Add a display cache', type: 'Session', use: 'Capture', version: 'Sep 7 · 16:20', subtitle: 'Codex · display-cache.jsonl', messages: cacheMessages, original: cacheMessages.map(m => JSON.stringify({ type: 'response_item', payload: { type: 'message', role: m.role === 'User' ? 'user' : 'assistant', content: [{ type: m.role === 'User' ? 'input_text' : 'output_text', text: m.text }] } })).join('\n') },
  { id: 'source', title: 'Deployed source', type: 'Code', use: 'Capture + Coaching', version: 'Deploy 7', subtitle: '3 files · complete sample snapshot', files },
  { id: 'runbook', title: 'Runbook', type: 'Document', use: 'Coaching', version: 'Deploy 7', subtitle: 'App documentation', content: '# Shared counter\n\nA small counter shared by the team.\n\n## Using the counter\n\nOpen the app and increment the count. Everyone sees the same value.\n\n## Storage\n\nThe count is stored in /data/counter.db on the persistent volume.\n\n## Reset\n\nResetting clears the count for everyone. Confirm the operation before continuing.\n' },
  { id: 'instructions', title: 'AGENT.md', type: 'Document', use: 'Coaching', version: 'Deploy 7', subtitle: 'App-specific instructions', content: '# Shared counter\n\nExplain current behavior from the deployed source.\nUse approved decisions to explain recorded intent.\nSay when the builder did not record a reason.\n' },
  { id: 'operations', title: 'Operational context', type: 'Operations', use: 'Coaching', version: 'Current snapshot', subtitle: 'Request summary · inputs and outputs', content: { kind: 'server', requests: { 200: 126, 400: 2 }, schedule: null, inputs: {}, outputs: {}, note: 'Illustrative summary, not a complete request log.' } },
  { id: 'access', title: 'App access', type: 'Configuration', use: 'Coaching', version: 'Current snapshot', subtitle: 'Owner and app permissions', content: { owner: 'builder@example.test', members: [{ email: 'colleague@example.test', role: 'view' }], current_user_role: 'edit' } },
  { id: 'memory', title: 'Approved decisions', type: 'Decisions', use: 'Coaching', version: 'Revision 3', subtitle: 'Decisions available to the coach', content: decisions.filter(d => d.status === 'Approved') },
];

export const answer = {
  id: 'answer', type: 'Answer', title: 'Why does the counter use SQLite?', subtitle: 'Sample coaching answer',
  content: 'The builder chose SQLite so the shared count would survive app restarts. They rejected an in-memory counter because its value would be lost, and considered a separate database service unnecessary for this small app.\n\nThe deployed app places counter.db under /data, the persistent storage path. If you change that path, check that the database still lives on the persistent volume.',
  modelInput: { example: true, question: 'Why does the counter use SQLite?', history: [], instructions: 'Explain current code behavior. Cite approved records for recorded intent. Mark unknown reasons clearly.', included_inputs: ['Deployed source', 'Runbook', 'AGENT.md', 'App access', 'Approved decisions'], decisions: [decisions[0]], source: files },
};

export const stages = [
  { id: 'read', title: 'Read inputs', summary: '10 messages · 3 source files', content: { session: 'build-counter.jsonl', messages, source: files } },
  { id: 'normalize', title: 'Normalize and redact', summary: 'Preserve speakers and evidence locations', content: { note: 'Illustrative processed input.', messages: messages.map(m => ({ id: m.id, role: m.role, content: m.body || m.text })) } },
  { id: 'model', title: 'Build model input', summary: 'Prompt, source, and session window', content: { example: true, prompt: 'Select deliberate choices supported by the session and anchored in the deployed code. Keep unknown reasons empty.', source: files, messages } },
  { id: 'response', title: 'Model response', summary: '2 candidate decisions', content: decisions.slice(0, 2) },
  { id: 'validate', title: 'Validate candidates', summary: '2 valid anchors · 1 decision awaiting approval', content: { example: true, candidates: 2, valid_anchors: 2, excluded: [], note: 'No extraction is executed in this preview.' } },
];

export const sampleApp = {
  name: 'shared-counter', org: 'example-team', orgName: 'Example team', kind: 'server',
  description: 'A persistent counter shared by the team.', owner_email: 'builder@example.test',
  deployed_at: '2026-09-08T09:16:00Z', created_at: '2026-09-07T16:20:00Z',
  visibility: 'domain', members: [], teams: [], observations: [], canEdit: false,
  email: 'builder@example.test', schedule: null,
};
