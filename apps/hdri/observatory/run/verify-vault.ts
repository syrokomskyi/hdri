/*
<MODULE_CONTRACT>
<purpose>Standalone CLI harness that checks ed25519 signatures on every signed observation in the observatory DB.</purpose>
<non-goals>
  <item>Does not sign observations — use SignObservationsGogol for that.</item>
  <item>Does not modify the observatory DB.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial creation.</item>
  <item>Add COMPASS scaffolding.</item>
  <item>Replace raw console.log/console.error with structured NDJSON logger from @syrokomskyi/pipeline-core.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: signature is detached ed25519 over SHA-256 of the target data; never reuse or expose the private key

import crypto from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { parseTrustedKeysManifest } from "@syrokomskyi/observatory-crypto";
import type { VerificationKey, TrustedKeysManifest } from "@syrokomskyi/observatory-crypto";
import { createJsonLogger } from "@syrokomskyi/pipeline-core";
import { getObservatoryDbPath } from "./db/connection.js";
import { verifySignedRows, type SignedRow } from "./verify/verify-core.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");
const defaultTransparencyDir = path.join(repoRoot, "transparency", "keys");

function parseArgs(argv: string[]): {
  year: number;
  transparencyDir: string;
  limit: number | null;
} {
  let year = new Date().getFullYear();
  let transparencyDir = defaultTransparencyDir;
  let limit: number | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--year" && argv[i + 1]) {
      year = parseInt(argv[++i]!, 10);
    } else if (argv[i] === "--transparency-dir" && argv[i + 1]) {
      transparencyDir = path.resolve(argv[++i]!);
    } else if (argv[i] === "--limit" && argv[i + 1]) {
      // Operational spot-check: verify only the first N rows (fast on a huge vault).
      limit = Math.max(1, parseInt(argv[++i]!, 10));
    }
  }
  return { year, transparencyDir, limit };
}

const log = createJsonLogger({ app: "observatory", gogol: "verify-vault" });

const { year, transparencyDir, limit } = parseArgs(process.argv.slice(2));
log.info("started", `verify-vault  year=${year}  transparency-dir=${transparencyDir}`, {
  year,
  transparencyDir,
});

// ── Load every public key in transparency/keys/ and index by signing_key_id ──

const keysByKeyId = new Map<string, VerificationKey>();
let keyFiles: string[];
try {
  const entries = await fsp.readdir(transparencyDir);
  keyFiles = entries.filter((f) => f.endsWith(".pem")).map((f) => path.join(transparencyDir, f));
} catch (err) {
  log.error(
    "cannot-read-transparency-dir",
    `Cannot read transparency directory ${transparencyDir}: ${String(err)}`,
    { transparencyDir, err: String(err) },
  );
  process.exit(1);
}

const pemSha256ByKeyId = new Map<string, string>();
for (const file of keyFiles) {
  const deviceId = path.basename(file, ".pem");
  const publicKeyPem = await fsp.readFile(file, "utf-8");
  const fullSha = crypto.createHash("sha256").update(publicKeyPem).digest("hex");
  const signingKeyId = `${deviceId}-${fullSha.slice(0, 16)}`;
  keysByKeyId.set(signingKeyId, { publicKeyPem, signingKeyId });
  pemSha256ByKeyId.set(signingKeyId, fullSha);
}
log.info("keys-loaded", `Loaded ${keysByKeyId.size} verification key(s) from ${transparencyDir}`, {
  keyCount: keysByKeyId.size,
  transparencyDir,
});

if (keysByKeyId.size === 0) {
  log.error("no-public-keys", "No public keys found. Cannot verify any signatures.");
  process.exit(1);
}

// ── Trusted-keys manifest (published root of trust; key rotation) ──
// When transparency/keys/trusted-keys.json is present it becomes authoritative: a signature is
// accepted only if its key is listed, not revoked, and the signature's date is within the key's
// validity window (in addition to being cryptographically valid). Absent → legacy "any pem in the
// dir is trusted" behaviour, with a warning so the operator knows the trust root is unpublished.
let trustManifest: TrustedKeysManifest | null = null;
try {
  const raw = await fsp.readFile(path.join(transparencyDir, "trusted-keys.json"), "utf-8");
  trustManifest = parseTrustedKeysManifest(JSON.parse(raw));
  // Integrity: every listed key's pem must be present and hash to the recorded sha256.
  let integrityOk = true;
  for (const entry of trustManifest.keys) {
    const onDisk = pemSha256ByKeyId.get(entry.signingKeyId);
    if (!onDisk) {
      log.error("trusted-key-pem-missing", `Trusted key ${entry.signingKeyId} has no pem on disk`, {
        signingKeyId: entry.signingKeyId,
      });
      integrityOk = false;
    } else if (onDisk !== entry.sha256) {
      log.error(
        "trusted-key-sha256-mismatch",
        `Trusted key ${entry.signingKeyId} pem sha256 drift`,
        {
          signingKeyId: entry.signingKeyId,
          expected: entry.sha256,
          onDisk,
        },
      );
      integrityOk = false;
    }
  }
  if (!integrityOk) {
    log.error(
      "trust-root-inconsistent",
      "trusted-keys.json does not match the pems on disk — aborting.",
    );
    process.exit(1);
  }
  log.info(
    "trust-manifest-loaded",
    `Enforcing trusted-keys manifest (${trustManifest.keys.length} key(s))`,
    {
      keyCount: trustManifest.keys.length,
    },
  );
} catch (err) {
  if ((err as NodeJS.ErrnoException).code === "ENOENT") {
    log.warn(
      "no-trust-manifest",
      "No transparency/keys/trusted-keys.json — trusting any pem in the dir (legacy). Publish a manifest to enforce key validity/rotation.",
    );
  } else {
    log.error("trust-manifest-invalid", `trusted-keys.json is present but invalid: ${String(err)}`);
    process.exit(1);
  }
}

// ── Open observatory DB read-only ──

const dbPath = getObservatoryDbPath(year);
let db: Database.Database;
try {
  db = new Database(dbPath, { readonly: true });
} catch (err) {
  log.error("cannot-open-db", `Cannot open observatory DB at ${dbPath}: ${String(err)}`, {
    dbPath,
    err: String(err),
  });
  process.exit(1);
}

// Skip the full-table COUNT(*) (a scan of every row) for a --limit spot-check — the point of the
// spot-check is speed. The streamed iteration below handles an empty table fine (tally.total=0).
if (!limit) {
  const countRow = db
    .prepare(
      `SELECT COUNT(*) AS n FROM observations WHERE signature IS NOT NULL AND obs_json IS NOT NULL`,
    )
    .get() as { n: number };
  if (countRow.n === 0) {
    db.close();
    log.info("nothing-to-verify", "No signed observations found — nothing to verify.");
    process.exit(0);
  }
  log.info("checking-observations", `Checking ${countRow.n} signed observations`, {
    rowCount: countRow.n,
  });
} else {
  log.info("checking-observations", `Checking up to ${limit} signed observations (spot-check)`, {
    limit,
  });
}

// ── Verify (streamed) ──
// .iterate() yields rows one at a time so obs_json is never fully materialized — bounded memory
// even at Q3's millions of observations. The verification logic lives in the tested core.
const stmt = db.prepare(
  `SELECT id, obs_json, signature, signed_at, signing_key_id, collector_id
     FROM observations
    WHERE signature IS NOT NULL AND obs_json IS NOT NULL${limit ? " LIMIT ?" : ""}`,
);
const iterator = (limit ? stmt.iterate(limit) : stmt.iterate()) as IterableIterator<SignedRow>;
const tally = verifySignedRows(iterator, keysByKeyId, trustManifest);
db.close();

const { total, valid, invalid, parseErrors, unknownKey, untrusted, failedIds, failedCount } = tally;
const rate = total > 0 ? ((valid / total) * 100).toFixed(2) : "—";

log.info(
  "verification-result",
  `${invalid === 0 ? "PASS" : "FAIL"} — ${valid}/${total} valid (${rate}%)`,
  {
    result: invalid === 0 ? "PASS" : "FAIL",
    total,
    valid,
    invalid,
    parseErrors,
    unknownKey,
    untrusted,
    rate,
  },
);

if (failedCount > 0) {
  const shown = failedIds;
  log.error(
    "failed-observations",
    `Failed observation IDs (showing ${shown.length} of ${failedCount})`,
    {
      failedCount,
      shownCount: shown.length,
      failedIds: shown,
    },
  );
}

process.exit(invalid > 0 ? 1 : 0);
