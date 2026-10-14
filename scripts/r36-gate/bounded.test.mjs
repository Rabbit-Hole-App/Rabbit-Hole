import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createConnection } from 'node:net';
import { runBounded } from './bounded.mjs';

const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
const listening = port => new Promise(resolve => {
  const s = createConnection({ port, host: '127.0.0.1' }, () => { s.destroy(); resolve(true); });
  s.on('error', () => resolve(false));
});
const BASH = process.env.GATE_BASH || process.env.GIT_BASH_PATH || 'bash';

test('a hung check is killed with its child server at the limit, and the result says it timed out', async () => {
  const port = 18901;
  // The check never ends, and its child holds a listening port and the check's output pipes.
  const hung = `const c=require('node:child_process').spawn(process.execPath,['-e',"require('http').createServer(()=>{}).listen(${port})"],{stdio:'inherit'});console.log('child '+c.pid);setInterval(()=>{},1000);`;
  let out = '';
  const began = Date.now();
  const r = await runBounded(process.execPath, ['-e', hung], { timeout: 3000, grace: 3000, onData: b => { out += b; } });
  assert.equal(r.timedOut, true, 'a clear timeout result');
  assert.ok(Date.now() - began < 9000, `settled after ${Date.now() - began} ms`);
  await new Promise(res => setTimeout(res, 1000));
  assert.equal(alive(Number(out.match(/child (\d+)/)[1])), false, 'the child is gone');
  assert.equal(await listening(port), false, 'no orphan server on the port');
});

test('a hung cleanup command is bounded: killed at its limit with a timeout result', async () => {
  const began = Date.now();
  const r = await runBounded('powershell.exe', ['-NoProfile', '-Command', 'Start-Sleep -Seconds 600'], { timeout: 3000, grace: 3000 });
  assert.equal(r.timedOut, true);
  assert.ok(Date.now() - began < 9000, `settled after ${Date.now() - began} ms`);
});

test('a hung restart is bounded, and the scoped stop.ps1 then ends the server it started in the background', { skip: process.platform !== 'win32' }, async () => {
  const port = 18902;
  const root = mkdtempSync(join(tmpdir(), 'gate-hang-')).replaceAll('\\', '/').toLowerCase();
  mkdirSync(join(root, 'packages/web'), { recursive: true });
  // stack.sh starts wrangler as ( ... & ) and then waits; here the wait never ends. The server's command line names
  // the candidate's integ-local.jsonc, as wrangler's does, so the real scoped stop.ps1 recognises it.
  writeFileSync(join(root, 'restart.sh'), `( node -e "require('http').createServer(()=>{}).listen(${port})" "${root}/packages/web/integ-local.jsonc" > "${root}/server.log" 2>&1 & )\nsleep 600\n`);
  const began = Date.now();
  const r = await runBounded(BASH, [join(root, 'restart.sh')], { timeout: 4000, grace: 3000 });
  assert.equal(r.timedOut, true);
  assert.ok(Date.now() - began < 10000, `settled after ${Date.now() - began} ms`);
  await new Promise(res => setTimeout(res, 1000));
  assert.equal(await listening(port), true, 'the background server is outside the killed tree (why the scoped cleanup exists)');
  const stop = readFileSync(new URL('./templates/fork/stop.ps1', import.meta.url), 'utf8').replaceAll('@@GATE_ROOT@@', root).replaceAll('@@APP_ROOT@@', root);
  writeFileSync(join(root, 'stop.ps1'), stop);
  const s = await runBounded('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(root, 'stop.ps1'), '-DeferPortCheck'], { timeout: 60000 });
  assert.equal(s.timedOut, false);
  await new Promise(res => setTimeout(res, 1000));
  assert.equal(await listening(port), false, 'no orphan server after the scoped cleanup');
});
