export function evaluate({ inputs, time, seed, state }) {
  const W = 960, H = 540;
  const x0 = 80, x1 = 620, yTop = 70, yBot = 460;
  const tMax = 60, Tlo = -10, Thi = 100;
  const T0 = 90, k = 0.05;
  let roomIn = Number(inputs && inputs.room);
  if (!Number.isFinite(roomIn)) roomIn = 10;
  const Ta = Math.min(30, Math.max(-10, roomIn));
  let tt = Number(time);
  if (!Number.isFinite(tt)) tt = 0;
  const tm = Math.min(tMax, Math.max(0, tt * 3));
  const sx = (t) => x0 + (x1 - x0) * t / tMax;
  const sy = (v) => yBot + (yTop - yBot) * (v - Tlo) / (Thi - Tlo);
  const temp = (t, a) => a + (T0 - a) * Math.exp(-k * t);
  const Tnow = temp(tm, Ta);
  const gap = Tnow - Ta;
  const rate = k * gap;
  const fmt = (v, d) => {
    const p = Math.pow(10, d);
    let r = Math.round(v * p) / p;
    if (Object.is(r, -0)) r = 0;
    return sdk.format(r, d);
  };
  const o = [];
  o.push(sdk.text('title', 40, 30, 'Coffee cooling in a room (Newton\'s law of cooling)'));
  o.push(sdk.line('ax_x', x0, yBot, x1, yBot));
  o.push(sdk.line('ax_y', x0, yBot, x0, yTop));
  for (let v = 0; v <= 100; v += 20) {
    o.push(sdk.text('yl' + v, x0 - 20, sy(v) + 5, String(v), { align: 'middle' }));
  }
  for (let m = 0; m <= 60; m += 10) {
    o.push(sdk.text('xl' + m, sx(m), yBot + 22, String(m), { align: 'middle' }));
  }
  o.push(sdk.text('xt', (x0 + x1) / 2, yBot + 48, 'time (minutes)', { align: 'middle' }));
  o.push(sdk.text('yt', 30, 58, 'temperature (\u00b0C)'));
  const N = 60;
  const showRef = Math.abs(Ta - 20) > 0.5;
  if (showRef) {
    const ref = [];
    for (let i = 0; i <= N; i++) { const t = tMax * i / N; ref.push([sx(t), sy(temp(t, 20))]); }
    o.push(sdk.polyline('ref', ref, { role: 'neutral', opacity: 0.35 }));
  }
  o.push(sdk.line('roomline', x0, sy(Ta), x1, sy(Ta), { role: 'input', opacity: 0.8 }));
  o.push(sdk.text('roomlab', x1 + 8, sy(Ta) + 5, 'room ' + fmt(Ta, 0) + '\u00b0C', { role: 'input' }));
  const full = [];
  for (let i = 0; i <= N; i++) { const t = tMax * i / N; full.push([sx(t), sy(temp(t, Ta))]); }
  o.push(sdk.polyline('future', full, { role: 'output', opacity: 0.25 }));
  if (tm > 0.2) {
    const n = 50, done = [];
    for (let i = 0; i <= n; i++) { const t = tm * i / n; done.push([sx(t), sy(temp(t, Ta))]); }
    o.push(sdk.polyline('past', done, { role: 'output' }));
  }
  o.push(sdk.circle('dot', sx(tm), sy(Tnow), 14, { role: 'output' }));
  const px = 700;
  o.push(sdk.box('cup', px, 90, 200, 110, { text: 'Coffee ' + fmt(Tnow, 1) + ' \u00b0C', role: Tnow > 50 ? 'warning' : 'output' }));
  o.push(sdk.text('tl', px, 230, 'After ' + fmt(tm, 0) + ' min'));
  o.push(sdk.text('gl', px, 260, 'Gap to room: ' + fmt(gap, 1) + ' \u00b0C'));
  o.push(sdk.text('rl', px, 290, 'Cooling: ' + fmt(rate, 2) + ' \u00b0C/min'));
  o.push(sdk.math('eq', px, 335, 'T(t) = T_r + (T_0 - T_r) e^{-kt}'));
  o.push(sdk.text('n1', px, 375, 'Bigger gap = faster cooling.'));
  o.push(sdk.text('n2', px, 400, 'It slows as it nears the room'));
  o.push(sdk.text('n3', px, 422, 'and never drops below it.'));
  if (showRef) o.push(sdk.text('n4', px, 455, 'Faint curve: a 20 \u00b0C room', { opacity: 0.7 }));
  const readouts = [
    { id: 'minutes', value: tm }, { id: 'coffee', value: Tnow }, { id: 'room_c', value: Ta }, { id: 'gap', value: gap }
  ];
  return {
    frame: { width: W, height: H, objects: o, readouts: readouts },
    quantities: { minutes: tm, coffee: Tnow, room: Ta, gap: gap, rate: rate }
  };
}
