/*
 * Loads the shared HDRI device env (apps/hdri/.env) before any gogol module
 * executes — config.ts calls getDeviceId() at module scope, and RFC-0268
 * acceptance probes run `vitest run <file>` from the repo root where the app
 * vitest.config.ts dotenv is not applied. Import this module first in tests
 * that transitively import run/config.ts.
 */
import { config } from "dotenv";

config({ path: "apps/hdri/.env" });
