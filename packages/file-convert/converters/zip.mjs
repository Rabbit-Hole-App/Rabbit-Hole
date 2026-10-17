// A bounded ZIP reader for OOXML containers (DOCX/PPTX): central directory only, stored or
// deflate entries, no ZIP64, no paths ever touch the filesystem. Bounds: entry count, one
// entry's inflated size and the total inflated by one reader (decompression bombs).
import { inflateRawSync } from 'node:zlib';

export const ZIP_LIMITS = Object.freeze({ entries: 10000, entry_bytes: 32 * 1024 * 1024, total_bytes: 128 * 1024 * 1024 });

export function openZip(buf, limits = ZIP_LIMITS) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  if (b.length < 22 || b.readUInt32LE(0) !== 0x04034b50) throw new Error('not a ZIP container');
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) if (b.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('ZIP end record not found');
  const count = b.readUInt16LE(eocd + 10), cdSize = b.readUInt32LE(eocd + 12), cdOff = b.readUInt32LE(eocd + 16);
  if (count === 0xffff || cdOff === 0xffffffff) throw new Error('ZIP64 containers are not supported');
  if (count > limits.entries) throw new Error(`ZIP has more than ${limits.entries} entries`);
  if (cdOff + cdSize > b.length) throw new Error('ZIP central directory is out of bounds');
  const entries = new Map();
  let p = cdOff;
  for (let i = 0; i < count; i++) {
    if (p + 46 > b.length || b.readUInt32LE(p) !== 0x02014b50) throw new Error('ZIP central directory is corrupt');
    const method = b.readUInt16LE(p + 10), csize = b.readUInt32LE(p + 20), usize = b.readUInt32LE(p + 24);
    const nlen = b.readUInt16LE(p + 28), xlen = b.readUInt16LE(p + 30), clen = b.readUInt16LE(p + 32), local = b.readUInt32LE(p + 42);
    const name = b.toString('utf8', p + 46, p + 46 + nlen);
    entries.set(name, { name, method, csize, usize, local });
    p += 46 + nlen + xlen + clen;
  }
  let inflated = 0;
  return {
    names: () => [...entries.keys()],
    has: name => entries.has(name),
    read(name) {
      const e = entries.get(name);
      if (!e) return null;
      if (e.usize > limits.entry_bytes) throw new Error(`ZIP entry ${name} is larger than ${limits.entry_bytes} bytes`);
      if (e.local + 30 > b.length || b.readUInt32LE(e.local) !== 0x04034b50) throw new Error(`ZIP entry ${name} is corrupt`);
      const start = e.local + 30 + b.readUInt16LE(e.local + 26) + b.readUInt16LE(e.local + 28);
      if (start + e.csize > b.length) throw new Error(`ZIP entry ${name} is out of bounds`);
      const raw = b.subarray(start, start + e.csize);
      const room = Math.min(limits.entry_bytes, limits.total_bytes - inflated);
      let out;
      if (e.method === 0) out = Buffer.from(raw);
      else if (e.method === 8) {
        try { out = inflateRawSync(raw, { maxOutputLength: room }); } catch (error) { throw new Error(`ZIP entry ${name} could not be inflated within ${room} bytes: ${error.code || error.message}`); }
      } else throw new Error(`ZIP entry ${name} uses unsupported compression ${e.method}`);
      inflated += out.length;
      if (inflated > limits.total_bytes) throw new Error('ZIP inflates past the total limit');
      return out;
    },
  };
}
