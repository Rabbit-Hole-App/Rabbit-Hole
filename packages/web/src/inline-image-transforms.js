// Receives an already authorized asset Blob. Fetching and saving remain caller-owned.
export const IMAGE_TRANSFORM_LIMITS = Object.freeze({ bytes: 20 * 1024 * 1024, side: 8192, pixels: 16 * 1024 * 1024 });

function dimensions(width, height) {
  if (![width, height].every(n => Number.isSafeInteger(n) && n > 0 && n <= IMAGE_TRANSFORM_LIMITS.side) || width * height > IMAGE_TRANSFORM_LIMITS.pixels) {
    throw new Error('Image dimensions exceed the supported limit.');
  }
}

// Reject oversized raster headers before allocating a decoded bitmap.
export function imageHeaderDimensions(bytes, type) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (offset, length) => String.fromCharCode(...bytes.slice(offset, offset + length));
  let width, height;
  if (type === 'image/png' && bytes.length >= 24 && bytes[0] === 137 && text(1, 3) === 'PNG' && text(12, 4) === 'IHDR') {
    width = view.getUint32(16); height = view.getUint32(20);
  } else if (type === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 255) break;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker) && length >= 8) {
        height = view.getUint16(offset + 3); width = view.getUint16(offset + 5); break;
      }
      offset += length;
    }
  } else if (type === 'image/webp' && bytes.length >= 30 && text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP') {
    const format = text(12, 4);
    if (format === 'VP8X') {
      width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    } else if (format === 'VP8 ' && bytes[23] === 157 && bytes[24] === 1 && bytes[25] === 42) {
      width = view.getUint16(26, true) & 16383; height = view.getUint16(28, true) & 16383;
    } else if (format === 'VP8L' && bytes[20] === 47) {
      const bits = view.getUint32(21, true);
      width = 1 + (bits & 16383); height = 1 + ((bits >>> 14) & 16383);
    }
  }
  dimensions(width, height);
  return { width, height };
}

export function imageTransformPlan(width, height, operation) {
  dimensions(width, height);
  if (!operation || typeof operation !== 'object') throw new Error('Choose an explicit image transformation.');
  let targetWidth = width, targetHeight = height;
  let source = [0, 0, width, height], destination = [0, 0, width, height], turns = 0;
  if (operation.type === 'crop') {
    const { x, y, width: w, height: h } = operation;
    dimensions(w, h);
    if (![x, y].every(n => Number.isSafeInteger(n) && n >= 0) || x + w > width || y + h > height) throw new Error('Crop must stay inside the original image.');
    source = [x, y, w, h]; targetWidth = w; targetHeight = h;
    destination = [0, 0, w, h];
  } else if (operation.type === 'rotate') {
    if (!Number.isSafeInteger(operation.quarterTurns)) throw new Error('Rotation requires whole quarter turns.');
    turns = ((operation.quarterTurns % 4) + 4) % 4;
    if (turns % 2) { targetWidth = height; targetHeight = width; }
  } else if (operation.type === 'resize') {
    dimensions(operation.width, operation.height);
    if (operation.fit !== undefined && !['contain', 'stretch'].includes(operation.fit)) throw new Error('Choose contain or explicit stretch.');
    const scale = Math.min(operation.width / width, operation.height / height);
    targetWidth = operation.fit === 'stretch' ? operation.width : Math.max(1, Math.round(width * scale));
    targetHeight = operation.fit === 'stretch' ? operation.height : Math.max(1, Math.round(height * scale));
    destination = [0, 0, targetWidth, targetHeight];
  } else if (operation.type === 'pad') {
    dimensions(operation.width, operation.height);
    if (operation.width < width || operation.height < height) throw new Error('Padding cannot crop the image.');
    if (operation.color !== undefined && operation.color !== 'transparent' && !/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(operation.color)) throw new Error('Padding color must be transparent or a hex color.');
    targetWidth = operation.width; targetHeight = operation.height;
    destination = [Math.floor((targetWidth - width) / 2), Math.floor((targetHeight - height) / 2), width, height];
  } else throw new Error('Unsupported image transformation.');
  dimensions(targetWidth, targetHeight);
  return { width: targetWidth, height: targetHeight, source, destination, turns };
}

export async function transformImage(blob, operation) {
  let bitmap;
  try {
    if (!(blob instanceof Blob) || !blob.size || blob.size > IMAGE_TRANSFORM_LIMITS.bytes || !['image/png', 'image/jpeg', 'image/webp'].includes(blob.type)) {
      throw new Error('Use an accessible PNG, JPEG or WebP image up to 20 MiB.');
    }
    imageHeaderDimensions(new Uint8Array(await blob.arrayBuffer()), blob.type);
    bitmap = await createImageBitmap(blob);
    const original = { width: bitmap.width, height: bitmap.height };
    const plan = imageTransformPlan(bitmap.width, bitmap.height, operation);
    const canvas = document.createElement('canvas');
    canvas.width = plan.width; canvas.height = plan.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Image editing is unavailable in this browser.');
    if (operation.type === 'pad' && operation.color && operation.color !== 'transparent') {
      ctx.fillStyle = operation.color; ctx.fillRect(0, 0, plan.width, plan.height);
    }
    if (plan.turns) {
      ctx.translate(plan.width / 2, plan.height / 2);
      ctx.rotate(plan.turns * Math.PI / 2);
      ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
    } else ctx.drawImage(bitmap, ...plan.source, ...plan.destination);
    const result = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!result || result.size > IMAGE_TRANSFORM_LIMITS.bytes) throw new Error('Transformed image exceeds the supported size.');
    return { ok: true, blob: result, width: plan.width, height: plan.height, mimeType: 'image/png', operation: { ...operation }, original };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'Image transformation failed.' };
  } finally { bitmap?.close(); }
}
