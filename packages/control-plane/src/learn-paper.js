// PDFs a learner uploads onto a Learn canvas. They ride the same paper pipeline
// arXiv papers do - the reader, the page number, the region picker - so the only
// thing that differs is where the bytes come from: R2 here, a public URL there.
//
// ponytail: no lifecycle sweep. An object outlives the block that points at it,
// exactly like the chat uploads at index.js. Add one when storage is measured.
import { sha256, randomHex, base64 } from './token.js';
import { learnMedia } from './learn-storage.js';

// Small on purpose. The whole file is base64'd into every turn that asks about
// it, inside a 128 MB isolate, so this ceiling is about the ask path, not R2.
export const PAPER_UPLOAD_LIMIT = 5 * 1024 * 1024;
// Anthropic reads at most 100 pages, and index.js caps paper_context.page there.
export const PAPER_PAGE_LIMIT = 100;

const UPLOAD = /^upload:[0-9a-f]{12}$/;

export function uploadedPaperId(value) {
  if (typeof value !== 'string' || !UPLOAD.test(value)) throw new Error('Not an uploaded paper id');
  return value;
}

export const isUploadedPaperId = value => typeof value === 'string' && UPLOAD.test(value);

export const newUploadedPaperId = () => `upload:${randomHex(6)}`;

// Derived from the session, never from the request: the caller supplies an id,
// not a key, so one learner cannot name their way into another's upload.
export async function paperObjectKey(identity, id) {
  const digest = await sha256(JSON.stringify([identity.org, identity.name, identity.email]));
  return `learn-papers/${digest}/${uploadedPaperId(id)}`;
}

// The filename is the only label an upload has, and it travels into a response
// header and into the model's context, so it is bounded and stripped of the
// control characters that would break either.
export function uploadedPaperTitle(name) {
  const clean = String(name ?? '').replace(/\p{Cc}/gu, ' ').trim();
  return clean ? clean.slice(0, 200) : 'Uploaded PDF';
}

export async function putUploadedPaper(env, identity, file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!bytes.length) throw new Error('That file is empty');
  if (bytes.length > PAPER_UPLOAD_LIMIT) throw new Error(`That PDF is larger than ${PAPER_UPLOAD_LIMIT / (1024 * 1024)} MB`);
  // Trust the bytes, not the extension or the declared type.
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') throw new Error('That file is not a PDF');
  const id = newUploadedPaperId();
  const title = uploadedPaperTitle(file.name);
  await learnMedia(env).put(await paperObjectKey(identity, id), bytes, {
    httpMetadata: { contentType: 'application/pdf' },
    customMetadata: { title },
  });
  return { id, title };
}

export async function readUploadedPaper(env, identity, id) {
  const object = await learnMedia(env).get(await paperObjectKey(identity, id));
  if (!object) throw new Error('That PDF is no longer stored');
  return { bytes: new Uint8Array(await object.arrayBuffer()), title: uploadedPaperTitle(object.customMetadata?.title) };
}

// The shape readArxivPaper returns, so the ask path can treat both the same.
// The bytes go on `document` only - never on anything pushed into research.papers,
// which is serialised back to the browser.
export async function uploadedPaperAsDocument(env, identity, id) {
  const { bytes, title } = await readUploadedPaper(env, identity, id);
  return {
    id,
    title,
    pdfUrl: null,
    document: { type: 'document', title, source: { type: 'base64', media_type: 'application/pdf', data: base64(bytes) } },
  };
}

// One derivation, used by the route that stores an upload and by the ask path
// that reads it. If these two ever disagreed the object would simply 404.
// `email` is the session user's, set on every app response by index.js.
export const paperIdentity = app => ({ org: app?.org, name: app?.name, email: app?.email });
