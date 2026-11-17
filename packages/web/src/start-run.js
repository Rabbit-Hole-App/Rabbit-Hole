// The one Start job of this tab, wired to the real commands, routes and router (start-job.js has the logic and its tests).
import { useSyncExternalStore } from 'react';
import { executeCommand } from './agent/commands.js';
import { api, navigate } from './api.js';
import { uploadContextDoc, uploadContextLink, uploadContextSource } from './context-docs.js';
import { uploadSource } from './file-source-client.js';
import { toast } from './ui.jsx';
import { createJob } from './start-job.js';
import { rehearsalOn } from './learn-rehearsal-view.js';

const storage = () => { try { return window.sessionStorage; } catch { return null; } }; // blocked storage: the list lives in memory
export const startJob = createJob({
  storage: storage(),
  command: executeCommand,
  uploadContextDoc,
  uploadSource,
  contextFromSource: uploadContextSource,
  contextLink: uploadContextLink,
  repository: (slug) => api(`/api/repositories/${encodeURIComponent(slug)}`),
  // Dev build only (VITE_REHEARSAL_TRIGGER=1): a GitHub rabbit hole opens a canvas inside the project so the Tutor pipeline can run on it (start-job.js intoCanvas).
  canvasInProject: rehearsalOn() ? (slug, title, ctx) => executeCommand('create_canvas', { title, project: slug, open: true }, ctx) : null,
  navigate,
  here: () => window.location.pathname,
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  notify: (text) => toast(text),
});

export const useStartDraft = () => useSyncExternalStore(startJob.subscribe, startJob.getDraft);
