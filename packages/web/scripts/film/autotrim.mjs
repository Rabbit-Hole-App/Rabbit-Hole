// From deadcheck output + the render's times map: write extra source cuts that shorten every still stretch longer than MAX to MAX (the last stretch, the overview, keeps up to KEEPLAST).
// Usage: node autotrim.mjs <deadcheck.txt> <prefix.times.json> <extra.json> [MAX=2.0] [KEEPLAST=2.6]
import { readFileSync, writeFileSync } from 'node:fs';
const [dead, timesFile, outFile, max = '2.0', keepLast = '2.6'] = process.argv.slice(2);
const times = JSON.parse(readFileSync(timesFile, 'utf8')), FPS = 30, MAX = Number(max), KEEP = Number(keepLast);
const lines = readFileSync(dead, 'utf8').split('\n');
const total = Number((lines[0].match(/: ([\d.]+) s,/) || [])[1]);
const cuts = [];
for (const line of lines) {
  const m = line.match(/^\s+([\d.]+)-([\d.]+) s/); if (!m) continue;
  const a = Number(m[1]), b = Number(m[2]), limit = b >= total - 0.4 ? KEEP : MAX;
  if (b - a <= limit) continue;
  const sa = times[Math.min(times.length - 1, Math.round((a + limit) * FPS))], sb = times[Math.min(times.length - 1, Math.round(b * FPS))];
  cuts.push([+sa.toFixed(3), +sb.toFixed(3)]);
}
writeFileSync(outFile, JSON.stringify(cuts));
console.log(`${cuts.length} extra cuts`, JSON.stringify(cuts));
