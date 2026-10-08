import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Owner, 2026-10-08: "the icon in the chrome browser seems to be small", then "the logo in the chrome tab should have
// rounded corners". The tab uses favicon v3: v1's aperture, centred and 1.2x larger (its rings' box was 175x153 of the
// 240 tile, centred 8.6 right and 13.6 up), on a tile rounded to a quarter of its side. A new name each time, so no
// cached icon lingers; the landing pages keep v1.
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('the Rabbit Hole tab shows favicon v3, svg and 32px png', () => {
  const main = read('./main.jsx');
  assert.match(main, /<link rel="icon" type="image\/svg\+xml" href="\/landing\/favicon-v3\.svg"><link rel="icon" type="image\/png" sizes="32x32" href="\/landing\/favicon-32-v3\.png">/);
  assert.doesNotMatch(main, /favicon(-32)?-v[12]/);
});

test('favicon v3 is v1\'s mark, recentred and enlarged, on a rounded tile', () => {
  const v1 = read('../public/landing/favicon-v1.svg'), v3 = read('../public/landing/favicon-v3.svg');
  const rings = (svg) => svg.match(/<ellipse [^>]+\/>/g);
  assert.deepEqual(rings(v3), rings(v1), 'the same six rings');
  // rx 60 of 240: about 4 px at a 16 px tab, so the corners read as rounded, not square.
  assert.match(v3, /<rect width="240" height="240" rx="60" fill="#000"\/>/);
  assert.match(v3, /transform="translate\(120 120\) scale\(1\.2\) translate\(-128\.6 -106\.4\) rotate\(-28 120 120\)"/);
  // The rings' box after the transform: centred, and inside the tile with a margin.
  const [w, h, s] = [175, 152.8, 1.2];
  assert.ok(w * s <= 240 - 2 * 12 && h * s <= 240 - 2 * 12, 'a 12-unit margin at least');
  assert.ok(w * s / 240 >= 0.85, 'fills at least 85% of the tile width');
  const png = readFileSync(new URL('../public/landing/favicon-32-v3.png', import.meta.url));
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [32, 32]);
  assert.equal(png[25], 6, 'RGBA, so the rounded corners are transparent');
});
