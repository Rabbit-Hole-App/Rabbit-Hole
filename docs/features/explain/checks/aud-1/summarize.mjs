import fs from 'node:fs';
import { mp3Duration } from 'file:///C:/s/s2-prev/packages/control-plane/src/whiteboard-mp3.js';
const D='C:/s/sprint2-evidence/aud-1';
const rows=fs.readFileSync(D+'/rows.jsonl','utf8').split('\n').filter(Boolean).map(JSON.parse);
fs.writeFileSync(D+'/results.json',JSON.stringify({script:{file:'script.txt',chars:1382,words:254,utf8_bytes:1382},rows},null,1));
const med=a=>{a=a.filter(x=>x!=null).sort((x,y)=>x-y);return a.length?a[Math.floor((a.length-1)/2+ (a.length%2?0:0.5))]:null};
const f=(x,d=0)=>x==null?'-':(+x).toFixed(d);
let md='# AUD-1 TTS benchmark results\n\nOne script (script.txt): 1,382 chars, 1,382 UTF-8 bytes, 254 words. Calls run serially from a script, whole clip, body streamed. TTFB = first body chunk. Gemini ran unary (not streamed).\n\n| arm | run | HTTP | TTFB ms | total ms | bytes | audio s | chars/s | wpm | billed | USD | 20 s cut |\n|---|---|---|---|---|---|---|---|---|---|---|---|\n';
for(const r of rows) md+=`| ${r.arm} | ${r.run} | ${r.http_status} | ${f(r.ttfb_ms)} | ${f(r.total_ms)} | ${r.bytes} | ${f(r.audio_seconds,2)} | ${f(r.chars_per_sec,1)} | ${f(r.wpm)} | ${r.billed_units||'-'} | ${r.usd} | ${r.timeout_20s_would_cut?'YES':'no'} |\n`;
md+='\n## Per arm (successful runs)\n\n| arm | median TTFB ms | median total ms | audio s (median) | USD per clip | runs >20 s |\n|---|---|---|---|---|---|\n';
for(const a of [...new Set(rows.map(r=>r.arm))]){const ok=rows.filter(r=>r.arm===a&&r.http_status===200);
 md+=`| ${a} | ${f(med(ok.map(r=>r.ttfb_ms)))} | ${f(med(ok.map(r=>r.total_ms)))} | ${f(med(ok.map(r=>r.audio_seconds)),1)} | ${ok.length?f(ok[0].usd,5):'-'} | ${ok.filter(r=>r.timeout_20s_would_cut).length}/${ok.length} |\n`;}
fs.writeFileSync(D+'/summary-table.md',md);
console.log(md);
for(const f2 of fs.readdirSync(D+'/samples').filter(x=>x.endsWith('.mp3'))){const d=mp3Duration(fs.readFileSync(D+'/samples/'+f2));console.log(f2,d.sampleRate,d.seconds.toFixed(2));}
