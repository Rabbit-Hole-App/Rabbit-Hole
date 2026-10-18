import { imageHeaderDimensions } from './inline-image-transforms.js';
export function validateMaskRegion(region, width, height) {
  if (!region || ![width,height].every(n=>Number.isInteger(n)&&n>0&&n<=8192) || width*height>16*1024*1024 ||
      ['x','y','width','height'].some(k=>!Number.isInteger(region[k])||region[k]<(k==='x'||k==='y'?0:1)) ||
      region.x+region.width>width || region.y+region.height>height) throw Error('Choose a rectangle inside the original image.');
  return {...region};
}
export async function readRegionalOriginal({block,scope,headers={},signal,fetchImpl=fetch}) {
  const source=block?.fileRef?.source;
  if (!source?.id || !source.rev || !scope?.app || !scope.board || scope.share || scope.member) throw Error('A saved owner PNG image is required.');
  const response=await fetchImpl(`/api/learn/files/${encodeURIComponent(source.id)}?app=${encodeURIComponent(scope.app)}&board=${encodeURIComponent(scope.board)}`,{headers,signal,cache:'no-store'});
  if(!response.ok||response.headers.get('x-source-rev')!==source.rev||response.headers.get('content-type')?.split(';')[0]!=='image/png')throw Error('The original PNG is unavailable or changed.');
  const reader=response.body.getReader(),parts=[];let size=0;
  try { for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>5*1024*1024){await reader.cancel();throw Error('The original PNG exceeds 5 MiB.');}parts.push(value);} } finally {reader.releaseLock();}
  const blob=new Blob(parts,{type:'image/png'}),bytes=new Uint8Array(await blob.arrayBuffer());
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
  if(hash!==source.rev)throw Error('The original PNG bytes changed.');
  return {blob,...imageHeaderDimensions(bytes,'image/png')};
}
export async function regionalMaskBlob(region,width,height) {
  validateMaskRegion(region,width,height);
  const canvas=new OffscreenCanvas(width,height),ctx=canvas.getContext('2d');
  ctx.fillStyle='#000000';ctx.fillRect(0,0,width,height);ctx.clearRect(region.x,region.y,region.width,region.height);
  const blob=await canvas.convertToBlob({type:'image/png'});
  if(blob.size>=4*1024*1024)throw Error('The region mask exceeds the supported size.');
  return blob;
}
