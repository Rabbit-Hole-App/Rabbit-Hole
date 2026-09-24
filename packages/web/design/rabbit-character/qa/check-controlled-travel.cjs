const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

module.exports=async function checkControlled(send,assets,scratch,errors) {
  const out=path.join(assets,'controlled-05');
  await send('Emulation.setDeviceMetricsOverride',{width:1040,height:910,deviceScaleFactor:1,mobile:false});
  const evaluate=async expression=>{
    const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
    return result.result.value;
  };
  let loaded=false;
  for(let attempt=0;attempt<20&&!loaded;attempt++) {
    try {
      loaded=await evaluate('(async()=>{for(let i=0;i<200&&!window.controlled?.ready;i++)await new Promise(r=>setTimeout(r,25));if(!window.controlled?.ready)throw new Error("Controlled assets did not load");return true;})()');
    } catch(error) {
      if(!error.message.includes('Execution context was destroyed'))throw error;
      await sleep(100);
    }
  }
  if(!loaded)throw new Error('Initial asset navigation did not settle.');
  await sleep(1400);
  const live=await evaluate('({ticks:controlled.ticks,history:controlled.history,scale:controlled.scale})');
  const directory=path.join(scratch,'controlled-captures');fs.mkdirSync(directory,{recursive:true});
  const states=[];
  for(let i=0;i<128;i++) {
    states.push(await evaluate(`controlled.seek(${i/104})`));
    const shot=await send('Page.captureScreenshot',{format:'png'});
    fs.writeFileSync(path.join(directory,`${String(i).padStart(3,'0')}.png`),Buffer.from(shot.data,'base64'));
  }
  const boundaries=[];
  for(let i=0;i<16;i++) boundaries.push(await evaluate(`controlled.seek(${i/26})`));
  const holdEnds=[];
  for(let i=0;i<16;i++) holdEnds.push(await evaluate(`controlled.seek(${(i+1)/26-1e-5})`));
  const speedCases=[];
  // Couple gait speed only at the calibrated comparison; deliberately show
  // mismatch at +/-20% so the calibration requirement is explicit.
  for(const speed of [624,780,936,1040]) {
    const samples=[];
    for(let i=0;i<16;i++) samples.push(await evaluate(`controlled.seek(${i/26},${speed})`));
    speedCases.push({speed,samples});
  }
  await evaluate('controlled.seek(3/13)');
  const screenshot=await send('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync(path.join(out,'qa/world-browser.png'),Buffer.from(screenshot.data,'base64'));
  const liveFrames=[0,1,2].map(row=>[...new Set(live.history.map(s=>s.rows[row].frame))].sort((a,b)=>a-b));
  const linear=states.slice(1).every((s,i)=>Math.abs(s.physics_root_x-states[i].physics_root_x-780*.375/104)<1e-7);
  const fixed=states.every(s=>s.rows.every((r,i)=>r.baseline===[300,570,840][i]&&r.visual_offset_x===0));
  const observed=[];
  for(let row=0;row<3;row++) {
    const ranges={};
    for(const side of ['left','right']) {
      const samples=boundaries.filter((_,i)=>row===2||i%2===0).map(s=>s.rows[row]).filter(s=>s.support===side);
      const values=samples.map(s=>s.observed_foot_ink_x).filter(v=>v!==null);
      ranges[side]={observed_pose_boundary_range_display_px:Math.max(...values)-Math.min(...values),samples};
    }
    const start=boundaries[0].rows[row],end=holdEnds[row===2?0:1].rows[row];
    observed.push({id:start.id,stance:ranges,observed_first_hold_slip_display_px:end.observed_foot_ink_x-start.observed_foot_ink_x});
  }
  const paths={pass04:'run-strip.png',keys:'controlled-05/run-right-8.png',sixteen:'controlled-05/run-right-16.png'};
  const hashes=Object.fromEntries(Object.entries(paths).map(([id,file])=>[id,crypto.createHash('sha256').update(fs.readFileSync(path.join(assets,file))).digest('hex')]));
  const report={tested_at:new Date().toISOString(),browser:(await send('Browser.getVersion')).product,
    environment:'isolated Chrome / private asset QA; no app renderer migration',
    live_raf_ticks:live.ticks,live_visible_frames:liveFrames,linear_physics_root:linear,fixed_ground:fixed,
    visual_root_compensation:false,camera_motion:false,display_scale:.375,speed_source_px_s:780,
    captures:{count:128,sampling_fps:104,cycles:2,directory:path.relative(process.cwd(),directory)},
    source_sha256:hashes,observed_canvas_measurements:observed,pose_boundaries:boundaries,hold_ends:holdEnds,
    speed_cases:speedCases,capture_states:states,console_errors:errors,visual_quality_approved:false,
    pass:linear&&fixed&&live.ticks>10&&liveFrames.every((f,i)=>f.length===[8,8,16][i])&&errors.length===0};
  fs.writeFileSync(path.join(out,'qa/browser-verification.json'),JSON.stringify(report,null,2)+'\n');
  return {pass:report.pass,browser:report.browser,live_frames:liveFrames.map(f=>f.length),
    actual_captures:128,observed:observed.map(v=>({id:v.id,first_hold_slip:v.observed_first_hold_slip_display_px,
      contact_ranges:Object.fromEntries(Object.entries(v.stance).map(([s,r])=>[s,r.observed_pose_boundary_range_display_px]))})),console_errors:errors};
};
