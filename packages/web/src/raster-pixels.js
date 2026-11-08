// Numeric-only RGBA rasters. No markup, URL, decoder or external asset crosses this boundary.
export const RASTER_LIMITS = Object.freeze({ side: 64, pixels: 4096, framePixels: 8192 });
export function rasterProblem({ rows, cols, pixels }) {
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1 || rows > RASTER_LIMITS.side || cols > RASTER_LIMITS.side || rows * cols > RASTER_LIMITS.pixels) return 'raster dimensions must be integers from 1 to 64';
  if (!Array.isArray(pixels) || pixels.length !== rows * cols * 4) return 'raster needs exactly four RGBA bytes per pixel';
  for (const value of pixels) if (!Number.isInteger(value) || value < 0 || value > 255) return 'raster channels must be integer bytes from 0 to 255';
  return null;
}

// Runs never cross rows or alpha boundaries. Skipping alpha zero preserves underlying
// images (including holes in a segmentation mask). SVG scaling is nearest-neighbor.
export function rasterRuns(raster) {
  const problem = rasterProblem(raster);
  if (problem) throw new Error(problem);
  const { rows, cols, pixels } = raster, runs = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols;) {
      const at = (row * cols + col) * 4, rgba = pixels.slice(at, at + 4);
      let end = col + 1;
      while (end < cols && rgba.every((value, i) => pixels[(row * cols + end) * 4 + i] === value)) end++;
      if (rgba[3]) runs.push({ x: col, y: row, w: end - col, fill: `rgb(${rgba[0]},${rgba[1]},${rgba[2]})`, opacity: rgba[3] / 255 });
      col = end;
    }
  }
  return runs;
}
