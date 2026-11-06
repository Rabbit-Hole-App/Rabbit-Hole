// Lead-only patch (packages/control-plane/repository-schema.sql): append learn-migrations/0042-roadmap-source-index.sql exactly as the file carries 0038/0039
// (a `-- learn-migrations/<name>` header line, then the migration text). CRLF kept. Idempotent. Applies the SCHEMA FILE only; it applies no migration to any database.
// Usage: node docs/features/explain-on-canvas/lead-patches/apply-r7a-schema.mjs [path-to-repository-schema.sql]
import { readFileSync, writeFileSync } from 'node:fs';

const path = process.argv[2] || 'packages/control-plane/repository-schema.sql';
const name = '0042-roadmap-source-index.sql';
const migration = readFileSync(new URL(`../../../../packages/control-plane/learn-migrations/${name}`, import.meta.url), 'utf8').replace(/\r/g, '').trim();
const raw = readFileSync(path, 'utf8');
if (raw.includes(`-- learn-migrations/${name}`)) throw Error('already applied');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
const body = `-- learn-migrations/${name}\n${migration}`.split('\n').join(eol);
writeFileSync(path, raw.replace(/\s*$/, '') + eol + body + eol);
console.log(`appended ${name} to ${path}`);
