// Creator analytics deletion by account or visitor identifier: prints the SQL for the restricted support process (the owner's launcher runs
// it; this file touches no database). docs/features/creator-analytics-contract.md "Deletion". Usage:
//   node scripts/analytics-delete.mjs delete|count [--user-id <users.id>] [--email <address>] [--visitor <rh-visitor-id>]
// An account's rows are keyed by users.id; --email covers the rare session without one.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { accountKey, deleteLearnerSql, LEARNER_TABLES, visitorKey } from '../packages/control-plane/src/publication-analytics-purge.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, USER = /^[A-Za-z0-9_-]{1,100}$/, EMAIL = /^[^\s'"@]{1,200}@[^\s'"@]{1,200}$/;
export async function learnerKeys({ userId, email, visitor }) {
  if (userId !== undefined && !USER.test(userId)) throw Error('--user-id is not a users.id');
  if (email !== undefined && !EMAIL.test(email)) throw Error('--email is not an address');
  if (visitor !== undefined && !UUID.test(visitor)) throw Error('--visitor is not an rh-visitor-id');
  const keys = [];
  if (userId) keys.push(await accountKey({ userId }));
  if (email) keys.push(await accountKey({ email }));
  if (visitor) keys.push(await visitorKey(visitor));
  if (!keys.length) throw Error('Name an account or a visitor: --user-id, --email or --visitor');
  return keys;
}
export const deleteSql = keys => keys.flatMap(deleteLearnerSql).join('\n');
// One row, one total: how many rows the keys hold.
export const countSql = keys => {
  keys.forEach(deleteLearnerSql); // the same check on each key
  const list = keys.map(key => `'${key}'`).join(',');
  return `SELECT ${LEARNER_TABLES.map(table => `(SELECT count(*) FROM ${table} WHERE learner_key IN (${list}))`).join(' + ')} AS analytics_rows`;
};

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [mode, ...rest] = process.argv.slice(2), flags = {};
  for (let i = 0; i < rest.length; i += 2) flags[{ '--user-id': 'userId', '--email': 'email', '--visitor': 'visitor' }[rest[i]] ?? (() => { throw Error(`unknown flag ${rest[i]}`); })()] = rest[i + 1];
  const keys = await learnerKeys(flags);
  if (mode !== 'delete' && mode !== 'count') throw Error('Use delete or count');
  console.log(mode === 'delete' ? deleteSql(keys) : countSql(keys));
}
