import fs from 'node:fs';
import { key } from '../aud-1/lib.mjs';
const K = key('ELEVENLABS_API_KEY');
const r = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': K } });
console.log(r.status);
const j = await r.json();
fs.writeFileSync('el-voices.json', JSON.stringify(j, null, 1));
const v = j.voices || [];
console.log(v.length);
for (const x of v) { const l = x.labels || {}; if ((l.gender || '').toLowerCase() === 'female') console.log(x.voice_id, '|', x.name, '|', x.category, '|', JSON.stringify(l), '|', (x.description || '').slice(0, 100)); }
