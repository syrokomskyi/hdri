/*
<MODULE_CONTRACT>
<purpose>Standalone CLI harness that checks ed25519 signatures on every signed observation in the observatory DB.</purpose>
<keywords>verify, vault, signature, ed25519, transparency</keywords>
<responsibilities>
  <item>Loads public keys from transparency/keys/*.pem and indexes by signing_key_id.</item>
  <item>Reads signed observations from observatory DB and verifies each ed25519 signature.</item>
  <item>Reports PASS/FAIL with detailed per-row diagnostics.</item>
</responsibilities>
<non-goals>
  <item>Does not sign observations — use SignObservationsGogol for that.</item>
  <item>Does not modify the observatory DB.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="harness">CLI entry point for vault signature verification.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>Initial creation.</item>
  <item>Add GRACE scaffolding.</item>
  <item>Replace raw console.log/console.error with structured NDJSON logger from @org/pipeline-core.</item>
</CHANGE_SUMMARY>
*/

import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { verifyObservation } from '@org/observatory-crypto';
import type { SignedObservation, VerificationKey } from '@org/observatory-crypto';
import type { Observation } from '@org/observatory-core';
import { createJsonLogger } from '@org/pipeline-core';
import { getObservatoryDbPath } from './db/connection.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..');
const defaultTransparencyDir = path.join(repoRoot, 'transparency', 'keys');

function parseArgs(argv: string[]): { year: number; transparencyDir: string } {
  let year = new Date().getFullYear();
  let transparencyDir = defaultTransparencyDir;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--year' && argv[i + 1]) {
      year = parseInt(argv[++i]!, 10);
    } else if (argv[i] === '--transparency-dir' && argv[i + 1]) {
      transparencyDir = path.resolve(argv[++i]!);
    }
  }
  return { year, transparencyDir };
}

const log = createJsonLogger({ app: 'digital-observatory', gogol: 'verify-vault' });

const { year, transparencyDir } = parseArgs(process.argv.slice(2));
log.info('started', `verify-vault  year=${year}  transparency-dir=${transparencyDir}`, { year, transparencyDir });

// ── Load every public key in transparency/keys/ and index by signing_key_id ──

const keysByKeyId = new Map<string, VerificationKey>();
let keyFiles: string[];
try {
  const entries = await fsp.readdir(transparencyDir);
  keyFiles = entries.filter((f) => f.endsWith('.pem')).map((f) => path.join(transparencyDir, f));
} catch (err) {
  log.error('cannot-read-transparency-dir', `Cannot read transparency directory ${transparencyDir}: ${String(err)}`, { transparencyDir, err: String(err) });
  process.exit(1);
}

for (const file of keyFiles) {
  const deviceId = path.basename(file, '.pem');
  const publicKeyPem = await fsp.readFile(file, 'utf-8');
  const fingerprint = crypto.createHash('sha256').update(publicKeyPem).digest('hex').slice(0, 16);
  const signingKeyId = `${deviceId}-${fingerprint}`;
  keysByKeyId.set(signingKeyId, { publicKeyPem, signingKeyId });
}
log.info('keys-loaded', `Loaded ${keysByKeyId.size} verification key(s) from ${transparencyDir}`, { keyCount: keysByKeyId.size, transparencyDir });

if (keysByKeyId.size === 0) {
  log.error('no-public-keys', 'No public keys found. Cannot verify any signatures.');
  process.exit(1);
}

// ── Open observatory DB read-only ──

const dbPath = getObservatoryDbPath(year);
let db: Database.Database;
try {
  db = new Database(dbPath, { readonly: true });
} catch (err) {
  log.error('cannot-open-db', `Cannot open observatory DB at ${dbPath}: ${String(err)}`, { dbPath, err: String(err) });
  process.exit(1);
}

type SignedRow = {
  id: string;
  obs_json: string;
  signature: string;
  signed_at: string;
  signing_key_id: string;
  collector_id: string;
};

const rows = db.prepare(`
  SELECT id, obs_json, signature, signed_at, signing_key_id, collector_id
  FROM observations
  WHERE signature IS NOT NULL AND obs_json IS NOT NULL
`).all() as SignedRow[];

db.close();

log.info('checking-observations', `Checking ${rows.length} signed observations`, { rowCount: rows.length });

if (rows.length === 0) {
  log.info('nothing-to-verify', 'No signed observations found — nothing to verify.');
  process.exit(0);
}

// ── Verify ──

let valid = 0;
let invalid = 0;
let parseErrors = 0;
let unknownKey = 0;
const failedIds: string[] = [];

for (const row of rows) {
  const vk = keysByKeyId.get(row.signing_key_id);
  if (!vk) {
    unknownKey++;
    invalid++;
    failedIds.push(`${row.id} (unknown signing_key_id=${row.signing_key_id})`);
    continue;
  }

  let obs: Observation;
  try {
    obs = JSON.parse(row.obs_json) as Observation;
  } catch {
    parseErrors++;
    failedIds.push(`${row.id} (parse error)`);
    invalid++;
    continue;
  }

  const signedObs: SignedObservation = {
    ...obs,
    signature: row.signature,
    signed_at: row.signed_at,
    signing_key_id: row.signing_key_id,
    collector_id: row.collector_id,
  };

  if (verifyObservation(signedObs, vk)) valid++;
  else {
    invalid++;
    failedIds.push(row.id);
  }
}

const total = valid + invalid;
const rate = total > 0 ? ((valid / total) * 100).toFixed(2) : '—';

log.info('verification-result', `${invalid === 0 ? 'PASS' : 'FAIL'} — ${valid}/${total} valid (${rate}%)`, {
  result: invalid === 0 ? 'PASS' : 'FAIL',
  total,
  valid,
  invalid,
  parseErrors,
  unknownKey,
  rate,
});

if (failedIds.length > 0) {
  const shown = failedIds.slice(0, 20);
  log.error('failed-observations', `Failed observation IDs (showing ${shown.length} of ${failedIds.length})`, {
    failedCount: failedIds.length,
    shownCount: shown.length,
    failedIds: shown,
  });
}

process.exit(invalid > 0 ? 1 : 0);
