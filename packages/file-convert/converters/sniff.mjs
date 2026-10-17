// What a source actually is, from its bytes (never its name). Returns { kind, ext } or null.
import { openZip } from './zip.mjs';

const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

// OLE2 compound files: Word and PowerPoint both use them; the root directory's stream names tell
// them apart ("WordDocument" vs "PowerPoint Document"), stored UTF-16LE.
function oleKind(b) {
  const head = b.subarray(0, Math.min(b.length, 4 * 1024 * 1024));
  if (head.indexOf(Buffer.from('WordDocument', 'utf16le')) >= 0) return { kind: 'doc', ext: 'doc' };
  if (head.indexOf(Buffer.from('PowerPoint Document', 'utf16le')) >= 0) return { kind: 'ppt', ext: 'ppt' };
  return null;
}

export function sniff(b) {
  if (b.length >= 8 && b.subarray(0, 8).equals(OLE)) return oleKind(b);
  if (b.length >= 4 && b.readUInt32LE(0) === 0x04034b50) {
    let z;
    try { z = openZip(b); } catch { return null; }
    const mime = z.has('mimetype') ? z.read('mimetype').toString('ascii').trim() : '';
    if (mime === 'application/vnd.oasis.opendocument.text') return { kind: 'odt', ext: 'odt' };
    if (mime === 'application/vnd.oasis.opendocument.presentation') return { kind: 'odp', ext: 'odp' };
    if (!z.has('[Content_Types].xml')) return null;
    if (z.has('word/document.xml')) return { kind: 'docx', ext: 'docx' };
    if (z.has('ppt/presentation.xml')) return { kind: 'pptx', ext: 'pptx' };
    return null;
  }
  if (b.subarray(0, 5).toString('latin1') === '{\\rtf') return { kind: 'rtf', ext: 'rtf' };
  if (/^ISO-10303-21;/.test(b.subarray(0, 64).toString('latin1').replace(/^﻿/, '').trimStart())) return { kind: 'step', ext: 'step' };
  return null;
}

export const ACCEPTS = Object.freeze({
  'office-pdf': ['doc', 'docx', 'odt', 'rtf'],
  slides: ['pptx', 'ppt', 'odp'],
  'step-glb': ['step'],
  // audio-playback: ffprobe decides (an audio stream it can decode), not this table.
});
