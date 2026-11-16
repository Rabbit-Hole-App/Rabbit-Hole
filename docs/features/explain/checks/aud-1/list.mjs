import fs from 'node:fs';
import { key, redact } from './lib.mjs';
const [el, gm] = [key('ELEVENLABS_API_KEY'), key('GEMINI_API_KEY')];
const r1 = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': el } });
const t1 = await r1.text();
console.log('EL voices', r1.status);
try { const j = JSON.parse(t1); const v = (j.voices||[]).filter(v=>v.category==='premade').map(v=>({id:v.voice_id,name:v.name,labels:v.labels})); fs.writeFileSync('C:/s/sprint2-evidence/aud-1/el-voices.json', JSON.stringify(v,null,1)); console.log(v.length, 'premade of', (j.voices||[]).length); console.log(v.slice(0,12).map(x=>x.id+' '+x.name+' '+JSON.stringify(x.labels)).join('\n')); } catch { console.log(redact(t1.slice(0,300),[el])); }
const r2 = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': gm } });
const j2 = await r2.json().catch(()=>({}));
console.log('Gemini models', r2.status);
for (const m of j2.models||[]) if (/tts|audio|speech/i.test(m.name)) console.log(m.name, m.supportedGenerationMethods);
