export function editableImage(block) {
  // A PDF excerpt's crop is the page's own picture (pdf-excerpts brief section 8): never replaced by an image edit.
  return !!block && !block.excerpt && (block.type === 'image' || block.type === 'file' && block.kind === 'image') && !block.locked && !block.sources?.length && !block.citations?.length && !block.references?.length && !!(block.assetKey || block.fileRef?.source?.id && block.fileRef?.source?.rev);
}
// Shape validation only. Source dimensions and permissions are checked while preparing bytes.
export function imageOperation(input) {
  const keys={crop:['type','x','y','width','height'],rotate:['type','quarterTurns'],resize:['type','width','height','fit'],pad:['type','width','height','color']};
  if(!input||!keys[input.type]||Object.keys(input).some(key=>!keys[input.type].includes(key)))throw Error('Choose an explicit supported image transformation.');
  if(input.type==='rotate') {if(!Number.isSafeInteger(input.quarterTurns)||Math.abs(input.quarterTurns)>4||input.quarterTurns%4===0)throw Error('Choose one to three quarter turns.');}
  else {
    if(![input.width,input.height].every(n=>Number.isSafeInteger(n)&&n>0&&n<=8192)||input.width*input.height>16*1024*1024)throw Error('Image dimensions exceed the supported limit.');
    if(input.type==='crop'&&![input.x,input.y].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=8192))throw Error('Crop coordinates must be source pixels.');
    if(input.type==='resize'&&input.fit!==undefined&&!['contain','stretch'].includes(input.fit))throw Error('Choose contain or explicit stretch.');
    if(input.type==='pad'&&input.color!==undefined&&input.color!=='transparent'&&!/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(input.color))throw Error('Choose transparent or a hex padding color.');
  }
  return structuredClone(input);
}
