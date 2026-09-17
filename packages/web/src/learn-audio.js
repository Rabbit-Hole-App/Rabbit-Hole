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

// Playback speed shared by canvas pacing and narration audio.
export const SPEEDS = [1, 1.25, 1.5, 2];
let speed = SPEEDS.includes(Number(localStorage.getItem('small.learn-speed'))) ? Number(localStorage.getItem('small.learn-speed')) : 1;
const speedListeners = new Set();
export const getSpeed = () => speed;
export const setSpeed = value => {
  speed = value;
  localStorage.setItem('small.learn-speed', String(value));
  speedListeners.forEach(listener => listener(value));
};
export const onSpeed = listener => { speedListeners.add(listener); return () => speedListeners.delete(listener); };
