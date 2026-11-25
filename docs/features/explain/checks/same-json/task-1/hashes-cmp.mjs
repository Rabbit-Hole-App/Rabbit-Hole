// usage: node hashes-cmp.mjs <before.json> <after.json>: per field, how many ids moved; the maximum Gemini property count of each
import { readFileSync } from 'node:fs';
const [bf, af] = process.argv.slice(2);
const a = JSON.parse(readFileSync(bf, 'utf8')), b = JSON.parse(readFileSync(af, 'utf8'));
const ids = new Set([...Object.keys(a), ...Object.keys(b)]);
const fields = Object.keys(Object.values(a)[0]);
const moved = Object.fromEntries(fields.map(f => [f, [...ids].filter(id => a[id]?.[f] !== b[id]?.[f]).length]));
const only = [...ids].filter(id => !a[id] || !b[id]).length;
const max = x => Math.max(...Object.values(x).map(v => v.props));
console.log(`ids before ${Object.keys(a).length}, after ${Object.keys(b).length}, in one only ${only}; moved per field ${JSON.stringify(moved)}; max Gemini properties before ${max(a)}, after ${max(b)}`);
process.exit(only || Object.values(moved).some(Boolean) ? 1 : 0);
