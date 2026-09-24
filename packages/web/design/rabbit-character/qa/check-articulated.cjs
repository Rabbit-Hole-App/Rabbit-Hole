const fs=require('node:fs');
const path=require('node:path');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
module.exports=async function(send,assets,scratch,errors){
  const out=path.join(assets,'articulated-06/qa');
  const evaluate=async expression=>{
    const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;
  };
  let loaded=false;
  for(let i=0;i<20&&!loaded;i++)try{
    loaded=await evaluate('(async()=>{for(let i=0;i<300&&!window.articulated?.ready;i++)await new Promise(r=>setTimeout(r,50));if(!window.articulated?.ready)throw Error("Rig did not load");return true;})()');
  }catch(e){if(!e.message.includes('Execution context was destroyed'))throw e;await sleep(100);}
  if(!loaded)throw Error('Rig navigation did not settle');
  await sleep(1600);
  const live=await evaluate('({ticks:articulated.ticks,phases:articulated.history,timings:articulated.timings})');
  await evaluate('articulated.running=false');
  const shots=[];
  for(const p of [0,1,2,2.5,3,4,5,6,6.5,7]){
    await evaluate(`articulated.draw(${p})`);
    const shot=await send('Page.captureScreenshot',{format:'png',clip:{x:0,y:0,width:1536,height:560,scale:1}});
    const name=`comparison-${String(p).replace('.','-')}.png`;fs.writeFileSync(path.join(out,name),Buffer.from(shot.data,'base64'));shots.push(name);
  }
  const directory=path.join(scratch,'articulated-captures');fs.mkdirSync(directory,{recursive:true});
  const capture=async(name,phase,mode,width,height)=>{
    await evaluate(`(()=>{const c=document.querySelector('canvas');c.width=${width};c.height=${height};return articulated.draw(${phase},'${mode}');})()`);
    const shot=await send('Page.captureScreenshot',{format:'png',clip:{x:0,y:0,width,height,scale:1}});
    fs.writeFileSync(path.join(directory,name+'.png'),Buffer.from(shot.data,'base64'));
  };
  await send('Emulation.setDeviceMetricsOverride',{width:1536,height:910,deviceScaleFactor:1,mobile:false});
  const world=[];
  for(let i=0;i<128;i++){
    const phase=i/8;
    if(i<64){
      await capture(`compare-${String(i).padStart(3,'0')}`,phase,'compare',1536,560);
      await capture(`single-${String(i).padStart(3,'0')}`,phase,'single',512,512);
      await capture(`overlay-${String(i).padStart(3,'0')}`,phase,'overlay',512,512);
    }
    await evaluate("(()=>{const c=document.querySelector('canvas');c.width=1040;c.height=910;})()");
    world.push(await evaluate(`articulated.draw(${phase},'world',${phase/13})`));
    const shot=await send('Page.captureScreenshot',{format:'png',clip:{x:0,y:0,width:1040,height:910,scale:1}});
    fs.writeFileSync(path.join(directory,`world-${String(i).padStart(3,'0')}.png`),Buffer.from(shot.data,'base64'));
    if(i%2===0)await capture(`locks-${String(i).padStart(3,'0')}`,phase,'locks',1040,910);
  }
  for(const [index,phase] of [0,.65,1.5,2,2.4,2.5,3,3.5,4,4.25,4.65,5.5,6,6.35,6.5,7,7.5,7.875].entries()){
    for(const mode of ['gray','left_leg','right_leg','left_arm','right_arm'])
      await capture(`${mode}-${String(index).padStart(2,'0')}`,phase,mode,512,512);
  }
  await capture('rig-mesh',0,'mesh',512,512);
  const ranges=[];
  for(let row=0;row<3;row++){
    const sides={};
    for(const side of ['left','right']){
      const group=world.filter(w=>w.phase<8&&w.rows[row].contacts[side]);
      const xs=group.map(w=>w.rows[row].contacts[side].observed_ink_x).filter(x=>x!==null);
      sides[side]={samples:group.length,measured_samples:xs.length,range_display_px:Math.max(...xs)-Math.min(...xs)};
    }
    ranges.push({id:['pass04','pass05','continuous'][row],sides});
  }
  const times=live.timings.slice(10).sort((a,b)=>a-b);
  const contactCheck=Object.values(ranges[2].sides).every(s=>s.samples===21&&s.measured_samples===21&&s.range_display_px<=3);
  const continuousCheck=new Set(live.phases.map(p=>p.toFixed(5))).size>16;
  const report={tested_at:new Date().toISOString(),browser:(await send('Browser.getVersion')).product,
    pass_scope:'browser execution, continuous evaluation and fixed-speed ground-edge proxy only; never visual anatomy approval',
    source:'actual WebGL browser renders; recordings are not runtime animation assets',
    live,performance_ms:{median:times[Math.floor(times.length*.5)],p95:times[Math.floor(times.length*.95)],max:times.at(-1)},
    shots,capture_directory:path.relative(process.cwd(),directory),world,visible_contact_ranges:ranges,
    console_errors:errors,visual_approval:false,visual_gate:'failed: pinched recovery ankles',
    contact_check:contactCheck,continuous_evaluation_check:continuousCheck,
    pass:errors.length===0&&live.ticks>10&&contactCheck&&continuousCheck};
  fs.writeFileSync(path.join(out,'browser-verification.json'),JSON.stringify(report,null,2)+'\n');
  return {pass:report.pass,ticks:live.ticks,performance:report.performance_ms,visible_contact_ranges:ranges,console_errors:errors};
};
