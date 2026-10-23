// Shared mute state for lesson narration audio, persisted per browser.
// This module reads storage when it loads, and the bundler may run its chunk before main.jsx's own import of the fallback: so it
// imports the fallback itself and reads and writes through guards (an embed with third-party storage refused must still open).
import './storage-fallback.js';
const readKey = key => { try { return localStorage.getItem(key); } catch { return null; } };
const writeKey = (key, value) => { try { localStorage.setItem(key, value); } catch { /* blocked storage: not kept */ } };
let muted = readKey('small.learn-muted') === '1';
const listeners = new Set();
export const isMuted = () => muted;
export const setMuted = value => {
  muted = value;
  writeKey('small.learn-muted', value ? '1' : '0');
  listeners.forEach(listener => listener(value));
};
export const onMuted = listener => { listeners.add(listener); return () => listeners.delete(listener); };

// Playback speed shared by canvas pacing and narration audio.
export const SPEEDS = [1, 1.25, 1.5, 2];
let speed = SPEEDS.includes(Number(readKey('small.learn-speed'))) ? Number(readKey('small.learn-speed')) : 1;
const speedListeners = new Set();
export const getSpeed = () => speed;
export const setSpeed = value => {
  speed = value;
  writeKey('small.learn-speed', String(value));
  speedListeners.forEach(listener => listener(value));
};
export const onSpeed = listener => { speedListeners.add(listener); return () => speedListeners.delete(listener); };
