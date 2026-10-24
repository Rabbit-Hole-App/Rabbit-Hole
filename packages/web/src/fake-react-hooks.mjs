// A one-component React stand-in (not a browser) for hook tests (chat-persist.test.mjs, chat-restore-draft.test.mjs): hooks by call order, effects
// after each render, a state change renders again on a microtask. Enough for a hook; never a component tree.
export const FAKE_REACT = `
let slots = [], cursor = 0, hook = null, props, alive = false, queued = false, result, effects = null;
const same = (a, b) => !!a && !!b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
function render() { cursor = 0; effects = []; result = hook(props); const run = effects; effects = null; for (const effect of run) effect(); }
function schedule() { if (queued || !alive) return; queued = true; queueMicrotask(() => { queued = false; if (alive) render(); }); }
export function useState(init) {
  const i = cursor++;
  if (!(i in slots)) { const slot = { value: typeof init === 'function' ? init() : init }; slot.set = next => { const value = typeof next === 'function' ? next(slot.value) : next; if (!Object.is(value, slot.value)) { slot.value = value; schedule(); } }; slots[i] = slot; }
  return [slots[i].value, slots[i].set];
}
export function useReducer(reducer, arg, init) {
  const i = cursor++;
  if (!(i in slots)) { const slot = { value: init ? init(arg) : arg }; slot.dispatch = action => { const value = reducer(slot.value, action); if (!Object.is(value, slot.value)) { slot.value = value; schedule(); } }; slots[i] = slot; }
  return [slots[i].value, slots[i].dispatch];
}
export function useRef(value) { const i = cursor++; if (!(i in slots)) slots[i] = { current: value }; return slots[i]; }
export function useMemo(make, deps) { const i = cursor++; if (!(i in slots) || !same(slots[i].deps, deps)) slots[i] = { value: make(), deps }; return slots[i].value; }
export const useCallback = (fn, deps) => useMemo(() => fn, deps);
export function useEffect(effect, deps) {
  const i = cursor++, previous = slots[i];
  if (previous && deps && same(previous.deps, deps)) return;
  slots[i] = { deps, cleanup: previous?.cleanup };
  effects.push(() => { previous?.cleanup?.(); const cleanup = effect(); slots[i] = { deps, cleanup: typeof cleanup === 'function' ? cleanup : null }; });
}
export function mount(run, first) {
  slots = []; hook = run; props = first; alive = true; render();
  return { get current() { return result; }, rerender(next) { props = next; render(); }, unmount() { alive = false; for (const slot of slots) slot?.cleanup?.(); } };
}`;
