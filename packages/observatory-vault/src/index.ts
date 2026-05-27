// Writer
export { VaultWriter } from './writer.js';
export type { WriteResult } from './writer.js';

// Reader
export { VaultReader } from './reader.js';

// Path helpers (for callers that build SQL manually)
export {
  obsGlob,
  obsShardDir,
  obsShardPath,
  statesGlob,
  statesShardDir,
  statesShardPath,
  VAULT_ASSET_STATES_DIR,
  VAULT_OBSERVATIONS_DIR,
} from './paths.js';
