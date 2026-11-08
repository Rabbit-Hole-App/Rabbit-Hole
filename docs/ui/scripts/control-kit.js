
function drawSplit(cutoff, criterion) {
  const points = ['A', 'A', 'B', 'A', 'A', 'B', 'B', 'A', 'B', 'B'];
  const left = points.filter((_, i) => i + 1 <= cutoff);
  const right = points.slice(left.length);
  const tally = group => group.filter(label => label === 'A').length;
  const impurity = group => {
    const p = tally(group) / group.length;
    if (p === 0 || p === 1) return 0;
    return criterion === 'entropy'
      ? -p * Math.log2(p) - (1 - p) * Math.log2(1 - p)
      : 1 - p ** 2 - (1 - p) ** 2;
  };
  const leftA = tally(left);
  const rightA = tally(right);
  const child = (left.length * impurity(left) + right.length * impurity(right)) / points.length;
  const gain = impurity(points) - child;
  const format = value => value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  const measure = criterion === 'entropy' ? 'entropy' : 'Gini';
  const splitX = 30 + (cutoff - 1) * (480 / 9);
  const dots = points.map((label, i) => {
    const x = 30 + i * (480 / 9);
    return `<circle cx="${x}" cy="52" r="12" fill="${label === 'A' ? '#426db2' : '#b86232'}"/>
      <text x="${x}" y="56" fill="white" text-anchor="middle" font-size="11" font-weight="700">${label}</text>
      <text x="${x}" y="76" fill="#5d675f" text-anchor="middle" font-size="11">${i + 1}</text>`;
  }).join('');
  return {
    why: `At ${cutoff.toFixed(1)}, the left group has ${leftA} A and ${left.length - leftA} B. The right group has ${rightA} A and ${right.length - rightA} B, giving ${measure} gain of ${format(gain)}.`,
    svg: `<svg viewBox="0 0 540 140" role="img" aria-label="Labeled points, class counts and split gain" style="display:block;width:100%;height:auto">
      <rect x="0.5" y="0.5" width="539" height="139" rx="10" fill="#f6f8f4" stroke="#e3e7e0"/>
      <rect x="13" y="14" width="${splitX - 13}" height="73" rx="6" fill="#eaf1fb"/>
      <rect x="${splitX}" y="14" width="${527 - splitX}" height="73" rx="6" fill="#f8ece3"/>
      <path d="M ${splitX} 14 V 87" stroke="#267657" stroke-width="2" stroke-dasharray="4 3"/>
      ${dots}
      <text x="${splitX}" y="29" text-anchor="middle" fill="#267657" font-size="11" font-weight="700" paint-order="stroke" stroke="#f6f8f4" stroke-width="3">${cutoff.toFixed(1)}</text>
      <text x="20" y="109" fill="#202723" font-size="13" font-weight="700">Left · ${leftA} A, ${left.length - leftA} B</text>
      <text x="20" y="126" fill="#202723" font-size="13" font-weight="700">Right · ${rightA} A, ${right.length - rightA} B</text>
      <text x="520" y="109" text-anchor="end" fill="#5d675f" font-size="13">Weighted ${measure} ${format(child)}</text>
      <text x="520" y="126" text-anchor="end" fill="#267657" font-size="13" font-weight="700">Gain ${format(gain)}</text>
    </svg>`,
  };
}

function drawToss(height, time) {
  const ballHeight = t => height - 0.5 * 9.81 * t ** 2;
  const x = t => 48 + (t + 0.5) * 325;
  const y = meters => 117 - meters * 32;
  const trajectory = Array.from({ length: 33 }, (_, index) => {
    const t = -0.5 + index / 32;
    return `${x(t).toFixed(2)},${y(ballHeight(t)).toFixed(2)}`;
  }).join(' ');
  const currentHeight = ballHeight(time);
  return {
    svg: `<svg viewBox="0 0 540 140" role="img" aria-label="Height over time. Peak ${height.toFixed(2)} meters. Current height ${currentHeight.toFixed(2)} meters." style="display:block;width:100%;height:auto">
      <rect x="0.5" y="0.5" width="539" height="139" rx="10" fill="#f6f8f4" stroke="#e3e7e0"/>
      <path d="M 48 15 V 117 H 373" fill="none" stroke="#a9b5a9" stroke-width="1.25"/>
      ${[0, 1, 2, 3].map(meters => `<path d="M 48 ${y(meters)} H 373" stroke="#e3e7e0"/><text x="40" y="${y(meters) + 4}" text-anchor="end" fill="#5d675f" font-size="11">${meters}</text>`).join('')}
      <text x="21" y="15" fill="#5d675f" font-size="11">m</text>
      <text x="370" y="132" text-anchor="end" fill="#5d675f" font-size="11">Time from peak (s)</text>
      <path d="M ${x(0)} 15 V 117" stroke="#a9b5a9" stroke-dasharray="3 4"/>
      <polyline points="${trajectory}" fill="none" stroke="#426db2" stroke-width="2.5" stroke-linejoin="round"/>
      <circle cx="${x(time)}" cy="${y(currentHeight)}" r="6" fill="#b86232" stroke="#fffefa" stroke-width="2"/>
      <path d="M 392 23 V 113" stroke="#e3e7e0"/>
      <text x="409" y="45" fill="#5d675f" font-size="12">Peak height</text>
      <text x="409" y="65" fill="#202723" font-size="17" font-weight="700">${height.toFixed(2)} m</text>
      <text x="409" y="94" fill="#5d675f" font-size="12">Current height</text>
      <text x="409" y="114" fill="#267657" font-size="17" font-weight="700">${currentHeight.toFixed(2)} m</text>
    </svg>`,
  };
}

  let nextId = 0;
  const uid = () => `control-${++nextId}`;
  const clone = name => document.getElementById(`${name}-template`).content.firstElementChild.cloneNode(true);
  const query = (node, selector) => node.querySelector(selector);
  const write = (node, selector, text) => { query(node, selector).textContent = text; };
  const setValue = (node, value) => { node.textContent = value; };

  function slider({ label, min, max, step, value, format = String }, onChange = () => {}) {
    const node = clone('range');
    const input = query(node, 'input');
    const output = query(node, 'output');
    Object.assign(input, { id: uid(), min, max, step, value });
    query(node, 'label').htmlFor = input.id;
    write(node, 'label', label);
    output.setAttribute('for', input.id);
    function sync(notify) {
      const current = Number(input.value);
      const text = format(current);
      setValue(output, text);
      input.setAttribute('aria-valuetext', text);
      if (notify) onChange(current);
    }
    input.addEventListener('input', () => sync(true));
    sync(false);
    return node;
  }

  function choices({ label, options, selected, multiple = false }, onChange = () => {}) {
    const node = clone('choice');
    const group = uid();
    const active = new Set(multiple ? selected : [selected]);
    write(node, 'legend', label);
    write(node, '.control-label', label);
    for (const [value, title] of options) {
      const option = clone('option');
      const input = query(option, 'input');
      Object.assign(input, { name: group, value, checked: active.has(value), type: multiple ? 'checkbox' : 'radio' });
      write(option, '.choice-text', title);
      query(node, '.choice-list').append(option);
    }
    node.addEventListener('change', event => {
      if (multiple) onChange([...node.querySelectorAll('input:checked')].map(input => input.value));
      else if (event.target.checked) onChange(event.target.value);
    });
    return node;
  }

  function action(label, onClick, secondary = false) {
    const button = clone('button');
    button.textContent = label;
    button.classList.toggle('secondary', secondary);
    button.addEventListener('click', onClick);
    return button;
  }

  function currentTime(value, signed = true) {
    const rounded = Math.round(value * 100) / 100;
    const sign = rounded < 0 ? '−' : rounded > 0 && signed ? '+' : '';
    return `${sign}${Math.abs(rounded).toFixed(2)} s`;
  }

  function transport({ min, max, initial, step, signed }, onChange = () => {}) {
    const node = clone('timeline');
    const play = query(node, '[data-play]');
    const input = query(node, 'input');
    const output = query(node, 'output');
    let time = initial;
    let active = false;
    let pending = 0;
    let last = null;
    Object.assign(input, { id: uid(), min, max, step, value: initial });
    output.setAttribute('for', input.id);
    function update(next) {
      time = Math.max(min, Math.min(max, next));
      input.value = time;
      const text = currentTime(time, signed);
      setValue(output, text);
      input.setAttribute('aria-valuetext', text);
      play.textContent = active ? 'Pause' : time >= max ? 'Replay' : 'Play';
      onChange(time);
    }
    function stop() {
      active = false;
      last = null;
      cancelAnimationFrame(pending);
    }
    function tick(now) {
      if (!active) return;
      const elapsed = last === null ? 0 : (now - last) * 0.00035;
      last = now;
      if (time + elapsed >= max) {
        stop();
        update(max);
        return;
      }
      update(time + elapsed);
      pending = requestAnimationFrame(tick);
    }
    play.addEventListener('click', () => {
      if (active) {
        stop();
        update(time);
      } else {
        active = true;
        update(time >= max ? min : time);
        pending = requestAnimationFrame(tick);
      }
    });
    input.addEventListener('input', () => {
      stop();
      update(Number(input.value));
    });
    update(initial);
    return node;
  }

  function dropdown(label, options, onChange = () => {}) {
    const node = clone('select');
    const select = query(node, 'select');
    write(node, 'span', label);
    for (const [value, title] of options) select.add(new Option(title, value));
    select.addEventListener('change', () => onChange(select.value));
    return node;
  }

  function toggle(label, checked, onChange = () => {}) {
    const node = clone('toggle');
    const input = query(node, 'input');
    write(node, '.control-label', label);
    input.checked = checked;
    input.addEventListener('change', () => onChange(input.checked));
    return node;
  }

  function stepper({ label, min, max, value }, onChange = () => {}) {
    const node = clone('stepper');
    const input = query(node, 'input');
    const [minus, plus] = node.querySelectorAll('button');
    Object.assign(input, { id: uid(), min, max, step: 1, value });
    query(node, 'label').htmlFor = input.id;
    write(node, 'label', label);
    function sync(notify) {
      const number = input.valueAsNumber;
      const current = Math.max(min, Math.min(max, Number.isFinite(number) ? Math.round(number) : value));
      input.value = current;
      minus.disabled = current <= min;
      plus.disabled = current >= max;
      if (notify) onChange(current);
    }
    minus.addEventListener('click', () => { input.stepDown(); sync(true); });
    plus.addEventListener('click', () => { input.stepUp(); sync(true); });
    input.addEventListener('change', () => sync(true));
    sync(false);
    return node;
  }

  function orderedIndex(labels, onChange = () => {}) {
    const node = clone('index');
    const [previous, next] = node.querySelectorAll('button');
    const output = query(node, 'output');
    let index = 0;
    function sync() {
      setValue(output, labels[index]);
      previous.disabled = index === 0;
      next.disabled = index === labels.length - 1;
      onChange(index);
    }
    previous.addEventListener('click', () => { index--; sync(); });
    next.addEventListener('click', () => { index++; sync(); });
    sync();
    return node;
  }

  function disclosure() {
    const node = clone('disclosure');
    const changed = query(node, '.status');
    query(node, '.settings-body').append(toggle('Show grid lines', false, on => { changed.hidden = !on; }));
    return node;
  }

  function readout(label, value) {
    const node = clone('readout');
    write(node, 'span', label);
    write(node, 'strong', value);
    return node;
  }

  function card({ type, mode, title, concept, instruction = '' }) {
    const node = clone('card');
    const slot = key => query(node, `[data-slot="${key}"]`);
    slot('pill').classList.add(type);
    slot('pill').textContent = type === 'explain' ? 'Explanation' : 'Interactive';
    slot('mode').textContent = mode;
    slot('title').textContent = title;
    slot('title').id = uid();
    node.setAttribute('aria-labelledby', slot('title').id);
    slot('concept').textContent = concept;
    slot('instruction').textContent = instruction;
    slot('instruction').hidden = !instruction;
    query(document, '#example-cards').append(node);
    return {
      draw: svg => { slot('scene').innerHTML = svg; },
      visual: element => slot('scene').append(element),
      why: message => { slot('why').hidden = !message; slot('reason').textContent = message; },
      timeline: element => slot('timeline').append(element),
      controls: (...items) => { slot('controls').hidden = !items.length; slot('controls').append(...items); },
    };
  }

  function createStats(items) {
    const row = document.createElement('div');
    row.className = 'example-stat';
    for (const [label, value] of items) {
      const stat = document.createElement('div');
      const text = document.createElement('span');
      const number = document.createElement('strong');
      stat.className = 'stat';
      text.textContent = label;
      number.textContent = value;
      stat.append(text, number);
      row.append(stat);
    }
    return row;
  }

  function createActionExample(onChange = () => {}) {
    const row = document.createElement('div');
    row.className = 'action-row';
    let index = 0;
    const status = document.createElement('output');
    status.className = 'status';
    status.setAttribute('aria-live', 'polite');
    const draw = action('Draw again', () => { index = (index + 1) % 3; sync(); });
    const reset = action('Reset', () => { index = 0; sync(); }, true);
    function sync() {
      setValue(status, `Draw ${index + 1} of 3`);
      reset.disabled = index === 0;
      onChange(index);
    }
    row.append(draw, reset, status);
    sync();
    return row;
  }

  function sample(name, status, title, description, component) {
    const node = clone('sample');
    node.dataset.demo = name;
    const tag = query(node, '.availability');
    tag.classList.toggle('gated', status === 'Renderer dependent');
    tag.classList.toggle('planned', status === 'Register first');
    tag.textContent = status;
    write(node, 'h3', title);
    write(node, 'p', description);
    query(node, '[data-mount]').append(component);
    query(document, '#control-catalog').append(node);
  }

