// The source contains black ink and transparent paper. Recover an opaque white
// interior for compositing over a dark opening; leave the original ink untouched.
// Closing joins stipple gaps, then an exterior flood preserves spaces between
// ears/arms/legs. A bounding rectangle would incorrectly fill those spaces.
export function paperMatte(image){
  const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
  const pixels=ctx.getImageData(0,0,canvas.width,canvas.height),{width:w,height:h}=canvas,n=w*h;
  let mask=new Uint8Array(n);
  for(let i=0;i<n;i++)mask[i]=pixels.data[i*4+3]>32?1:0;
  function morph(source,grow){
    const out=new Uint8Array(n);
    for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++){
      let value=grow?0:1;
      outer:for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
        if(source[(y+dy)*w+x+dx]===Number(grow)){value=Number(grow);break outer;}
      }
      out[y*w+x]=value;
    }
    return out;
  }
  mask=morph(morph(mask,true),false);
  const exterior=new Uint8Array(n),queue=new Int32Array(n);let head=0,tail=0;
  const add=i=>{if(i>=0&&i<n&&!mask[i]&&!exterior[i]){exterior[i]=1;queue[tail++]=i;}};
  for(let x=0;x<w;x++){add(x);add((h-1)*w+x);}
  for(let y=0;y<h;y++){add(y*w);add(y*w+w-1);}
  while(head<tail){const i=queue[head++],x=i%w;if(x)add(i-1);if(x<w-1)add(i+1);add(i-w);add(i+w);}
  const backing=ctx.createImageData(w,h);
  for(let i=0;i<n;i++)if(!exterior[i]||pixels.data[i*4+3]){backing.data.set([255,255,255,255],i*4);}
  ctx.putImageData(backing,0,0);ctx.drawImage(image,0,0);return canvas;
}
