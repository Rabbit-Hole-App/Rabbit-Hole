// Focus notebook (focus-adapter-notebook.js): the frame becomes four custom properties on the card's existing host; enter,
// update and exit are idempotent; the host keeps its node, its parent and its children (the iframe never moves); nothing is
// saved. No DOM library in this suite: a minimal element stands in, with the few members the adapter touches.
import test from 'node:test';
import assert from 'node:assert/strict';
import { adapterFor, focusAdapters } from './focus-controller.js';
import { FOCUS_HOST, focusStyle, notebookFocus } from './focus-adapter-notebook.js';

function fakeHost({ height = 540, left = 0, top = 300 } = {}) {
  const props = new Map(), attrs = new Map(), listeners = [];
  const iframe = { tagName: 'IFRAME' };
  const parent = { children: [] };
  const host = {
    offsetHeight: height, offsetLeft: left, offsetTop: top, parentNode: parent, children: [iframe],
    style: { setProperty: (name, value) => props.set(name, value), removeProperty: name => props.delete(name), getPropertyValue: name => props.get(name) ?? '' },
    setAttribute: (name, value) => attrs.set(name, value), removeAttribute: name => attrs.delete(name), hasAttribute: name => attrs.has(name),
    addEventListener: (type, fn) => listeners.push({ type, fn }), removeEventListener: (type, fn) => listeners.splice(listeners.findIndex(entry => entry.type === type && entry.fn === fn), 1),
    props, attrs, listeners, iframe,
  };
  parent.children.push(host);
  return host;
}
const VIEW = { x: 100, y: 0, z: 0.5 };
const FRAME = { left: 116, top: 64, width: 800, height: 600 };

test('registered as the notebook adapter, labelled Focus notebook, for notebook cards only', () => {
  assert.equal(focusAdapters.get('notebook'), notebookFocus);
  assert.equal(notebookFocus.label, 'Focus notebook');
  assert.equal(adapterFor({ type: 'notebook', id: 'nb' }), notebookFocus);
  assert.equal(adapterFor({ type: 'notebook', id: 'nb' }, { readOnly: true }), notebookFocus, 'a read-only viewer may focus');
  assert.equal(notebookFocus.canFocus({ type: 'pdf' }), false);
  assert.equal(notebookFocus.canFocus(null), false);
});

test('focusStyle: frame size at text scale 1, the old footprint kept, placed from the untransformed position', () => {
  // frameInWorld(FRAME, VIEW) = { x: 32, y: 128, width: 800, height: 600, scale: 2 }
  assert.deepEqual(focusStyle({ x: 32, y: 128, width: 800, height: 600, scale: 2 }, { height: 540, left: 0, top: 300 }), {
    '--focus-w': '800px', '--focus-h': '600px', '--focus-mb': '-60px', '--focus-transform': 'translate(32px, -172px) scale(2)' });
  assert.equal(focusStyle(null, { height: 540, left: 0, top: 0 }), null);
});

// Owner, 2026-10-28: a notebook or code editor takes the pane up to about 1200 px (focus-host.js WIDE_MAX), centred.
test('a wide pane: the notebook is at most 1200 px wide, centred in the frame', () => {
  const host = fakeHost();
  notebookFocus.enter(host, { left: 0, top: 64, width: 1800, height: 600 }, { view: { x: 0, y: 0, z: 1 } });
  assert.equal(host.style.getPropertyValue('--focus-w'), '1200px');
  assert.equal(host.style.getPropertyValue('--focus-transform'), 'translate(300px, -236px) scale(1)');
  notebookFocus.exit(host);
});

test('enter, update and exit: idempotent, in place, the same host and iframe under the same parent', () => {
  const host = fakeHost(), parent = host.parentNode, iframe = host.iframe;
  notebookFocus.enter(host, FRAME, { view: VIEW });
  assert.ok(host.hasAttribute(FOCUS_HOST));
  assert.equal(host.style.getPropertyValue('--focus-w'), '800px');
  assert.equal(host.style.getPropertyValue('--focus-transform'), 'translate(32px, -172px) scale(2)');
  // A second enter (Study > Notebook pressed again) keeps the footprint read on the first, even if the host now reports its focused height.
  host.offsetHeight = 600;
  notebookFocus.enter(host, FRAME, { view: VIEW });
  assert.equal(host.style.getPropertyValue('--focus-mb'), '-60px');
  assert.equal(host.listeners.length, 1, 'one press guard');
  // The divider moved: a narrower frame, the same host.
  notebookFocus.update(host, { ...FRAME, width: 600 }, { view: VIEW });
  assert.equal(host.style.getPropertyValue('--focus-w'), '600px');
  assert.equal(host.parentNode, parent);
  assert.deepEqual(parent.children, [host]);
  assert.equal(host.children[0], iframe);
  notebookFocus.exit(host);
  assert.equal(host.hasAttribute(FOCUS_HOST), false);
  assert.equal(host.props.size, 0, 'every custom property taken off');
  assert.equal(host.listeners.length, 0);
  notebookFocus.exit(host);
  notebookFocus.update(host, FRAME, { view: VIEW });
  assert.equal(host.props.size, 0, 'an update after exit does not put Focus back');
  assert.equal(host.parentNode, parent);
  assert.equal(host.children[0], iframe);
});

test('the press guard stops a drag from the notebook header, never a press inside the notebook body', () => {
  const host = fakeHost();
  notebookFocus.enter(host, FRAME, { view: VIEW });
  const press = zone => { let stopped = false; host.listeners[0].fn({ target: { closest: selector => (selector === '[data-drag-zone]' && zone ? {} : null) }, stopPropagation: () => { stopped = true; } }); return stopped; };
  assert.equal(press(true), true);
  assert.equal(press(false), false);
  notebookFocus.exit(host);
});
