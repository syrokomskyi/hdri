// Domain normalization (tldts-backed)
export {
  normalizeAssetDomain,
  normalizeAssetDomains,
  toRegistrableDomain,
} from './normalize.js';
export type { NormalizedDomain } from './normalize.js';

// ID minting (uuidv7 + crypto)
export { mintAssetId, newId } from './ids.js';
