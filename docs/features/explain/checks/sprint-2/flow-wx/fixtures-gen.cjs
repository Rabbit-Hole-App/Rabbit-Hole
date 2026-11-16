const fs = require('fs');
const dir = process.argv[2];
let s = fs.readFileSync(dir + '/flow.test.mjs', 'utf8').replace(/\r\n/g, '\n');
s = s.replace("import test from 'node:test';", 'const test = () => {};');
const names = [...s.matchAll(/^const (\w+) = \{/gm)].map(m => m[1]).filter(n => ['cache', 'swallow', 'triage', 'sameSide', 'narrow', 'longLabels'].includes(n));
s += `\nexport const fixtures = { ${names.join(', ')} };\n`;
fs.writeFileSync(dir + '/zz-fixtures.mjs', s);
console.log(names.join(','));
