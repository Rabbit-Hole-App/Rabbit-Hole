import fs from 'node:fs';
const rows = JSON.parse(fs.readFileSync('survey-rows.json', 'utf8'));
const num = rows.filter(r => r.hasNumeric);
const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + '%' : '-');
const out = [];
const tab = (title, keyf, set = num) => { const m = {}; for (const r of set) { const k = keyf(r); m[k] ??= { cards: 0, flagged: 0 }; m[k].cards++; if (r.flags.length) m[k].flagged++; } out.push(`\n### ${title}`); out.push('| group | numeric cards | flagged | rate |\n|---|---|---|---|'); for (const [k, v] of Object.entries(m).sort()) out.push(`| ${k} | ${v.cards} | ${v.flagged} | ${pct(v.flagged, v.cards)} |`); };
tab('by model', r => r.model);
tab('by depth', r => r.depth);
tab('by profile', r => r.profile);
// per kind (diagram kinds carrying numbers), flagged = a flag on that kind
const kinds = {}; for (const r of num) for (const k of r.numericKinds) { kinds[k] ??= { cards: 0, flagged: 0 }; kinds[k].cards++; if (r.flags.some(f => f.kind === k)) kinds[k].flagged++; }
out.push('\n### by diagram kind (numeric kinds only; a card counts once per kind it holds)'); out.push('| kind | cards | flagged | rate |\n|---|---|---|---|'); for (const [k, v] of Object.entries(kinds).sort((a, b) => b[1].cards - a[1].cards)) out.push(`| ${k} | ${v.cards} | ${v.flagged} | ${pct(v.flagged, v.cards)} |`);
// independent cells
const cells = {}; for (const r of num) { const k = `${r.id}|${r.depth}|${r.model}`; cells[k] ??= { flagged: false }; if (r.flags.length) cells[k].flagged = true; }
out.push(`\nindependent cells (prompt x depth x model) with a numeric diagram: ${Object.keys(cells).length}, with at least one flagged variant: ${Object.values(cells).filter(c => c.flagged).length}`);
const prompts = new Set(num.map(r => r.id)); out.push(`distinct prompts: ${prompts.size}`);
console.log(out.join('\n'));
