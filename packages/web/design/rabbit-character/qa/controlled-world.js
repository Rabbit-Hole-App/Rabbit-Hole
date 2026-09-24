// Private asset QA fixture, not an application page or articulated runtime.
(async () => {
  const canvas = document.querySelector('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const config = await (await fetch('/controlled.json')).json();
  const strips = await Promise.all(['/pass04.png', '/keys.png', '/sixteen.png'].map(async src => {
    const image = new Image(); image.src = src; await image.decode(); return image;
  }));
  const scale = config.display_scale;
  const baselines = [300,570,840];
  let playing = true, start;
  function visibleContact(expectedX, baseline) {
    const x = Math.floor(expectedX-30), y = baseline-3;
    const pixels = ctx.getImageData(x,y,60,4).data;
    let last = null;
    for(let row=0;row<4;row++) for(let col=0;col<60;col++) {
      const k=(row*60+col)*4;
      if(pixels[k]<35 && pixels[k+1]<35 && pixels[k+2]<35) last=Math.max(last ?? -Infinity,x+col);
    }
    return last;
  }
  function render(seconds, speed=config.speed_source_px_s) {
    const physicsRootX = 170+seconds*speed*scale;
    ctx.fillStyle='#fff'; ctx.fillRect(0,0,1040,910);
    ctx.fillStyle='#252525'; ctx.font='18px Arial';
    ctx.fillText('Continuous world movement / same stride duration / fixed ground',24,28);
    ctx.font='14px Arial'; ctx.fillStyle='#555';
    ctx.fillText(`${speed} source px/s = ${speed*scale} display px/s; no visual root compensation`,24,51);
    const rows=[];
    for(let row=0;row<3;row++) {
      const variant=config.versions[row], baseline=baselines[row];
      const index=Math.floor(seconds*variant.fps+1e-7)%variant.count;
      ctx.strokeStyle='#bcc1c5'; ctx.lineWidth=1; ctx.beginPath();
      ctx.moveTo(24,baseline+.5); ctx.lineTo(1016,baseline+.5); ctx.stroke();
      for(let x=50;x<1040;x+=50) {ctx.beginPath();ctx.moveTo(x+.5,baseline);ctx.lineTo(x+.5,baseline+9);ctx.stroke();}
      ctx.imageSmoothingEnabled=false;
      ctx.drawImage(strips[row],index*512,0,512,512,physicsRootX-256*scale,baseline-480*scale,512*scale,512*scale);
      const point=variant.points.find(p=>p.frame===index+1);
      const footX=point?physicsRootX+(point.x-256)*scale:null;
      // Inspect actual black foot pixels on the canvas, not just transformed metadata.
      const observed=point?visibleContact(footX,baseline):null;
      ctx.fillStyle='#555';ctx.font='15px Arial';
      ctx.fillText(`${variant.label} / ${variant.fps} FPS / pose ${String(index+1).padStart(2,'0')}`,24,baseline+33);
      rows.push({id:variant.id,frame:index+1,baseline,physics_root_x:physicsRootX,visual_offset_x:0,
        support:point?.support??null,proxy_foot_x:footX,observed_foot_ink_x:observed});
    }
    return {seconds,speed,physics_root_x:physicsRootX,rows};
  }
  window.controlled={ready:true,scale,config,ticks:0,history:[],
    seek(seconds,speed){playing=false;return render(seconds,speed);}};
  function tick(timestamp) {
    if(start===undefined) start=timestamp;
    if(playing){const state=render((timestamp-start)/1000%(16/13));controlled.ticks++;if(controlled.history.length<200)controlled.history.push(state);}
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
