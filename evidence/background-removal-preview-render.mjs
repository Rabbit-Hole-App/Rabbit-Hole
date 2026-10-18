import { build } from '../../../node_modules/esbuild/lib/main.js';
import React from '../../../node_modules/react/index.js';
import { renderToStaticMarkup } from '../../../node_modules/react-dom/server.node.js';
import { writeFile, unlink } from 'node:fs/promises';
import assert from 'node:assert/strict';
const built=await build({entryPoints:['packages/web/src/BackgroundRemovalPreview.jsx'],bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','react/jsx-runtime'],write:false,logLevel:'silent'});
const output=new URL('./.background-removal-render.mjs',import.meta.url);
try {
 await writeFile(output,built.outputFiles[0].text);
 const {default:Preview}=await import(output);
 let calls=0;const controller={quote:()=>{calls++;},start:()=>{calls++;},dispose:()=>{}};
 const initial=renderToStaticMarkup(React.createElement(Preview,{controller,onApply:()=>{throw Error('No render-time apply');}}));
 assert.match(initial,/actual charge is not yet known/);assert.match(initial,/does not guarantee a refund/);assert.match(initial,/saved PNG/);assert.match(initial,/Checking availability/);assert.doesNotMatch(initial,/data-paid-generate/);
 const saved=renderToStaticMarkup(React.createElement(Preview,{controller,savedEnvelope:{ticket:{id:'fixture'}}}));assert.match(saved,/Resume image job/);assert.doesNotMatch(saved,/data-paid-generate/);
 const unknown=renderToStaticMarkup(React.createElement(Preview,{controller,savedEnvelope:{ticket:null}}));assert.match(unknown,/not confirmed/);assert.doesNotMatch(unknown,/Resume image job/);assert.equal(calls,0);
 console.log(JSON.stringify({passed:3,failed:0,skipped:0,coverage:'Actual React static render: initial consent disclosure, saved-ticket resume, uncertain submission; no render-time calls',limitations:'Effects and browser interactions are not exercised; controller logic has separate fixtures.'}));
}finally{await unlink(output).catch(()=>{});}
