// Amend decision 24's text (owner, 4 November): camera archetype line, golden unchanged, strict parked with AN-22. Updates plan-doc-update-24.mjs and the docs24 commit message in build-c4.sh.
import fs from 'node:fs';
const rep = (t, a, b) => { if (t.split(a).length !== 2) throw new Error(`anchor: ${a.slice(0, 80)}`); return t.replace(a, () => b); };

const g = 'C:/s/spec/animation/release/plan-doc-update-24.mjs';
let t = fs.readFileSync(g, 'utf8');
const start = t.indexOf("const D24 = '");
const end = t.indexOf("';\n", start) + 3;
if (start < 0 || end < 3) throw new Error('D24 not found');
const D24 = "const D24 = '24. **Decision 24 (owner, 4 November 2026).** Keep the 8-of-9 Gate 2 bar for one more cycle. C7 = C6 + the repair-slot fix for the correction ask + two `loss_surface` archetype lines (data only: the arrow scale keeps the largest typical step at the default rate under a quarter of the surface width; the camera line is \"elevation 30 to 65 degrees, no azimuth, the whole surface and the path in view\") + `framing.js` minimum camera elevation of 25 degrees for any scene with a surface node (the authored azimuth is kept). The golden is not changed tonight: its hash stays `1837a72b6366ee8a8bc78d66f05ea749a56088f413d981a5a7bd4ca9316265dc`. Gate 2 reruns clean on C7 (all ten jobs, the guard retuned: `--typical author=45,review=20,repair=45`). Gate 1 reruns because the prompt-files hash changes. Strict tool output is parked with AN-22 as a schema-restructure item (55 optional parameters against the limit of 24); the lenient parse is the fix for now.';\n";
t = t.slice(0, start) + D24 + t.slice(end);
fs.writeFileSync(g, t);

const f = 'C:/s/spec/animation/release/build-c4.sh';
let b = fs.readFileSync(f, 'utf8');
b = rep(b, 'strict tool output do-now if the schema subset fits"', 'the golden unchanged, strict tool output parked with AN-22"');
fs.writeFileSync(f, b);
console.log('amended');
