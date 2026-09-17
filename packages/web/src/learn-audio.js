// Shared mute state for lesson narration audio, persisted per browser.
let muted = localStorage.getItem('small.learn-muted') === '1';
const listeners = new Set();
export const isMuted = () => muted;
export const setMuted = value => {
  muted = value;
  localStorage.setItem('small.learn-muted', value ? '1' : '0');
  listeners.forEach(listener => listener(value));
};
export const onMuted = listener => { listeners.add(listener); return () => listeners.delete(listener); };
