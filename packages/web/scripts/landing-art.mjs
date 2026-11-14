// Landing-page art pipeline: one command per kind of picture, with the model, size, prompt template and output path fixed
// (owner, 2026-11-13: never ask which image model). Only the subject changes.
//
//   node scripts/landing-art.mjs blog-hero <slug> "<subject sentences>" [--scene <name>] [--palette <name>] [--quality low|medium|high] [--from <png>]
//     --scene / --palette take a name from design/art/scenes.md / palettes.md (or free text); left out, the first one no earlier hero used is picked, so
//     every post gets a new background and colour scheme. The characters come from design/art/characters.md and the reference plate.
//     GPT Image 2.5 Flare, 2048x720, the Wonderland engraving of BLOG_IMAGE_GUIDE.md -> public/landing/blog/<slug>-hero.jpg
//   node scripts/landing-art.mjs blog-post <slug> "<subject sentences>" [same options]
//     blog-hero, then also lists a placeholder post first in src/landing/blog-posts.js. Card numbers follow publication order automatically.
//   node scripts/landing-art.mjs page-banner <name> "<page name>" "<subject>" [--palette "<text>"] [--from <image>]
//     Nano Banana 2.1, 4:1 2K, the warm print collage of design/examples-collage-prompt.md -> public/landing/<name>-v1.jpg (2800 wide)
//
// --from converts an image you already have (no model call). The key is read by name from small-deploy/.env, never printed.
// The prompt used is saved to design/art/<output name>.prompt.md. A generation costs a few cents (Flare low about $0.006).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV = 'C:/Users/cyudhist/Desktop/workspace/small-deploy/.env';
const flag = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const [kind, ...rest] = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !all[i - 1]?.startsWith('--'));
const secret = name => {
  const line = fs.readFileSync(ENV, 'utf8').split(/\r?\n/).map(l => l.match(new RegExp(`^\\s*${name}\\s*=\\s*(.*)$`))).find(Boolean);
  const value = line?.[1]?.trim().replace(/^["']|["']$/g, '');
  if (!value) throw Error(`${name} missing from small-deploy/.env`);
  return value;
};

// The saved character sheet (design/art/characters.md, owner 2026-11-13): pasted word for word into every blog hero prompt so the characters stay the same.
const sheet = () => {
  const text = fs.readFileSync(path.join(WEB, 'design/art/characters.md'), 'utf8');
  return text.slice(text.indexOf('## Sheet') + '## Sheet'.length).trim().split(/\r?\n/).join(' ');
};
const REF_NOTE = `The attached image is the reference plate of this illustration series. Draw a completely NEW scene, but draw the White Rabbit, Alice, the Mad Hatter, the Caterpillar and the Cheshire Cat exactly as they look in the reference plate: the same faces, hair, clothes, proportions, colours and engraved manner. Take ONLY the characters from the plate: its scenery, setting and scenery colours are not wanted. Draw the setting and the colours exactly as described below. Do not copy the reference plate's composition. `;
const BLOG_HEAD = `Hand-drawn illustration in the style of a 19th-century book engraving, in the spirit of Tenniel's 1865 illustrations for Alice's Adventures in Wonderland and not the Disney designs, loose cross-hatching, slightly faded as if printed decades ago. A full panoramic Wonderland scene that fills the whole canvas edge to edge with no empty margins. In the foreground, grouped tightly within the middle 50% of the width and all on one ground line: `;
// Scenes and palettes live in design/art/scenes.md and palettes.md. --scene / --palette take a saved name or free text; without them the first
// one no earlier hero used is picked (each hero's prompt record names them), so no two posts share a background or a colour scheme.
const listOf = file => {
  const text = fs.readFileSync(path.join(WEB, 'design/art', file), 'utf8').replace(/\r\n/g, '\n');
  const body = text.slice(text.search(/^## (Scenes|Palettes)$/m)).split('\n').slice(1);
  return Object.fromEntries(body.filter(l => /^[a-z-]+: /.test(l)).map(l => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 2)]));
};
const usedBy = (label, seed, skipSlug) => {
  const dir = path.join(WEB, 'design/art'), used = new Set([seed]);
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('-hero.prompt.md') || f === `${skipSlug}-hero.prompt.md`) continue;
    const m = fs.readFileSync(path.join(dir, f), 'utf8').match(new RegExp(`^${label}: (\S+)`, 'm'));
    if (m) used.add(m[1]);
  }
  return used;
};
const pick = (label, given, file, seed, skipSlug) => {
  const all = listOf(file);
  if (given) return all[given] ? [given, all[given]] : ['custom', given];
  const name = Object.keys(all).find(n => !usedBy(label, seed, skipSlug).has(n)) ?? Object.keys(all)[0];
  return [name, all[name]];
};
const blogTail = (scene, palette) => ` Behind them, a rich layered Wonderland setting receding into the distance, drawn in finer, lighter, fainter hatching so the foreground figures stand clearly forward: ${scene}. Draw only the characters named above. The blog cards crop about 20% off each side of this strip, so every named character, including the Cheshire Cat and everything it sits on, must stand completely inside the middle 50% of the width (nothing of a character in the outer quarter on either side); the outer quarters hold scenery only. Hand-coloured in soft, muted, washed-out watercolour tints laid over the ink line work, like a faded vintage hand-tinted book plate: ${palette}; the characters keep exactly the colours of their sheet; no pink or red cast anywhere in the scenery, and the only red-pink in the whole picture is the White Rabbit's dusty-rose jacket; off-white paper #F4F3EF and deep plum ink #3D2A5C for the line work. Low saturation, low contrast, matte, subtle paper grain, no pure black and no pure white anywhere. No text, no lettering, no numbers anywhere. A very wide panoramic strip, about 2.85 times wider than tall (16:5.6): compose every named figure and the whole scene inside this wide low frame, with nothing cropped.`;
const AMBER = 'pale warm amber-gold paper ground around #f0cf85, saturated amber #e8962a plates, one or two burnt-orange #d9531e strips, deep brown-black ink, small cream and soft ochre blocks. Grayscale technical drawings partly cross the colour blocks. No blue, no green, no pink.';
const bannerPrompt = (page, subject, palette) => `Use case: stylized-concept. Asset type: original panoramic header artwork for the ${page} page of Rabbit Hole, an adaptive learning platform. Return the artwork alone.
Create one very wide abstract technical print collage in the language of an old scanned engineering journal mixed with experimental risograph publishing: thin irregular black ink, rough halftone, broken little numerals, overlapping translucent colour plates, stark oversized crops, flat economical shapes, visible paper grain.
Subject: ${subject} Decorative fragments in an intriguing composition, not a literal infographic.
Palette (warm, NO pink, NO magenta, NO red-pink): ${palette}
Composition: panoramic, asymmetrical, sophisticated. Detail clusters on the right 45% of the image, richest at the upper right, with a cropped curved plate and a vertical strip touching the far right edge, and a few small ink fragments at the far left edge. The centre-left from 8% to 58% width and 15% to 95% height is almost entirely unprinted pale paper with fine grain, left quiet for a big dark two-word HTML heading. Fragments may crop off the image edges. No outer border.
Constraints: original artwork only. No words, no headings, no slogans, no logos, no brand, no mascot or rabbit, no people, no buttons, no web interface, no watermark, no 3D gloss, no smooth digital gradients. Only tiny decorative numerals and figure notation. Must remain visibly a print collage, not a plain texture.`;

// ref: the series reference plate (design/art/characters-reference.jpg, the first hero). With it the call is an image edit, so the model sees the
// characters instead of only reading about them (owner 2026-11-13: replicate the first blog's characters).
async function generateFlare(prompt, quality, ref) {
  const key = secret('OPENAI_API_KEY'), fields = { model: 'gpt-image-2.5-flare', prompt, n: 1, size: '2048x720', quality, output_format: 'png' };
  let init;
  if (ref) {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.set(k, String(v));
    form.append('image[]', new Blob([fs.readFileSync(ref)], { type: 'image/jpeg' }), 'reference.jpg');
    init = { headers: { Authorization: `Bearer ${key}` }, body: form };
  } else init = { headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(fields) };
  const res = await fetch(`https://api.openai.com/v1/images/${ref ? 'edits' : 'generations'}`, { method: 'POST', ...init });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.data?.[0]?.b64_json) throw Error(`OpenAI image failed: HTTP ${res.status} ${JSON.stringify(body?.error?.message || '').slice(0, 200)}`);
  return Buffer.from(body.data[0].b64_json, 'base64');
}
async function generateBanana(prompt) {
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST', headers: { 'x-goog-api-key': secret('GEMINI_API_KEY'), 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gemini-nano-banana-2.1', input: [{ type: 'text', text: prompt }], store: false, response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: '4:1', image_size: '2K' } }),
  });
  const body = await res.json().catch(() => null);
  const block = (body?.steps || []).filter(s => s.type === 'model_output').flatMap(s => s.content || []).filter(p => p.type === 'image').at(-1);
  if (!res.ok || !block?.data) throw Error(`Gemini image failed: HTTP ${res.status} ${JSON.stringify(body?.error?.message || '').slice(0, 200)}`);
  return Buffer.from(block.data, 'base64');
}
function toJpeg(bytes, dest, width) {
  const tmp = `${dest}.src`;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(tmp, bytes);
  const py = `from PIL import Image\nim=Image.open(r'${tmp}').convert('RGB')\nw=${width || 0}\nif w and im.width>w: im=im.resize((w,round(im.height*w/im.width)),Image.LANCZOS)\nim.save(r'${dest}','JPEG',quality=90,optimize=True)\nprint(im.size)`;
  const r = spawnSync('python', ['-c', py], { encoding: 'utf8' });
  if (r.status !== 0) throw Error(`JPEG conversion failed (the generated image is kept at ${tmp}, rerun with --from): ${r.stderr}`);
  fs.rmSync(tmp, { force: true });
  return r.stdout.trim();
}
function record(name, model, prompt, extra = '') {
  const file = path.join(WEB, 'design/art', `${name}.prompt.md`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `# ${name}\n\nGenerated ${new Date().toISOString().slice(0, 10)} with ${model} by scripts/landing-art.mjs.\n\n## Prompt\n\n${prompt}\n`);
}

// blog-post also lists a PLACEHOLDER post first in blog-posts.js (the owner writes the real text there). The card number is computed
// from the post's place in publication order, so nothing else changes.
function addPost(slug) {
  const file = path.join(WEB, 'src/landing/blog-posts.js');
  const raw = fs.readFileSync(file, 'utf8'), crlf = raw.includes('\r\n'), src = raw.replace(/\r\n/g, '\n');
  if (src.includes(`slug:'${slug}'`)) { console.log('post already listed:', slug); return; }
  const now = new Date(), iso = now.toISOString().slice(0, 10);
  const label = `${now.getUTCDate()} ${now.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })} ${now.getUTCFullYear()}`;
  const entry = [
    '  {',
    '    // PLACEHOLDER post (added by scripts/landing-art.mjs): the owner writes the real title, excerpt, category, author, read time and body.',
    `    slug:'${slug}',category:'Placeholder category',tag:'Placeholder',author:'Placeholder author',readTime:'1 min read',`,
    `    date:'${iso}',dateLabel:'${label}',`,
    "    title:'Placeholder title',",
    "    excerpt:'Placeholder excerpt.',",
    `    mark:'Placeholder.',motif:'${slug}',`,
    "    hero:'Placeholder alt text describing the hero image.',",
    '    body:`<p>Placeholder paragraph.</p>`',
    '  },',
  ].join('\n');
  const marker = 'export const stories=[\n';
  const out = src.replace(marker, marker + entry + '\n');
  fs.writeFileSync(file, crlf ? out.replace(/\n/g, '\r\n') : out);
  console.log('listed placeholder post first in blog-posts.js:', slug);
}

const from = flag('from');
if (kind === 'blog-hero' || kind === 'blog-post') {
  const [slug, subject] = rest;
  if (!slug || (!subject && !from)) throw Error('usage: blog-hero|blog-post <slug> "<subject sentences>" [--quality low] [--from <png>]');
  const dest = path.join(WEB, 'public/landing/blog', `${slug}-hero.jpg`);
  let bytes;
  if (from) bytes = fs.readFileSync(from);
  else {
    const ref = process.argv.includes('--no-ref') ? null : path.join(WEB, 'design/art/characters-reference.jpg');
    const [sceneName, scene] = pick('Scene', flag('scene'), 'scenes.md', 'garden', slug), [paletteName, palette] = pick('Palette', flag('palette'), 'palettes.md', 'rose', slug);
    const prompt = (ref ? REF_NOTE : '') + BLOG_HEAD + subject + ' Character designs, identical in every illustration of this series, so draw each one exactly like this: ' + sheet() + blogTail(scene, palette);
    bytes = await generateFlare(prompt, flag('quality', 'low'), ref);
    record(`${slug}-hero`, 'GPT Image 2.5 Flare (gpt-image-2.5-flare, 2048x720)', prompt, `Scene: ${sceneName}\nPalette: ${paletteName}\n\n`);
    console.log('scene', sceneName, '| palette', paletteName);
  }
  console.log('saved', dest, toJpeg(bytes, dest));
  if (kind === 'blog-post') addPost(slug);
} else if (kind === 'page-banner') {
  const [name, page, subject] = rest;
  if (!name || (!from && (!page || !subject))) throw Error('usage: page-banner <name> "<page name>" "<subject>" [--palette "<text>"] [--from <image>]');
  const dest = path.join(WEB, 'public/landing', `${name}-v1.jpg`);
  let bytes;
  if (from) bytes = fs.readFileSync(from);
  else { const prompt = bannerPrompt(page, subject, flag('palette', AMBER)); bytes = await generateBanana(prompt); record(`${name}-banner`, 'Nano Banana 2.1 (gemini-nano-banana-2.1, 4:1, 2K)', prompt); }
  console.log('saved', dest, toJpeg(bytes, dest, 2800));
} else throw Error('usage: landing-art.mjs blog-hero | page-banner (see the header of this file)');
