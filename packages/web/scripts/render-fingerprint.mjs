#!/usr/bin/env node
// A committed static-00.png is a claim: "this is what scene-spec.json in this
// same directory renders to, on this renderer." Nothing enforced that claim -
// a scene-spec.json could be edited and the PNG never re-rendered, and
// nothing would know. That happened for real: cases 01 and 03 were fixed at
// the data level, the checkers went green, and the committed PNGs still
// showed the old, false numbers, because "green checkers" was never evidence
// about the ARTIFACT, only about the source state. See docs/superpowers/
// specs/2026-09-18-visual-language-and-motion-design.md's invariant on this.
//
// Deliberately not filesystem mtimes - checkouts, copies, CI and restores all
// make timestamps lie. A fingerprint is a hash of the actual bytes that
// determine the pixels: the scene-spec.json content, and the renderer source
// that turns it into pixels. Either one changing invalidates the render.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Every source file whose content can change what a scene-spec.json renders
// to. A change to any of these - a colour token, a layout gap, a derive op -
// invalidates every committed render, which is exactly the point: this list
// growing stale (a renderer file added but not listed here) is the one way
// this gate could itself go blind, so keep it to "what AnimatedScene.jsx's
// own import graph actually touches for pixels," not a guess.
export const RENDERER_FILES = [
  'src/animation-scene.js',
  'src/scene-derive.js',
  'src/scene-legacy.js',
  'src/scene-vocab.js',
  'src/scene-style.js',
  'src/scene-layout.js',
  'src/AnimatedScene.jsx',
  'src/scene-format.js', // what a data cell prints
];

const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');

export const sceneSpecHash = sceneSpecPath => sha256(readFileSync(sceneSpecPath));

export function rendererHash(webRoot) {
  const combined = Buffer.concat(RENDERER_FILES.map(f => readFileSync(join(webRoot, f))));
  return sha256(combined);
}

export function expectedFingerprint(sceneSpecPath, webRoot) {
  return { sceneSpecHash: sceneSpecHash(sceneSpecPath), rendererHash: rendererHash(webRoot) };
}

export function fingerprintPathFor(pngPath) {
  return `${pngPath}.fingerprint.json`;
}

// Writes the fingerprint for <dir>/static-00.png from <dir>/scene-spec.json,
// as of right now - call this the moment after a real render, never before.
export function writeFingerprint(caseDir, webRoot) {
  const sceneSpecPath = join(caseDir, 'scene-spec.json');
  const pngPath = join(caseDir, 'static-00.png');
  if (!existsSync(sceneSpecPath)) throw new Error(`no scene-spec.json in ${caseDir}`);
  if (!existsSync(pngPath)) throw new Error(`no static-00.png in ${caseDir} - render it first`);
  const fingerprint = expectedFingerprint(sceneSpecPath, webRoot);
  writeFileSync(fingerprintPathFor(pngPath), JSON.stringify(fingerprint, null, 2));
  return fingerprint;
}

// CLI: node render-fingerprint.mjs write <caseDir> [webRoot]
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('render-fingerprint.mjs')) {
  const [, , cmd, caseDir, webRootArg] = process.argv;
  const webRoot = webRootArg || dirname(dirname(fileURLToPath(import.meta.url)));
  if (cmd === 'write' && caseDir) {
    const fp = writeFingerprint(caseDir, webRoot);
    console.log(`wrote fingerprint for ${caseDir}`);
    console.log(JSON.stringify(fp, null, 2));
  } else {
    console.error('usage: node render-fingerprint.mjs write <caseDir> [webRoot]');
    process.exit(2);
  }
}
