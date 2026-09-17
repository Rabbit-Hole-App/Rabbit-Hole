import { defineConfig } from '@playwright/test';
import coaching from './playwright.coaching.config.js';
export default defineConfig({ ...coaching, testMatch: 'learn-preview.spec.js', timeout: 120_000 });
