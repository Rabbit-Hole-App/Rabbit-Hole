import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
const dir=mkdtempSync(join(tmpdir(),'card-preview-')),outfile=join(dir,'preview.cjs');
await esbuild.build({stdin:{contents:"export {CardEditPreview} from './InlineAiEditor.jsx'; export {createElement} from 'react'; export {renderToStaticMarkup} from 'react-dom/server';",resolveDir:fileURLToPath(new URL('.',import.meta.url)),loader:'jsx'},bundle:true,loader:{'.css':'empty'},outfile,format:'cjs',platform:'node',jsx:'automatic',logLevel:'silent'});
const B=createRequire(import.meta.url)(outfile);unlinkSync(outfile);rmdirSync(dir);
test('structured code preview renders literal Markdown fences through the shared Code component',()=>{
 const code='before\n```md\n## literal heading\n```\n````\nafter';
 const html=B.renderToStaticMarkup(B.createElement(B.CardEditPreview,{proposedOnly:true,fields:[{key:'code',label:'Code',before:'',after:code,code:true}]}));
 assert.equal((html.match(/data-code-block/g)||[]).length,1);
 assert.ok(html.includes('```md'));assert.ok(html.includes('````'));assert.ok(html.includes('## literal heading'));assert.ok(html.includes('after'));
 assert.doesNotMatch(html,/<h[1-6]/,'code lines must not become Markdown headings');
 assert.match(html,/aria-label="Copy code"/,'existing shared code controls are preserved');
});
