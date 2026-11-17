import fs from 'node:fs';
import { key } from '../aud-1/lib.mjs';
const r = await fetch('https://api.elevenlabs.io/v1/models', { headers: { 'xi-api-key': key('ELEVENLABS_API_KEY') } });
const j = await r.json();
const m = j.find(x => x.model_id === 'eleven_flash_v2_5');
fs.writeFileSync('el-model-flash.json', JSON.stringify(m, null, 1));
console.log(r.status, JSON.stringify({ can_use_style: m.can_use_style, can_use_speaker_boost: m.can_use_speaker_boost, languages: m.languages?.length, max: m.maximum_text_length_per_request }));
const vs = JSON.parse(fs.readFileSync('el-voices.json', 'utf8')).voices.filter(v => ['Jessica', 'Laura', 'Matilda', 'Bella'].some(n => v.name.startsWith(n)));
for (const v of vs) console.log(v.name, JSON.stringify(v.settings), JSON.stringify(v.high_quality_base_model_ids));
