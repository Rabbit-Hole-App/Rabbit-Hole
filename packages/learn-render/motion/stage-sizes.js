// The aspect ratios Motion renders and the output size of each (owner brief 2026-10-23). A leaf with no imports: the renderer
// image archives learn-render alone, and the control plane (motion-settings.js) imports this file, so the ratios the form offers
// are exactly the ratios with a size here and a ratio cannot be offered that the renderer would not produce.
export const MOTION_DEFAULT_RATIO = '16:9';
// Output size per ratio, in pixels (30 fps). 16:9 is the original 1920x1080 stage. Every size is whole, has the ratio's exact
// proportions, is no larger in area than 1920x1080, and gives whole even dimensions at the 0.45 preview scale (h264 yuv420p).
export const MOTION_STAGE_SIZES = Object.freeze({
  '9:16': Object.freeze({ width: 1080, height: 1920 }),
  '1:1': Object.freeze({ width: 1080, height: 1080 }),
  '16:9': Object.freeze({ width: 1920, height: 1080 }),
  '3:4': Object.freeze({ width: 1080, height: 1440 }),
  '4:3': Object.freeze({ width: 1440, height: 1080 }),
  '2:3': Object.freeze({ width: 1040, height: 1560 }),
  '3:2': Object.freeze({ width: 1560, height: 1040 }),
  '4:5': Object.freeze({ width: 1120, height: 1400 }),
  '5:4': Object.freeze({ width: 1400, height: 1120 }),
});
export const MOTION_RATIOS = Object.freeze(Object.keys(MOTION_STAGE_SIZES));
