// Owner-run deterministic acceptance against the installed Linux image. No provider calls.
// Upload this exact file via authenticated Fly SSH; never expose it as a public endpoint.
import { mkdir,writeFile,readFile,chmod,chown,rm,copyFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { randomBytes,createHash } from 'node:crypto';
const reports=[], outputs='/tmp/cad-probe-artifacts';await mkdir(outputs,{recursive:true});
const requirements={units:'mm',checks:[{id:'width',kind:'bounds_mm',axis:'x',value:40,tolerance:0.001},{id:'height',kind:'bounds_mm',axis:'y',value:20,tolerance:0.001},{id:'thickness',kind:'bounds_mm',axis:'z',value:6,tolerance:0.001},{id:'solid',kind:'solid_count',value:1},{id:'volume',kind:'volume_mm3',value:4800,tolerance:0.01}]};
const source=`import os, socket
from pathlib import Path
assert 'CAD_EXECUTOR_TOKEN' not in os.environ
assert 'CAD_JOB_SECRET' not in os.environ
assert 'ANTHROPIC_API_KEY' not in os.environ
assert not Path('/var/cad/jobs/other-private/marker').exists()
try:
    Path('/app/validate.py').open('a')
    raise AssertionError('trusted code writable')
except PermissionError: pass
try:
    Path('/tmp/job/in/model.py').open('a')
    raise AssertionError('source writable')
except OSError: pass
try:
    socket.create_connection(('1.1.1.1',443),timeout=0.5)
    raise AssertionError('external network accessible')
except OSError: pass
from cadgen import build123d as bd
from cadgen import step
WIDTH=40.0
HEIGHT=20.0
THICKNESS=6.0
@step(out='/tmp/job/out/model.step')
def model():
    return bd.Box(WIDTH,HEIGHT,THICKNESS)
if __name__=='__main__': model()
`;
await mkdir('/var/cad/jobs/other-private',{recursive:true,mode:0o700});await writeFile('/var/cad/jobs/other-private/marker','private-fixture');
async function phase(name,input){
 const id=randomBytes(16).toString('hex'),dir='/var/cad/jobs/'+id;
 await mkdir(dir+'/in',{recursive:true,mode:0o2770});await mkdir(dir+'/out',{mode:0o2770});
 for(const path of [dir,dir+'/in',dir+'/out']){await chown(path,10021,10020);await chmod(path,0o2770);}
 await writeFile(dir+'/in/request.json',JSON.stringify({phase:name,requirements,limits:{stage_seconds:300}}),{mode:0o640});
 await writeFile(dir+'/in/'+(name==='build'?'model.py':'model.step'),input,{mode:0o640});
 for(const file of ['request.json',name==='build'?'model.py':'model.step'])await chown(dir+'/in/'+file,10021,10020);
 const start=performance.now();let error='';
 const exit=await new Promise(resolve=>{const child=spawn('/app/sandbox/cad-sandbox',[id],{stdio:['ignore','ignore','pipe']});child.stderr.on('data',b=>{if(error.length<8192)error+=b.toString().slice(0,8192-error.length);});child.on('error',()=>resolve(-1));child.on('close',resolve);});
 const result={phase:name,elapsed_ms:Math.round(performance.now()-start),exit};
 try{result.resources=JSON.parse(await readFile(dir+'/sandbox-exit.json','utf8'));}catch{result.missing_cleanup_proof=true;}
 if(exit!==0)result.diagnostic=error.replace(/\/tmp\/job\/[^\s"']+/g,'[job-file]').slice(0,8192);
 reports.push(result);console.log(JSON.stringify(result));
 if(exit!==0||result.resources?.cleanup?.ok!==true){await writeFile(outputs+'/report.json',JSON.stringify(reports,null,2));throw Error('phase_failed:'+name);}
 const file=name==='build'?'model.step':name==='check'?'validation.json':name==='thumbnail'?'thumbnail.png':'model.'+name;
 const bytes=await readFile(dir+'/out/'+file);await writeFile(outputs+'/'+file,bytes);await rm(dir,{recursive:true,force:true});
 result.bytes=bytes.length;result.sha256=createHash('sha256').update(bytes).digest('hex');return bytes;
}
try{
 const step=await phase('build',Buffer.from(source));
 await phase('check',step);
 for(const format of ['glb','thumbnail','stl','3mf'])await phase(format,step);
 await writeFile(outputs+'/report.json',JSON.stringify({reports,validation:JSON.parse(await readFile(outputs+'/validation.json','utf8'))},null,2));
 console.log(JSON.stringify({status:'complete',phases:reports.length,total_ms:reports.reduce((sum,r)=>sum+r.elapsed_ms,0)}));
}finally{await rm('/var/cad/jobs/other-private',{recursive:true,force:true});}
