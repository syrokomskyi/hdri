/*
<MODULE_CONTRACT>
<purpose>Side-effect entry point that auto-loads repository-level .env at module evaluation time. Thin wrapper around autoLoadEnv() from env.ts.</purpose>
<non-goals>
  <item>Does not contain env loading logic — delegates to env.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of environment variable loading mechanism.</item>
  <item>Import loadRepoEnv from env.ts instead of device.ts (module split).</item>
  <item>Reduced to thin wrapper around autoLoadEnv() from env.ts.</item>
</CHANGE_SUMMARY>
*/

/**
 * Side-effect import that loads the repository-level .env at module evaluation
 * time. Use as the FIRST import in any pipeline app's main.ts:
 *
 *   import '@syrokomskyi/observatory-crypto/auto-env';
 *   import { runApp } from './app/run-app.js';
 *   await runApp();
 *
 * For explicit loading, prefer:
 *
 *   import { autoLoadEnv } from '@syrokomskyi/observatory-crypto';
 *   autoLoadEnv();
 */

import { autoLoadEnv } from "./env.js";

autoLoadEnv();
