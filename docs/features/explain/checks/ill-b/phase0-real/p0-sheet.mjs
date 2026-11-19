// 2x2 sheet of the four Phase 0 images (F, F2 top; S, V bottom), 512 px each, with the arm name written as a caption bar
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('C:/s/r162-int/package.json');
const sharp = require('sharp');
const D = 'C:/s/ill-b/run/originals/';
const items = [['F', 'F-P01-N-d1.webp', 'recraftv4_1_flash (F)'], ['F2', 'F2-P01-N-d1.webp', 'recraftv4_1_flash_v2 (F2)'], ['S', 'S-P01-N-d1.webp', 'recraftv4_1 (S)'], ['V', 'V-P01-N-d1.svg', 'recraftv4_1_vector (V)']];
const W = 512, BAR = 34;
const tiles = [];
for (const [arm, f, label] of items) {
  const img = await sharp(D + f, f.endsWith('.svg') ? { density: 96 } : {}).resize(W, W, { fit: 'contain', background: '#ffffff' }).png().toBuffer();
  const bar = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${BAR}"><rect width="${W}" height="${BAR}" fill="#222"/><text x="10" y="23" font-family="Arial" font-size="17" fill="#fff">${label}</text></svg>`);
  tiles.push(await sharp({ create: { width: W, height: W + BAR, channels: 3, background: '#ffffff' } }).composite([{ input: bar, top: 0, left: 0 }, { input: img, top: BAR, left: 0 }]).png().toBuffer());
}
const out = await sharp({ create: { width: W * 2, height: (W + BAR) * 2, channels: 3, background: '#ffffff' } }).composite(tiles.map((b, i) => ({ input: b, left: (i % 2) * W, top: Math.floor(i / 2) * (W + BAR) }))).png().toBuffer();
fs.writeFileSync('C:/s/ill-b/run/phase0-sheet.png', out);
console.log('sheet written', out.length);
