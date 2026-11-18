import { pinnedPlan, pinFixtures } from '../src/interact-design-pin.js';
import { writeFileSync } from 'node:fs';
console.log(pinFixtures());
const p = await pinnedPlan('toss-mvp', { depth: 'brief', evidence: [] });
writeFileSync(process.argv[2], JSON.stringify(p, null, 1));
