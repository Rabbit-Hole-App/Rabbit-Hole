// Public, repository-owned square raster fixtures only. A guest sees the keys, never a path or a loader.
// Only the trusted Frame adapter can translate an accepted key to a path. This is not a source attachment binding.
export const IMAGE_FIXTURE_PATHS = Object.freeze({ 'vlm-patch-source': '/lesson-assets/vlm-patch-source.jpg' });
export const IMAGE_FIXTURE_IDS = Object.freeze(Object.keys(IMAGE_FIXTURE_PATHS));

// Image space uses fractions of the whole raster, with (0, 0) at top left. Fitting the square image or crop at
// its own aspect ratio makes the existing SVG center-slice renderer show exactly those pixels in every panel.
export const IMAGE_SOURCE = String.raw`
(function () {
  const assets = ${JSON.stringify(IMAGE_FIXTURE_IDS)};
  const idPattern = /^[A-Za-z0-9_.:-]{1,64}$/;
  const segment = /^[A-Za-z0-9_-]{1,32}$/;
  const entire = { x: 0, y: 0, w: 1, h: 1 };

  function optionsFor(options, name = 'image') {
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error(name + ' needs an options object');
    return options;
  }

  function layout({ x, y, w, h }) {
    if (![w, h].every(value => Number.isFinite(value) && value > 0 && value <= 2000)
        || ![x, y].every(Number.isFinite) || [x, y, x + w, y + h].some(value => Math.abs(value) > 100000)
        || x + w <= x || y + h <= y) throw new Error('image needs a finite positive layout rectangle');
    return { x, y, w, h };
  }

  function region(value) {
    const { x, y, w, h } = value || {};
    if (![x, y, w, h].every(Number.isFinite) || x < 0 || y < 0 || w <= 0 || h <= 0
        || x + w > 1 || y + h > 1 || x + w <= x || y + h <= y) {
      throw new Error('image region must be a positive rectangle inside normalized image space');
    }
    return { x, y, w, h };
  }

  function imageFrame(id, options) {
    if (typeof id !== 'string' || !idPattern.test(id)) throw new Error('image needs a valid Frame id');
    const { asset, crop } = optionsFor(options);
    if (!assets.includes(asset)) throw new Error('image needs a supported local asset id');
    const panel = layout(options);
    const source = crop === undefined ? entire : region(crop);
    const aspect = source.w / source.h;
    const w = Math.min(panel.w, panel.h * aspect);
    const h = Math.min(panel.h, panel.w / aspect);
    const fitted = layout({ x: panel.x + (panel.w - w) / 2, y: panel.y + (panel.h - h) / 2, w, h });
    return { kind: 'image', id, asset, ...fitted, ...(crop === undefined ? {} : { crop: source }) };
  }

  function regionsFor(regions = [], selected) {
    if (!Array.isArray(regions) || regions.length > 8) throw new Error('image allows at most 8 regions');
    const byId = new Map();
    for (const value of regions) {
      const key = value?.id;
      if (typeof key !== 'string' || !segment.test(key) || byId.has(key)) throw new Error('image regions need unique short ids');
      byId.set(key, region(value));
    }
    if (selected != null && !byId.has(selected)) throw new Error('selected image region must exist');
    return byId;
  }

  function overview(image, regions, selected) {
    // Larger regions sit behind smaller ones so a broad target does not hide a nested target from a pointer.
    const ordered = [...regions].sort(([, a], [, b]) => b.w * b.h - a.w * a.h);
    return [image, ...ordered.map(([key, roi]) => {
      const target = image.id + '.' + key;
      if (!idPattern.test(target)) throw new Error('image region target id is too long');
      const { x, y, w, h } = layout({ x: image.x + roi.x * image.w, y: image.y + roi.y * image.h, w: roi.w * image.w, h: roi.h * image.h });
      const active = key === selected;
      return sdk.box(target, x, y, w, h, { role: active ? 'learner' : 'neutral', opacity: active ? 0.55 : 0.25 });
    })];
  }

  sdk.imageFrame = imageFrame;
  sdk.imageRegions = function (id, options) {
    const { asset, regions, selected, x, y, w, h } = optionsFor(options);
    return overview(imageFrame(id, { asset, x, y, w, h }), regionsFor(regions, selected), selected);
  };

  sdk.imageViews = function (id, options) {
    if (typeof id !== 'string' || !idPattern.test(id)) throw new Error('image views need a valid Frame id');
    const { asset, views, regions, selected } = optionsFor(options);
    if (!Array.isArray(views) || views.length < 1 || views.length > 4) throw new Error('image allows 1–4 views');
    const byId = regionsFor(regions, selected);
    const seen = new Set();
    return [...views].flatMap(view => {
      const { id: key, mode, x, y, w, h } = optionsFor(view, 'image view');
      if (typeof key !== 'string' || !segment.test(key) || seen.has(key)) throw new Error('image views need unique short ids');
      if (mode !== 'overview' && mode !== 'detail') throw new Error('image view mode must be overview or detail');
      seen.add(key);
      const image = imageFrame(id + '.' + key, { asset, x, y, w, h, crop: mode === 'detail' ? byId.get(selected) : undefined });
      return mode === 'detail' ? [image] : overview(image, byId, selected);
    });
  };
})();
`;
