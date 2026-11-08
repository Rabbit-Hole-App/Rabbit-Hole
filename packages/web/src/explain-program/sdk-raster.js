// Bounded raw pixels and segmentation overlays. Both helpers emit one raster
// object for the existing scene card; no guest URL, markup or image decoder.
export const RASTER_SOURCE = String.raw`
(function () {
  const fail = message => { throw new RangeError('sdk.raster/mask: ' + message); };
  const idPattern = /^[A-Za-z0-9_.:-]{1,64}$/;
  function layout(id, options) {
    if (typeof id !== 'string' || !idPattern.test(id)) fail('use a safe object ID of 1 to 64 characters');
    if (!options || typeof options !== 'object' || Array.isArray(options)) fail('expected an options object');
    const { x, y, w, h, rows, cols } = options;
    if (![x,y,w,h].every(Number.isFinite) || w <= 0 || h <= 0 || w > 2000 || h > 2000
      || [x,y,x+w,y+h].some(value => Math.abs(value) > 100000) || x+w <= x || y+h <= y) fail('invalid layout rectangle');
    if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1 || rows > 64 || cols > 64 || rows*cols > 4096) fail('rows and cols must be integers from 1 to 64, at most 4096 pixels');
    return { kind:'raster', id, x, y, w, h, rows, cols };
  }
  sdk.raster = function (id, options) {
    const object = layout(id, options), { pixels } = options;
    if (!Array.isArray(pixels) || pixels.length !== object.rows*object.cols*4) fail('pixels must contain exactly rows × cols × 4 RGBA channels');
    const copy = [];
    for (let i=0;i<pixels.length;i++) {
      const value = pixels[i];
      if (!Number.isInteger(value) || value < 0 || value > 255) fail('RGBA channels must be integers from 0 to 255');
      copy.push(value);
    }
    return { ...object, pixels:copy };
  };
  sdk.mask = function (id, options) {
    const object = layout(id, options), { values, color='#E5AA46', opacity=1 } = options;
    if (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)) fail('color must be a six-digit hex RGB color');
    if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) fail('opacity must be between 0 and 1');
    if (!Array.isArray(values) || values.length !== object.rows*object.cols) fail('values must contain exactly rows × cols mask weights');
    const r=parseInt(color.slice(1,3),16), g=parseInt(color.slice(3,5),16), b=parseInt(color.slice(5,7),16);
    const pixels=[];
    for (let i=0;i<values.length;i++) {
      const value=values[i];
      if (!Number.isFinite(value) || value < 0 || value > 1) fail('mask weights must be numbers between 0 and 1');
      pixels.push(r,g,b,Math.round(value*opacity*255));
    }
    return { ...object, pixels };
  };
})();
`;
