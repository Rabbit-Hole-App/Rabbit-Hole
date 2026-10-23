// The one Start job of this tab, wired to the real commands, routes and router (start-job.js has the logic and its tests).
import { useSyncExternalStore } from 'react';
import { executeCommand } from './agent/commands.js';
import { api, navigate } from './api.js';
import { uploadContextDoc, uploadContextLink, uploadContextSource } from './context-docs.js';
import { uploadSource } from './file-source-client.js';
import { toast } from './ui.jsx';
import { createJob } from './start-job.js';

const storage = () => { try { return window.sessionStorage; } catch { return null; } }; // blocked storage: the list lives in memory
export const startJob = createJob({
  storage: storage(),
  command: executeCommand,
  uploadContextDoc,
  uploadSource,
  contextFromSource: uploadContextSource,
  contextLink: uploadContextLink,
  repository: (slug) => api(`/api/repositories/${encodeURIComponent(slug)}`),
  navigate,
  here: () => window.location.pathname,
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  notify: (text) => toast(text),
});

export const useStartDraft = () => useSyncExternalStore(startJob.subscribe, startJob.getDraft);
