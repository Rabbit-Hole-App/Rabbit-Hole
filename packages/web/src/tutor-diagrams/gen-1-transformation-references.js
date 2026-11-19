import { thumbnailCrop } from './gen-1-transformation-data.js';

const { photos, sideMargin, verticalMargin, widthTrimmed, heightTrimmed } = thumbnailCrop;
const [dock] = photos;
const formatPixelCount = count => count.toLocaleString('en-US');

function sizeList(state) {
  return photos.map(photo => {
    const { width, height } = photo[state];
    return `${photo.label} ${width} by ${height}`;
  });
}

const before = { label: 'Original (px)', items: sizeList('original') };
const after = { label: 'Cropped (px)', items: sizeList('cropped') };

function transformation(title, operation, caption) {
  return { spec: { version: 1, diagram: { kind: 'transformation', title, before, after, operation, caption } } };
}

const depths = {
  overview: transformation(
    'Trim the edges of each thumbnail',
    `Cut ${sideMargin} px at left and right, ${verticalMargin} px at top and bottom`,
    'Read each thumbnail’s width before its height. Each photo keeps its own row.',
  ),
  standard: transformation(
    'Crop photos by fixed margins',
    `Remove ${widthTrimmed} px of width and ${heightTrimmed} px of height`,
    `The left and right cuts are ${sideMargin} px each. The top and bottom cuts are ${verticalMargin} px each.`,
  ),
  deep: transformation(
    'How cropping changes thumbnail size',
    `Subtract ${widthTrimmed} px from width and ${heightTrimmed} px from height`,
    `Dock keeps ${formatPixelCount(dock.pixelsKept)} pixels and loses ${formatPixelCount(dock.pixelsRemoved)}. The kept count is the cropped width times height.`,
  ),
};

export const references = [{
  id: 'pool-fixed-border-thumbnail-crop',
  lessons: [],
  prompts: ['How does trimming a fixed border change the pixel dimensions of my photo thumbnails?'],
  keywords: ['trimming a fixed border', 'fixed margins for photo thumbnails', 'crop thumbnails by a fixed border'],
  useWhen: 'Keep each photo on the same row as its cropped version and show how removing margins changes both dimensions.',
  ...depths.standard,
  depths,
}];
