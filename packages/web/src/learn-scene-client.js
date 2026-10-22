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
// What the confirmation may say about a new /motion video (LearnVideos list): 'paused' while new generation is paused (owner message
// 28), else the server's estimate in credits (motionEstimateCredits, owner message 32), or null. Never derived here; the reservation
// (motionHoldUsd) is internal and never read for display (owner message 30).
export const motionHold = async app => { const list = await videoList(app); return list?.motionPaused ? 'paused' : Number.isInteger(list?.motionEstimateCredits) && list.motionEstimateCredits > 0 ? list.motionEstimateCredits : null; };

export const startVideo = (app, operation, { confirmed = false, retry = false } = {}) =>
  api(videoEndpoint(app), { method: 'POST', body: JSON.stringify({ operation, lessonId: 'adaptive-canvas', page: 'canvas', confirmed, retry }) });

// Stop a generating job whose provider can stop (a /motion request); free, so no confirmation.
export const stopVideo = (app, placementId) =>
  api(videoEndpoint(app), { method: 'POST', body: JSON.stringify({ action: 'cancel', id: placementId }) });

// Recovery of a failed /motion card (owner message 38): mode render (free) or fix (paid: confirmed after PaidConfirm).
export const recoverVideo = (app, placementId, mode, { confirmed = false } = {}) =>
  api(videoEndpoint(app), { method: 'POST', body: JSON.stringify({ action: 'recover', id: placementId, mode, ...(confirmed ? { confirmed: true } : {}) }) });

export const videoAssetUrl = (app, key) => new URL(`${videoEndpoint(app)}&asset=${key}`, window.location.origin).href;
