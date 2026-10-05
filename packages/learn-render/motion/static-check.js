// §8.2 static validation of Author composition source, before any render. It narrows what
// generated code can do; the render sandbox (§10) stays the security boundary.
// Contract for the source: one module; `export const stage = {width, height, fps,
// durationInFrames}` as number literals; `export default` the component; imports only from
// IMPORTS; every visible state derived from the frame.
import { parse } from '@babel/parser';
import { STAGE } from './contracts.js';

export const SOURCE_MAX_BYTES = 64 * 1024;

// The M1 approved import allowlist: module -> importable names. Remotion's network and
// side-effect exports (Img, IFrame, Audio, Video, OffthreadVideo, staticFile, prefetch,
// delayRender, continueRender) are deliberately absent; React state and effects too.
// Not approved in M1: learn-render's lecture primitives (Code uses unbundled system
// monospace fonts) and rough.js (unseeded shapes fall back to Math.random).
export const IMPORTS = {
  react: ['default', 'Fragment', 'useMemo', 'useRef', 'useLayoutEffect'],
  remotion: ['AbsoluteFill', 'Sequence', 'Series', 'Freeze', 'Loop', 'Easing', 'interpolate', 'interpolateColors', 'spring', 'measureSpring', 'random', 'useCurrentFrame', 'useVideoConfig'],
};
// Families the render stage loads from the package's own woff2 files (assets/fonts).
export const FONT_FAMILIES = ['Inter', 'Virgil', 'JetBrains Mono'];

const BANNED = new Set([
  // network
  'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'navigator', 'Image', 'RTCPeerConnection', 'Worker', 'SharedWorker', 'importScripts', 'caches',
  // wall clock, timers, nondeterminism
  'Date', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'setInterval', 'setImmediate', 'queueMicrotask', 'crypto', 'Intl',
  // storage
  'localStorage', 'sessionStorage', 'indexedDB',
  // escape hatches to any of the above
  'eval', 'Function', 'require', 'globalThis', 'window', 'document', 'WebAssembly',
  // the harness probe's channel (M5 judges its MOTION_PROBE lines): a composition never logs
  'console',
]);
// Window aliases that are also ordinary names (a prop called `top`): banned unless the module declares them.
// ponytail: module-wide, not per scope; a name declared in one function and used as the global in
// another slips through to the runtime CSP and sandbox. A scope analyser closes it if it matters.
const GLOBAL_ALIASES = new Set(['self', 'top', 'parent', 'frames', 'opener', 'open', 'location', 'process', 'global', 'module', 'exports']);
// Intrinsic elements that load a URL or animate on their own clock (SMIL).
const BANNED_ELEMENTS = new Set(['img', 'image', 'iframe', 'frame', 'script', 'link', 'style', 'video', 'audio', 'source', 'track', 'object', 'embed', 'portal', 'animate', 'animateTransform', 'animateMotion', 'animateColor', 'set', 'discard']);
const URL_ATTRS = new Set(['src', 'srcSet', 'href', 'xlinkHref', 'poster', 'action', 'formAction', 'data', 'background']);
const CSS_MOTION_KEY = /^(?:webkit|moz|ms|o)?(?:animation|transition)/i;
const CSS_MOTION_TEXT = /@keyframes|(?:^|[\s;{])(?:-[a-z]+-)?(?:animation|transition)(?:-[a-z-]+)?\s*:/i;
const URL_TEXT = /\b(?:https?|wss?|ftp|file):|url\(\s*['"]?(?!#)/i;

function walk(node, parent, visit) {
  visit(node, parent);
  for (const key in node) {
    if (key === 'loc' || key === 'extra' || key.endsWith('Comments')) continue;
    const v = node[key];
    if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') walk(c, node, visit); }
    else if (v && typeof v.type === 'string') walk(v, node, visit);
  }
}
// An Identifier that refers to a binding (not `a.b`'s b, not `{b: 1}`'s key).
const isReference = (n, p) => !(
  ((p.type === 'MemberExpression' || p.type === 'OptionalMemberExpression') && p.property === n && !p.computed) ||
  ((p.type === 'ObjectProperty' || p.type === 'ObjectMethod' || p.type === 'ClassMethod' || p.type === 'ClassProperty') && p.key === n && !p.computed));
const bindings = (p, out) => {
  if (!p) return out;
  if (p.type === 'Identifier') out.add(p.name);
  else if (p.type === 'ObjectPattern') p.properties.forEach(x => bindings(x.type === 'RestElement' ? x.argument : x.value, out));
  else if (p.type === 'ArrayPattern') p.elements.forEach(x => bindings(x, out));
  else if (p.type === 'AssignmentPattern') bindings(p.left, out);
  else if (p.type === 'RestElement') bindings(p.argument, out);
  return out;
};
const keyName = k => k?.type === 'Identifier' ? k.name : k?.type === 'StringLiteral' ? k.value : null;

// -> list of "line:col message" errors; [] = passes.
export function checkComposition(source, { durationSeconds }) {
  if (typeof source !== 'string' || !source.trim()) return ['source: empty'];
  const bytes = new TextEncoder().encode(source).length;
  if (bytes > SOURCE_MAX_BYTES) return [`source: ${bytes} bytes exceeds the ${SOURCE_MAX_BYTES}-byte cap`];
  let ast;
  try { ast = parse(source, { sourceType: 'module', plugins: ['jsx'] }); }
  catch (error) { return [`source does not parse: ${error.message}`]; }

  const errors = [];
  const at = (n, msg) => errors.push(`${n.loc?.start.line}:${(n.loc?.start.column ?? 0) + 1} ${msg}`);
  const local = new Map(); // local binding -> [module, imported name]
  const consts = new Map(); // top-level const NAME = 'string'
  let stage = null, hasDefault = false;

  for (const s of ast.program.body) {
    if (s.type === 'ImportDeclaration') {
      const allowed = IMPORTS[s.source.value];
      if (!allowed) { at(s, `import "${s.source.value}" is not on the allowlist (${Object.keys(IMPORTS).join(', ')})`); continue; }
      for (const sp of s.specifiers) {
        const name = sp.type === 'ImportDefaultSpecifier' ? 'default' : sp.type === 'ImportNamespaceSpecifier' ? '*' : keyName(sp.imported);
        if (!allowed.includes(name)) at(sp, `"${name}" from "${s.source.value}" is not approved (${allowed.join(', ')})`);
        local.set(sp.local.name, [s.source.value, name]);
      }
    } else if (s.type === 'ExportAllDeclaration' || (s.type === 'ExportNamedDeclaration' && s.source)) at(s, 're-exports are not allowed');
    else if (s.type === 'ExportDefaultDeclaration') hasDefault = true;
    const decl = s.type === 'ExportNamedDeclaration' ? s.declaration : s;
    if (decl?.type === 'VariableDeclaration' && decl.kind === 'const') for (const d of decl.declarations) {
      if (d.id.type !== 'Identifier') continue;
      if (d.init?.type === 'StringLiteral') consts.set(d.id.name, d.init.value);
      if (s.type === 'ExportNamedDeclaration' && d.id.name === 'stage') stage = d.init;
    }
  }

  // The stage the brief fixes: 1920x1080, 30 fps, exactly duration x 30 frames, as literals.
  const want = { ...STAGE, durationInFrames: durationSeconds * STAGE.fps };
  if (stage?.type !== 'ObjectExpression') errors.push(`stage: missing \`export const stage = {width: ${want.width}, height: ${want.height}, fps: ${want.fps}, durationInFrames: ${want.durationInFrames}}\``);
  else {
    const got = Object.fromEntries(stage.properties.map(p => [keyName(p.key), p.value?.type === 'NumericLiteral' ? p.value.value : NaN]));
    for (const [k, v] of Object.entries(want)) if (got[k] !== v) at(stage, `stage.${k} must be the literal ${v} (got ${Number.isNaN(got[k]) ? 'a non-literal' : got[k]})`);
    for (const k of Object.keys(got)) if (!(k in want)) at(stage, `stage.${k} is not part of the stage`);
  }
  if (!hasDefault) errors.push('export default: the composition component is required');

  const fontCheck = (n, v) => {
    const value = v?.type === 'StringLiteral' ? v.value : v?.type === 'Identifier' ? consts.get(v.name) : undefined;
    if (value === undefined) return at(n, 'fontFamily must be a string literal (or a top-level const string)');
    for (const f of value.split(',').map(x => x.trim().replace(/^['"]|['"]$/g, ''))) if (!FONT_FAMILIES.includes(f)) at(n, `font "${f}" is not bundled (${FONT_FAMILIES.join(', ')})`);
  };

  const declared = new Set();
  walk(ast.program, null, n => {
    if (n.type === 'VariableDeclarator') bindings(n.id, declared);
    if (/Function|ClassDeclaration/.test(n.type)) { bindings(n.id, declared); (n.params || []).forEach(x => bindings(x, declared)); }
    if (n.type === 'CatchClause') bindings(n.param, declared);
  });

  walk(ast.program, null, (n, p) => {
    switch (n.type) {
      case 'Import': case 'ImportExpression': return at(n, 'dynamic import() is not allowed');
      case 'MetaProperty': return at(n, `${n.meta.name}.${n.property.name} is not allowed`);
      case 'Identifier': {
        if (!p || !isReference(n, p)) return;
        if (BANNED.has(n.name) || (GLOBAL_ALIASES.has(n.name) && !declared.has(n.name))) return at(n, `"${n.name}" is not allowed in a composition`);
        const [mod, name] = local.get(n.name) || [];
        // React's default import reaches every hook: only allowlisted members, never the object itself.
        if (mod === 'react' && name === 'default' && p.type !== 'ImportDefaultSpecifier') {
          const member = (p.type === 'MemberExpression' && p.object === n && !p.computed) ? p.property.name : null;
          if (!member || ![...IMPORTS.react, 'createElement'].includes(member)) at(n, `React.${member ?? '<computed>'} is not approved`);
        }
        // remotion's random(null) is Math.random: a seed is required.
        if (mod === 'remotion' && name === 'random' && p.type === 'CallExpression' && p.callee === n) {
          const seed = p.arguments[0];
          if (!seed || seed.type === 'NullLiteral' || (seed.type === 'Identifier' && seed.name === 'undefined')) at(n, 'random() needs a seed: random(seed)');
        }
        return;
      }
      case 'MemberExpression': case 'OptionalMemberExpression': {
        const prop = n.computed ? (n.property.type === 'StringLiteral' ? n.property.value : null) : n.property.name;
        if (n.object.type === 'Identifier' && n.object.name === 'Math' && prop === 'random') return at(n, 'Math.random is not allowed: use random(seed) from remotion');
        if (prop && /^toLocale|^localeCompare$/.test(prop)) return at(n, `.${prop} depends on the host locale`);
        if (prop && ['constructor', '__proto__', 'prototype'].includes(prop)) return at(n, `.${prop} is not allowed`);
        return;
      }
      case 'ObjectProperty': {
        const k = n.computed ? null : keyName(n.key);
        if (k && CSS_MOTION_KEY.test(k)) return at(n, `CSS "${k}" is not allowed: drive motion from the frame`);
        if (k === 'font') return at(n, 'CSS "font" shorthand is not allowed: use fontFamily / fontSize / fontWeight');
        if (k === 'fontFamily') fontCheck(n, n.value);
        return;
      }
      case 'StringLiteral': case 'TemplateElement': {
        const text = n.type === 'StringLiteral' ? n.value : n.value.cooked ?? n.value.raw;
        if (p?.type === 'ImportDeclaration') return;
        if (CSS_MOTION_TEXT.test(text)) return at(n, 'CSS @keyframes / animation / transition is not allowed');
        if (URL_TEXT.test(text)) return at(n, 'URLs are not allowed: assets are resolved before the render');
        return;
      }
      case 'JSXOpeningElement': {
        if (n.name.type === 'JSXIdentifier' && (BANNED_ELEMENTS.has(n.name.name) || BANNED.has(n.name.name))) at(n, `<${n.name.name}> is not allowed`);
        return;
      }
      case 'JSXAttribute': {
        const name = n.name.type === 'JSXNamespacedName' ? `${n.name.namespace.name}:${n.name.name.name}` : n.name.name;
        if (name === 'dangerouslySetInnerHTML') return at(n, 'dangerouslySetInnerHTML is not allowed');
        if (name === 'fontFamily') return fontCheck(n, n.value?.type === 'JSXExpressionContainer' ? n.value.expression : n.value);
        if (URL_ATTRS.has(name) || name === 'xlink:href') {
          const v = n.value?.type === 'StringLiteral' ? n.value.value : null;
          if (v === null || !v.startsWith('#')) at(n, `${name} may only point inside the document ("#id")`);
        }
        return;
      }
    }
  });
  return errors;
}
