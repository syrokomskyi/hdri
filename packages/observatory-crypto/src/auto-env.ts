/**
 * Side-effect import that loads the repository-level .env at module evaluation
 * time. Use as the FIRST import in any pipeline app's main.ts:
 *
 *   import '@org/observatory-crypto/auto-env';
 *   import { runApp } from './app/run-app.js';
 *   await runApp();
 *
 * This ensures DEVICE_ID, DEVICE_SIGNING_KEY, and any other env vars are
 * available before downstream modules are evaluated (config.ts, etc.).
 */

import { loadRepoEnv } from './device.js';

loadRepoEnv();
