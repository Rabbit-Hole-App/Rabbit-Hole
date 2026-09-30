const fs=require('node:fs');
const path=require('node:path');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
module.exports=async function(send,assets,scratch,errors){
  const out=path.join(assets,'hybrid-07/qa'),directory=path.join(scratch,'hybrid-captures');
  fs.mkdirSync(out,{recursive:true});fs.mkdirSync(directory,{recursive:true});
  const evaluate=async expression=>{
    const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;
  };
  let loaded=false;
  for(let i=0;i<20&&!loaded;i++)try{
    loaded=await evaluate('(async()=>{for(let i=0;i<300&&!window.hybrid?.ready;i++)await new Promise(r=>setTimeout(r,50));if(!window.hybrid?.ready)throw Error("Hybrid rig did not load");return true;})()');
  }catch(e){if(!e.message.includes('Execution context was destroyed'))throw e;await sleep(100);}
  if(!loaded)throw Error('Rig navigation did not settle');
  await sleep(1700);
  const live=await evaluate('({ticks:hybrid.ticks,phases:hybrid.history,timings:hybrid.timings})');
  await evaluate('hybrid.running=false');
  await send('Emulation.setDeviceMetricsOverride',{width:1100,height:720,deviceScaleFactor:1,mobile:false});
  const capture=async(name,phase,mode,width,height)=>{
    const state=await evaluate(`(()=>{const c=document.querySelector('canvas');c.width=${width};c.height=${height};return hybrid.draw(${phase},'${mode}');})()`);
    const shot=await send('Page.captureScreenshot',{format:'png',clip:{x:0,y:0,width,height,scale:1}});
    fs.writeFileSync(path.join(directory,name+'.png'),Buffer.from(shot.data,'base64'));return state;
  };
  const phases=[0,.65,1,1.5,2,2.5,3,4,4.25,4.65,5.5,6,6.35,6.5,7,7.875];
  const details=[];
  for(const [index,phase] of phases.entries()){
    await capture('compare-p'+index,phase,'compare',1024,560);
    for(const side of ['left','right'])for(const view of ['plain','skeleton','weights','outline'])
      details.push(await capture(`leg-${side}-${view}-${index}`,phase,`leg-${side}-${view}`,512,512));
  }
  if(process.argv.includes('--inspect'))return {pass:errors.length===0,inspect_only:true,ticks:live.ticks,console_errors:errors,directory};
  const world=[];
  for(let i=0;i<128;i++){
    const phase=i/8,index=String(i).padStart(3,'0');
    if(i<64){
      await capture('single-'+index,phase,'single',512,512);
      await capture('compare-'+index,phase,'compare',1024,560);
      await capture('overlay-'+index,phase,'overlay',512,512);
    }
    world.push(await capture('world-'+index,phase,'world',1040,650));
    if(i%2===0)await capture('locks-'+index,phase,'locks',1040,650);
  }
  const ranges=[0,1].map(row=>({id:row===0?'candidate06':'candidate07',sides:Object.fromEntries(['left','right'].map(side=>{
    const group=world.filter(w=>w.phase<8&&w.rows[row].contacts[side]);
    const values=group.map(w=>w.rows[row].contacts[side].observed_ink_x).filter(x=>x!==null);
    return [side,{samples:group.length,measured_samples:values.length,range_display_px:Math.max(...values)-Math.min(...values)}];
  }))}));
  const times=live.timings.slice(10).sort((a,b)=>a-b),continuous=new Set(live.phases.map(p=>p.toFixed(5))).size>16;
  const contactCheck=Object.values(ranges[1].sides).every(s=>s.samples===21&&s.measured_samples===21&&s.range_display_px<=3);
  const report={tested_at:new Date().toISOString(),browser:(await send('Browser.getVersion')).product,
    pass_scope:'continuous browser execution, contacts and recording integrity; visual approval remains with user',
    live,performance_ms:{median:times[Math.floor(times.length*.5)],p95:times[Math.floor(times.length*.95)]},
    details,world,visible_contact_ranges:ranges,continuous_evaluation:continuous,contact_check:contactCheck,
    console_errors:errors,visual_approval:false,pass:errors.length===0&&continuous&&contactCheck};
  fs.writeFileSync(path.join(out,'browser-verification.json'),JSON.stringify(report,null,2)+'\n');
  return {pass:report.pass,ticks:live.ticks,visible_contact_ranges:ranges,console_errors:errors};
};
