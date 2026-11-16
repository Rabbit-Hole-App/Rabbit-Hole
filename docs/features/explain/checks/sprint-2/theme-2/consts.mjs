const root = process.argv[2];
const t = await import(`${root}/packages/web/src/tutor-diagrams/teaching-theme.js`);
const p = await import(`${root}/packages/web/src/tutor-diagrams/primitives.js`);
const out = {};
for (const [k, v] of Object.entries({ ...t, ...p })) if (typeof v !== 'function') out[k] = v;
console.log(JSON.stringify(out));
