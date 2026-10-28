// LOCAL-ONLY layout fixtures (fake people, fake quotes). Loaded only by reviews.js in a dev build with ?reviews-fixture
// in the URL; import.meta.env.DEV is false in production builds, so this file never ships.
const q = [
  'FIXTURE quote one. Short.',
  'FIXTURE quote two is a little longer so the cards differ in height and the masonry columns have something to balance across the grid.',
  'FIXTURE quote three. Medium length text to check the readable measure and line height inside a white card with a thin border.',
  'FIXTURE quote four is the longest of the set: it keeps going for a few more lines so the natural height variation is visible, with enough words to wrap four or five times at the narrowest desktop column width and still look right.',
  'FIXTURE five.',
  'FIXTURE quote six, about two lines of text in the card, no more.',
  'FIXTURE quote seven shows what Show more reveals after the first six cards.',
  'FIXTURE quote eight, also hidden at first, to check the reveal and the focus move.',
];
export const reviewFixtures = q.map((quote, i) => ({
  name: `Fixture Person ${i + 1}`, handle: `@fixture${i + 1}`, avatar: null, quote,
  url: `https://x.com/fixture${i + 1}/status/0`, source: 'x',
}));
