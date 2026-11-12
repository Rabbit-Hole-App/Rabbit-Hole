import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { DOMParser, parseHTML } from 'linkedom';
import { marked } from 'marked';

const outputRoot = fileURLToPath(new URL('../../../docs/features/explain-on-canvas/handoff/figure-briefs/', import.meta.url));
const product = 'ChatGPT-User';
const agent = product + ' (Rabbit Hole figure briefs)';
const d2lSections = {
  'linear-regression': ['linear-regression', 'generalization', 'weight-decay'],
  'linear-classification': ['softmax-regression', 'generalization-classification', 'environment-and-distribution-shift'],
  'multilayer-perceptrons': ['mlp', 'backprop', 'generalization-deep', 'dropout'],
  optimization: ['gd', 'sgd', 'minibatch-sgd', 'momentum', 'adam', 'lr-scheduler'],
  'convolutional-neural-networks': ['why-conv', 'conv-layer', 'padding-and-strides', 'channels', 'pooling', 'lenet'],
  'recurrent-neural-networks': ['sequence', 'rnn', 'bptt'],
  'attention-mechanisms-and-transformers': ['queries-keys-values', 'attention-pooling', 'attention-scoring-functions', 'bahdanau-attention', 'multihead-attention', 'self-attention-and-positional-encoding', 'transformer'],
};
const curriculum = [
  'what-is-machine-learning', 'linear-regression', 'logistic-regression', 'decision-trees',
  'support-vector-machines', 'knn-and-distances', 'unsupervised-learning', 'feature-engineering',
  'model-evaluation', 'bias-variance', 'ensemble-methods', 'hyperparameter-tuning',
  'ml-pipelines', 'naive-bayes', 'time-series', 'anomaly-detection', 'imbalanced-data',
  'feature-selection', 'ml-system-design', 'model-monitoring-and-drift', 'feature-stores-and-training-serving-skew',
];
const curriculumRevision = 'e7db050e64bde3be17a9381476f748da26d85692';
const slugify = text => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const ordinal = number => String(number).padStart(2, '0');
const run = promisify(execFile);

export function sourcePages() {
  return [
    ...['transformer', 'bert', 'gpt2', 'word2vec', 'stable-diffusion', 'retrieval-transformer'].map(topic => ({
      slug: 'illustrated-' + topic, group: 'alammar', url: 'https://jalammar.github.io/illustrated-' + topic + '/',
      selector: 'article.post .entry',
    })),
    ...Object.entries(d2lSections).flatMap(([chapter, sections]) => sections.map(section => ({
      slug: 'd2l-' + section, group: 'd2l', chapter,
      url: 'https://d2l.ai/chapter_' + chapter + '/' + section + '.html', selector: '[role="main"]',
    }))),
    {
      slug: 'llm-architecture-gallery', group: 'raschka',
      url: 'https://sebastianraschka.com/llm-architecture-gallery/', selector: 'article.post-content',
    },
    ...curriculum.map((name, index) => {
      const lesson = ordinal(index + 1);
      const slug = lesson + '-' + name;
      return {
        slug, group: 'phase02', lesson, markdown: true,
        url: 'https://raw.githubusercontent.com/rohitg00/ai-engineering-from-scratch/' + curriculumRevision +
          '/phases/02-ml-fundamentals/' + slug + '/docs/en.md',
      };
    }),
  ];
}

function publicUrl(input, base) {
  const url = new URL(input, base);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Expected a public HTTP URL');
  url.hash = '';
  return url;
}

function parseRobots(text) {
  const groups = [];
  let group;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split('#', 1)[0].trim();
    const match = line.match(/^(user-agent|allow|disallow|crawl-delay):\s*(.*)$/i);
    if (!match) continue;
    const directive = match[1].toLowerCase();
    const value = match[2].trim();
    if (directive === 'user-agent') {
      if (!group || group.hasRules) groups.push(group = { agents: [], rules: [], delay: 0 });
      if (value) group.agents.push(value.toLowerCase());
    } else if (group) {
      group.hasRules = true;
      if (directive === 'crawl-delay') {
        const seconds = Number(value);
        if (Number.isFinite(seconds) && seconds > 0) group.delay = Math.max(group.delay, seconds * 1000);
      } else if (value) {
        const anchored = value.endsWith('$');
        const path = comparablePath(anchored ? value.slice(0, -1) : value);
        const pattern = path.split('*').map(part => part.replace(/[.*+?^$\x7b\x7d()|[\]\\]/g, '\\$&')).join('.*');
        group.rules.push({
          allow: directive === 'allow', length: path.replaceAll('*', '').length,
          pattern: new RegExp('^' + pattern + (anchored ? '$' : '')),
        });
      }
    }
  }
  const scores = groups.map(group => Math.max(-1, ...group.agents.map(name =>
    name === '*' ? 0 : product.toLowerCase() === name ? name.length : -1)));
  const best = Math.max(-1, ...scores);
  const selected = best < 0 ? [] : groups.filter((_, index) => scores[index] === best);
  const rules = selected.flatMap(group => group.rules).sort((a, b) => b.length - a.length || Number(b.allow) - Number(a.allow));
  return {
    delay: Math.max(1000, ...selected.map(group => group.delay)),
    allows: url => rules.find(rule => rule.pattern.test(comparablePath(url.pathname + url.search)))?.allow ?? true,
  };
}

function comparablePath(path) {
  return path.replace(/[^\x00-\x7f]/gu, encodeURIComponent).replace(/%[\da-f]{2}/gi, value => {
    const character = String.fromCharCode(parseInt(value.slice(1), 16));
    return /[a-zA-Z0-9._~-]/.test(character) ? character : value.toUpperCase();
  });
}

function crawler({ fetch: get = globalThis.fetch, now = Date.now, sleep = delay } = {}) {
  const robots = new Map();
  const lastByOrigin = new Map();
  let lastRequest = -Infinity;
  async function request(start, checkRobots) {
    let url = start;
    for (let redirects = 0; redirects <= 5; redirects++) {
      if (/(?:^|\/)(?:sign-in|signin|login|log-in|auth|account-login)(?:[/.]|$)/i.test(url.pathname)) {
        throw Object.assign(new Error('Login wall'), { status: 'login-wall' });
      }
      const policy = checkRobots ? await rules(url.origin) : null;
      if (policy && !policy.allows(url)) throw Object.assign(new Error('Denied by robots.txt'), { status: 'robots-denied' });
      const wait = Math.max(lastRequest + 1000, (lastByOrigin.get(url.origin) ?? -Infinity) + (policy?.delay ?? 1000)) - now();
      if (wait > 0) await sleep(wait);
      lastRequest = now();
      lastByOrigin.set(url.origin, lastRequest);
      const response = await get(url.href, {
        headers: { 'User-Agent': agent }, redirect: 'manual', signal: AbortSignal.timeout(30_000),
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) return { response, url };
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new Error('Redirect without a location');
      url = publicUrl(location, url);
    }
    throw new Error('Too many redirects');
  }
  async function rules(origin) {
    if (!robots.has(origin)) robots.set(origin, (async () => {
      try {
        const { response } = await request(publicUrl(origin + '/robots.txt'), false);
        if ([404, 410].includes(response.status)) {
          await response.body?.cancel();
          return parseRobots('');
        }
        if (response.ok) {
          return parseRobots(await response.text());
        }
        await response.body?.cancel();
      } catch {
        // A failed policy lookup should never open access to the origin.
      }
      return { delay: 1000, allows: () => false };
    })());
    return robots.get(origin);
  }
  return url => request(url, true);
}

const headings = 'h1,h2,h3,h4,h5,h6';
const clean = text => (text ?? '').replace(/[\s\u00a0]+/g, ' ').trim();
const nodeText = node => clean(node?.textContent).replace(/\s*¶$/, '');
function headingText(node) {
  const heading = node?.cloneNode(true);
  heading?.querySelectorAll('.headerlink,.d2l-tabs').forEach(control => control.remove());
  return nodeText(heading);
}
export function pageFigures(source, contents, url) {
  const document = parseHTML(source.markdown ? '<main>' + marked.parse(contents) + '</main>' : contents).document;
  const signInTitle = /^(?:sign\s*in|log\s*in)(?:\b|$)/i.test(headingText(document.querySelector('main h1,article h1,h1,title')));
  if (signInTitle && document.querySelector('form input[type="password"]')) {
    throw Object.assign(new Error('Login wall'), { status: 'login-wall' });
  }
  const root = source.selector ? document.querySelector(source.selector) :
    document.querySelector('article,main,[role="main"]') ?? document;
  if (!root) throw new Error('Article selector did not match');
  const all = [...root.querySelectorAll(headings + ',p,img,image[src]')];
  const figures = [];
  let previous = '';
  const title = clean(document.querySelector('meta[property="og:title"]')?.getAttribute('content')) ||
    headingText(root.querySelector('h1')) || headingText(document.querySelector('article h1,main h1,title'));
  let heading = title;
  let waiting = [];
  for (const node of all) {
    if (node.closest('nav,footer,noscript,template,.llm-architecture-zoom__body')) continue;
    if (node.matches(headings)) heading = headingText(node);
    if (node.matches('p') && !node.querySelector('img,image[src]') && !node.matches('.caption')) {
      previous = nodeText(node);
      for (const figure of waiting) figure.context.after = previous;
      waiting = [];
    }
    if (!node.matches('img,image[src]')) continue;
    const src = clean(node.getAttribute('data-src') || node.getAttribute('src'));
    if (!src || /^(?:data|blob):/i.test(src)) continue;
    const figureUrl = publicUrl(src, url);
    if (source.slug === 'illustrated-transformer' && !figureUrl.pathname.startsWith('/images/t/')) continue;
    const frame = node.closest('figure,.figure');
    const imageWrapper = source.group === 'alammar' ? node.closest('.img-div,.img-div-any-width,.img-div-any-size') : null;
    const caption = nodeText(frame?.querySelector('figcaption,.caption')) ||
      (imageWrapper?.querySelectorAll('img,image[src]').length === 1 ? nodeText(imageWrapper) : '');
    const card = node.closest('article.llm-architecture-overview__card');
    const figure = {
      order: figures.length + 1, figureUrl: figureUrl.href, context: {
        alt: clean(node.getAttribute('alt')), caption,
        heading: headingText(card?.querySelector(headings)) || heading, before: previous, after: '', svgText: [],
      },
    };
    figures.push(figure);
    waiting.push(figure);
  }
  return { title, figures };
}

const imageTypes = {
  'image/png': '.png', 'image/gif': '.gif', 'image/jpeg': '.jpg',
  'image/webp': '.webp', 'image/svg+xml': '.svg', 'image/avif': '.avif',
};
function svgText(svg) {
  const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const labels = [...document.querySelectorAll('text,title,desc')].map(nodeText);
  // Matplotlib commonly converts lettering to paths and records the labels in comments.
  const pathLabels = [...svg.matchAll(/<!--([\s\S]*?)-->\s*(?:<g[\s>]|$)/g)].map(match => clean(match[1]));
  return [...new Set([...labels, ...pathLabels].filter(Boolean))];
}
async function firstGifFrame(input, output) {
  try {
    await run('magick', [input + '[0]', output], { timeout: 30_000 });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await run('convert', [input + '[0]', output], { timeout: 30_000 });
  }
}
async function json(path, value) {
  await writeFile(path + '.tmp', JSON.stringify(value, null, 2) + '\n');
  await rename(path + '.tmp', path);
}

export async function scrapeSources(sources, output = outputRoot, options = {}) {
  const get = crawler(options);
  const firstFrame = options.firstFrame ?? firstGifFrame;
  const inventory = [];
  const cache = new Map();
  const temp = await mkdtemp(join(tmpdir(), 'rh-figure-briefs-'));
  try {
    for (const source of sources) {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(source.slug)) throw new Error('Invalid source slug: ' + source.slug);
      const folder = join(output, source.slug);
      const working = join(folder, '_working');
      await mkdir(working, { recursive: true });
      const page = { sourceUrl: source.url, group: source.group, lesson: source.lesson, retrievedAt: new Date().toISOString(), figures: [] };
      try {
        const { response, url } = await get(publicUrl(source.url));
        if (!response.ok) {
          await response.body?.cancel();
          throw new Error('Page HTTP ' + response.status);
        }
        Object.assign(page, pageFigures(source, await response.text(), url), { status: 'retrieved' });
      } catch (error) {
        Object.assign(page, { status: error.status ?? 'page-error', error: error.message });
      }
      for (const figure of page.figures) {
        try {
          let asset = cache.get(figure.figureUrl);
          if (!asset) {
            const { response, url } = await get(publicUrl(figure.figureUrl));
            const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
            const extension = imageTypes[type];
            if (!response.ok || !extension) {
              await response.body?.cancel();
              throw new Error(response.ok ? 'Response is not a supported image' : 'Image HTTP ' + response.status);
            }
            const bytes = Buffer.from(await response.arrayBuffer());
            const path = join(temp, String(cache.size) + extension);
            await writeFile(path, bytes);
            const gif = extension === '.gif';
            const file = gif ? path + '.png' : path;
            if (gif) await firstFrame(path, file);
            asset = { file, extension: gif ? '.png' : extension, sourceFormat: extension.slice(1),
              resolvedUrl: url.href, firstFrame: gif, svgText: extension === '.svg' ? svgText(bytes.toString('utf8')) : [] };
            cache.set(figure.figureUrl, asset);
          }
          const name = basename(new URL(figure.figureUrl).pathname);
          const stem = slugify(name.slice(0, name.length - extname(name).length)).slice(0, 100) || 'figure';
          const file = ordinal(figure.order) + '-' + stem + asset.extension;
          await copyFile(asset.file, join(folder, file));
          Object.assign(figure, {
            file, status: 'downloaded', sourceFormat: asset.sourceFormat,
            firstFrame: asset.firstFrame, resolvedUrl: asset.resolvedUrl,
          });
          figure.context.svgText = asset.svgText;
        } catch (error) {
          Object.assign(figure, { status: error.status ?? 'image-error', error: error.message });
        }
      }
      await json(join(working, 'manifest.json'), page);
      const { title, figures, ...fields } = page;
      const index = { ...fields, figures: figures.map(({ context, ...figure }) => figure) };
      await json(join(folder, 'manifest.json'), index);
      inventory.push({ slug: source.slug, ...index });
      options.onSource?.(source.slug, page);
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
  return inventory;
}

// D2L's published SVGs often outline all glyphs. Read embedded labels first,
// then OCR a temporary PNG without changing the downloaded SVG.
async function extractSvgLabels(sources, output) {
  await run('inkscape', ['--version']);
  await run('tesseract', ['--version']);
  const temp = await mkdtemp(join(tmpdir(), 'rh-svg-labels-'));
  const cached = new Map();
  const png = join(temp, 'figure.png');
  try {
    for (const source of sources) {
      const folder = join(output, source.slug);
      const manifest = join(folder, '_working', 'manifest.json');
      const page = JSON.parse(await readFile(manifest, 'utf8'));
      for (const figure of page.figures) {
        if (figure.sourceFormat !== 'svg' || !figure.file) continue;
        const file = join(folder, basename(figure.file));
        const bytes = await readFile(file);
        const hash = createHash('sha256').update(bytes).digest('hex');
        let extracted = cached.get(hash);
        if (!extracted) {
          const embedded = svgText(bytes.toString('utf8'));
          if (embedded.length) {
            extracted = { svgText: embedded, svgTextMethod: 'embedded' };
          } else {
            try {
              await run('inkscape', [file, '--export-width=1200', '--export-background=white',
                '--export-background-opacity=1', '--export-filename=' + png], { timeout: 25_000 });
              const { stdout } = await run('tesseract', [png, 'stdout', '--psm', '11', '-l', 'eng'], {
                timeout: 25_000, env: { ...process.env, OMP_THREAD_LIMIT: '1' },
              });
              extracted = { svgText: stdout.split(/\r?\n/).map(clean).filter(Boolean), svgTextMethod: 'ocr' };
            } catch (error) {
              extracted = { svgText: [], svgTextMethod: 'unavailable' };
              console.warn(source.slug + '/' + figure.order + ': OCR failed: ' + (error.code ?? 'conversion error'));
            }
          }
          cached.set(hash, extracted);
        }
        Object.assign(figure.context, extracted);
      }
      await json(manifest, page);
      const labels = page.figures.filter(figure => figure.context.svgText?.length).length;
      console.log(source.slug + ': ' + labels + ' figures with extracted SVG text');
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

export function selectSources(inputs) {
  const defaults = sourcePages();
  const sources = inputs.length ? inputs.flatMap(input => {
    const match = defaults.filter(source => source.group === input || source.slug === input);
    if (match.length) return match;
    const url = publicUrl(input);
    const configured = defaults.find(source => source.url.replace(/\/$/, '') === url.href.replace(/\/$/, ''));
    return [configured ?? { slug: slugify(url.hostname + url.pathname), url: url.href }];
  }) : defaults;
  return [...new Map(sources.map(source => [source.slug, source])).values()];
}

async function main(args) {
  const labelsOnly = args[0] === '--extract-svg-text';
  const unique = selectSources(labelsOnly ? args.slice(1) : args);
  if (labelsOnly) return extractSvgLabels(unique, outputRoot);
  const inventory = await scrapeSources(unique, outputRoot, {
    onSource: (slug, page) => console.log(slug + ': ' + page.figures.filter(f => f.status === 'downloaded').length +
      '/' + page.figures.length + ' downloaded (' + page.status + ')'),
  });
  if (inventory.some(page => page.status !== 'retrieved' || page.figures.some(figure => figure.status !== 'downloaded'))) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv.slice(2));
