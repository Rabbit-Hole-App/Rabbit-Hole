import { sign, verify, sha256 } from './token.js';

export async function sealPreview(state, access, secret) {
  if (!secret) throw new Error('Figure preview review is not configured');
  const token = await sign({ purpose: 'learn-figure-review', app: state.input.app, email: access.email, org: access.org, hash: await sha256(JSON.stringify(state)), exp: Math.floor(Date.now() / 1000) + 600 }, secret);
  return { state, token };
}

export async function openPreview(continuation, access, app, secret) {
  if (!secret || !continuation?.state || typeof continuation.token !== 'string') throw new Error('Missing figure review continuation');
  const claim = await verify(continuation.token, secret);
  if (!claim || claim.purpose !== 'learn-figure-review' || claim.email !== access.email || claim.org !== access.org || claim.app !== app || claim.hash !== await sha256(JSON.stringify(continuation.state))) throw new Error('Figure review expired or does not belong to this request');
  return continuation.state;
}

export function previewImages(previews, plan) {
  const indices = plan.blocks.flatMap((b, i) => b.kind === 'paper_figure' ? [i] : []);
  if (!Array.isArray(previews) || previews.length !== indices.length) throw new Error('Each paper figure needs its rendered preview');
  return indices.flatMap(index => {
    const preview = previews.find(p => p.blockIndex === index);
    const match = preview?.src?.match(/^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/);
    if (!match || match[1].length > 2000000) throw new Error(`Figure preview ${index} must be a PNG under 1.5 MB`);
    const bytes = Uint8Array.from(atob(match[1]), c => c.charCodeAt(0));
    if (bytes.length < 24 || ![137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)) throw new Error('Invalid PNG preview');
    const view = new DataView(bytes.buffer), width = view.getUint32(16), height = view.getUint32(20);
    if (!width || !height || width * height > 4000000) throw new Error('Figure preview exceeds pixel limit');
    return [{ type: 'text', text: `Rendered crop for block ${index}: ${JSON.stringify(plan.blocks[index].citation)}. Inspect these pixels for clipping and completeness; compare with the original PDF.` }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: match[1] } }];
  });
}

export function paperSelectionImage(selection) {
  const r = selection?.region;
  if (!r || ['x', 'y', 'w', 'h'].some(k => !Number.isFinite(r[k]) || r[k] < 0 || r[k] > 1) || !r.w || !r.h || r.x + r.w > 1.000001 || r.y + r.h > 1.000001) throw new Error('Invalid paper selection bounds');
  return previewImages([{ blockIndex: 0, src: selection.preview }], { blocks: [{ kind: 'paper_figure', citation: 'Selected paper region' }] })[1];
}
