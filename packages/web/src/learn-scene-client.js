import { api, getWs } from './api.js';

// The durable scene endpoint the tldraw canvas already uses: post a validated
// generate_3d_animation operation, poll the list, then stream the GLB back
// through the same authenticated URL.
const endpoint = app => `/api/learn/scene?app=${encodeURIComponent(app)}&workspace=${encodeURIComponent(getWs())}`;

export const sceneList = app => api(endpoint(app));

// Paid: the caller passes confirmed only from the learner's Generate press;
// the endpoint refuses a start without it.
export const startScene = (app, operation, { confirmed = false, retry = false } = {}) =>
  api(endpoint(app), { method: 'POST', body: JSON.stringify({ operation, lessonId: 'adaptive-canvas', page: 'canvas', confirmed, retry }) });

export const sceneAssetUrl = (app, key) => new URL(`${endpoint(app)}&asset=${key}`, window.location.origin).href;

// Generated lesson video shares the same durable-job contract as scenes.
const videoEndpoint = app => `/api/learn/video?app=${encodeURIComponent(app)}&workspace=${encodeURIComponent(getWs())}`;

export const videoList = app => api(videoEndpoint(app));
// What the server says a new /motion video would hold (LearnVideos list): 'paused' while new generation is paused (owner message
// 28), else its per-job reservation (motionHoldUsd), or null where Motion cannot start.
export const motionHold = async app => { const list = await videoList(app); return list?.motionPaused ? 'paused' : Number.isFinite(list?.motionHoldUsd) ? list.motionHoldUsd : null; };

export const startVideo = (app, operation, { confirmed = false, retry = false } = {}) =>
  api(videoEndpoint(app), { method: 'POST', body: JSON.stringify({ operation, lessonId: 'adaptive-canvas', page: 'canvas', confirmed, retry }) });

// Stop a generating job whose provider can stop (a /motion request); free, so no confirmation.
export const stopVideo = (app, placementId) =>
  api(videoEndpoint(app), { method: 'POST', body: JSON.stringify({ action: 'cancel', id: placementId }) });

export const videoAssetUrl = (app, key) => new URL(`${videoEndpoint(app)}&asset=${key}`, window.location.origin).href;
