// Supervise exactly one Node command. The monitor owns only freshly observed descendants.
import { spawn } from 'node:child_process';
import { mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const split=process.argv.indexOf('--');
if (split !== 3) throw Error('usage: node supervise.mjs <log-base> -- <node arguments>');
const base=resolve(`${process.argv[2]}-${Date.now()}-${process.pid}`);
mkdirSync(dirname(base),{recursive:true});
const monitor=spawn('powershell.exe',['-NoProfile','-File',fileURLToPath(new URL('process-watch.ps1',import.meta.url)),'-RootPid',String(process.pid),'-LogBase',base],{windowsHide:true,stdio:['ignore','ignore','pipe']});
monitor.stderr.on('data',b=>appendFileSync(`${base}.monitor-errors.log`,b));
const monitorEnded=new Promise(resolve=>{monitor.once('error',e=>resolve({error:e.message}));monitor.once('exit',(code,signal)=>resolve({code,signal}));});
const child=spawn(process.execPath,process.argv.slice(split+1),{windowsHide:true,stdio:['ignore','pipe','pipe'],env:process.env});
writeFileSync(`${base}.start.json`,JSON.stringify({at:new Date().toISOString(),pid:child.pid,supervisor:process.pid,command:[process.execPath,...process.argv.slice(split+1)],cwd:process.cwd()},null,2));
child.stdout.on('data',b=>{appendFileSync(`${base}.stdout.log`,b);process.stdout.write(b);});
child.stderr.on('data',b=>{appendFileSync(`${base}.stderr.log`,b);process.stderr.write(b);});
const ended=new Promise(resolve=>{child.once('error',e=>resolve({code:1,error:e.message}));child.once('exit',(code,signal)=>resolve({code,signal}));});
let stopping;
const stop=async()=>{
  if(stopping)return stopping;
  stopping=(async()=>{
    writeFileSync(`${base}.stop`,'stop');
    let timer;
    const result=await Promise.race([monitorEnded,new Promise(resolve=>{timer=setTimeout(()=>resolve({error:'Monitor cleanup timed out'}),30000);})]);
    clearTimeout(timer);
    writeFileSync(`${base}.monitor-exit.json`,JSON.stringify(result));
    if(result.code!==0)throw Error(`Process observer failed: ${JSON.stringify(result)}`);
  })();
  return stopping;
};
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{try{await stop();}finally{process.exit(143);}});
const result=await ended;
writeFileSync(`${base}.exit.json`,JSON.stringify({at:new Date().toISOString(),...result},null,2));
// Give the observer one sample to capture workerd's native exit code before teardown.
await new Promise(resolve=>setTimeout(resolve,2500));
await stop();
process.exitCode=result.code===0?0:result.code||1;
