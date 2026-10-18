// Bounded 8-bit RGB/RGBA PNG scanline decode, noninterlaced. CRC/profile checks precede this.
// https://www.w3.org/TR/png-3/#9Filters
// https://developers.cloudflare.com/workers/runtime-apis/web-standards/#compression-streams
export async function inspectPngPixels({ width, height, alphaChannel, idat }, signal) {
  const channels = alphaChannel ? 4 : 3, stride = width * channels;
  const expected = height * (stride + 1);
  const reader = new Blob(idat).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
  let previous = new Uint8Array(stride), row = new Uint8Array(stride);
  let total = 0, column = -1, filter = 0, rows = 0, transparentPixels = 0, nonopaquePixels = 0;
  const abort = () => { reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  try {
    for (;;) {
      signal?.throwIfAborted();
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > expected) throw new Error('Decoded PNG exceeds expected dimensions.');
      for (const byte of value) {
        if (column === -1) {
          if (byte > 4) throw new Error('Invalid PNG scanline filter.');
          filter = byte; column = 0; continue;
        }
        const left = column >= channels ? row[column - channels] : 0;
        const above = previous[column], upperLeft = column >= channels ? previous[column - channels] : 0;
        const predictor = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? above : filter === 3 ? Math.floor((left + above) / 2) : paeth(left, above, upperLeft);
        row[column] = (byte + predictor) & 255;
        if (alphaChannel && column % channels === 3) {
          if (row[column] === 0) transparentPixels++;
          if (row[column] < 255) nonopaquePixels++;
        }
        if (++column === stride) { rows++; [previous, row] = [row, previous]; column = -1; }
      }
    }
    signal?.throwIfAborted();
    if (total !== expected || rows !== height || column !== -1) throw new Error('Decoded PNG is incomplete.');
    return { transparentPixels, nonopaquePixels };
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { signal?.removeEventListener('abort', abort); reader.releaseLock(); }
}
