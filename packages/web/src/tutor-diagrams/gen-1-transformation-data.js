const thumbnailSizes = [
  { label: 'Dock', width: 240, height: 180 },
  { label: 'Fern', width: 160, height: 240 },
  { label: 'Kite', width: 200, height: 200 },
];

const sideMargin = 10;
const verticalMargin = 5;
const widthTrimmed = 2 * sideMargin;
const heightTrimmed = 2 * verticalMargin;

const photos = thumbnailSizes.map(({ label, width, height }) => {
  const cropped = { width: width - widthTrimmed, height: height - heightTrimmed };
  const pixelsKept = cropped.width * cropped.height;
  return {
    label,
    original: { width, height },
    cropped,
    pixelsKept,
    pixelsRemoved: width * height - pixelsKept,
  };
});

export const thumbnailCrop = { sideMargin, verticalMargin, widthTrimmed, heightTrimmed, photos };
