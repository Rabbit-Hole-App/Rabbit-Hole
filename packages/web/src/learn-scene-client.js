import { api, getWs } from './api.js';

// The durable scene endpoint the tldraw canvas already uses: post a validated
// generate_3d_animation operation, poll the list, then stream the GLB back
// through the same authenticated URL.
const endpoint = app => `/api/learn/scene?app=${encodeURIComponent(app)}&workspace=${encodeURIComponent(getWs())}`;

export const sceneList = app => api(endpoint(app));

// Paid: the caller passes confirmed only from the learner's Generate press;
// the endpoint refuses a start without it.
export const startScene = (app, operation, { confirmed = false } = {}) =>
  api(endpoint(app), { method: 'POST', body: JSON.stringify({ operation, lessonId: 'adaptive-canvas', page: 'canvas', confirmed }) });

export const sceneAssetUrl = (app, key) => new URL(`${endpoint(app)}&asset=${key}`, window.location.origin).href;

// Generated lesson video shares the same durable-job contract as scenes.
const videoEndpoint = app => `/api/learn/video?app=${encodeURIComponent(app)}&workspace=${encodeURIComponent(getWs())}`;

export const videoList = app => api(videoEndpoint(app));

export const startVideo = (app, operation, { confirmed = false, retry = false } = {}) =>
  api(videoEndpoint(app), { method: 'POST', body: JSON.stringify({ operation, lessonId: 'adaptive-canvas', page: 'canvas', confirmed, retry }) });

export const videoAssetUrl = (app, key) => new URL(`${videoEndpoint(app)}&asset=${key}`, window.location.origin).href;
