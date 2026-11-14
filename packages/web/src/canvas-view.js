// Which boxes "Fit canvas" (Shift+1) frames (CV-7). A board with cards frames its cards (and their group frames): a text item, note or mark parked far from them (a stray
// text item at the top-left of a board whose cards were laid out thousands of pixels away) must not stretch the fit until the cards are a speck. A board with no card at all
// frames everything it has (a board of only stickies has to fit), as before.
export const fitBoxes = (blockBoxes, groupBoxes, otherBoxes) => (blockBoxes.length ? [...blockBoxes, ...groupBoxes] : [...groupBoxes, ...otherBoxes]);
