export const id = 'status-line';
export const bindingTypes = Object.freeze({ text: 'Text', source: 'StateId' });

// TCP's status sentence is selected-state data. The optional position is trusted
// renderer context; otherwise only the approved protocol preset owns an anchor.
export function draw(ctx, sdk) {
  const fail = (path, message) => { const e = new Error(`status-line: ${message}`); e.code = 'part_binding'; e.path = path; throw e; };
  const status = ctx.state?.status;
  if (status === undefined) return [];
  if (!status || typeof status.id !== 'string' || !status.id || typeof status.text !== 'string' || !status.text || status.text.length > 200) fail('state.status', 'status must contain a bounded id and text');
  if (status.source !== ctx.state.id) fail('state.status.source', 'status source must be the selected state');
  const p = ctx.statusPosition ?? (ctx.composition?.canonical === 'protocol-between-parties' ? { x: 24, y: 249, w: 386, h: 27, textX: 217, textY: 267 } : null);
  if (!p || ['x', 'y', 'w', 'h', 'textX', 'textY'].some(key => !Number.isFinite(p[key])) || p.w <= 0 || p.h <= 0) fail('statusPosition', 'status needs an approved renderer anchor');
  const opacity = ctx.state.active?.includes(status.id) ? 1 : ctx.previous?.active?.includes(status.id) ? 0.72 : 0.4, role = ctx.state.ackReceived ? 'output' : 'neutral';
  return [sdk.box(`status.${status.id}.l0`, p.x, p.y, p.w, p.h, { role, opacity }), sdk.text(`status.${status.id}.text`, p.textX, p.textY, status.text, { role, opacity, align: 'middle' })];
}

export const statusLine = Object.freeze({ id, bindingTypes, draw });
export default statusLine;
