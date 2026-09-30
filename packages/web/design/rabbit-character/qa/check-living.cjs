const fs=require('node:fs');const path=require('node:path');
module.exports=async(send,assets,scratch,errors)=>{
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  for(let attempt=0;attempt<20;attempt++)try{await evaluate('(async()=>{for(let i=0;i<300&&!window.living?.ready;i++)await new Promise(r=>setTimeout(r,50));if(!window.living?.ready)throw Error("Living rig failed to load");})()');break;}catch(e){if(!e.message.includes('Execution context was destroyed'))throw e;}
  await send('Emulation.setDeviceMetricsOverride',{width:1100,height:740,deviceScaleFactor:1,mobile:false});
  const out=path.join(assets,'living-08/qa');fs.mkdirSync(out,{recursive:true});
  for(const action of ['idle_breathe','idle_look_left','idle_look_right','idle_watch_check','crouch','portal']){
    for(const t of action==='portal'?[2,3,3.4,3.8,4.4,4.8,5.4,6]:[0,.6,1.2,1.8]){
      const state=await evaluate(`living.draw('${action}',${t})`);
      const shot=await send('Page.captureScreenshot',{format:'png',clip:{x:0,y:0,width:1000,height:640,scale:1}});
      fs.writeFileSync(path.join(out,`${action}-${t}.png`),Buffer.from(shot.data,'base64'));
      fs.writeFileSync(path.join(out,`${action}-${t}.json`),JSON.stringify(state,null,2));
    }
  }
  return {pass:errors.length===0,console_errors:errors,scope:'rendered artwork probe; full deployed UI QA still required'};
};
