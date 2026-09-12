/*
<MODULE_CONTRACT>
<purpose>CLI entry point for preserve:q2, preserve:verify, and baseline:import app-local scripts.</purpose>
<non-goals>
  <item>Does not register as a Site OS command.</item>
  <item>Does not perform network operations.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0100: preservation and baseline-import CLI.</item>
</CHANGE_SUMMARY>
*/

import path from "node:path";

import "@syrokomskyi/observatory-crypto/auto-env";
import { loadSigningKeyFromEnv } from "@syrokomskyi/observatory-crypto";

import { importBaseline } from "./baseline-import.js";
import { type BaselineIdentity } from "./contracts.js";
import { inventorySources, type InventoryEntry } from "./inventory.js";
import { preserveQ2, verifyReplicas } from "./preserve.js";

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

type ParsedArgs = {
  inventory?: string;
  identities?: string;
  archiveRoot?: string;
  archive?: string;
  target?: string;
  dryRun: boolean;
  full: boolean;
  json: boolean;
};

const parseArgs = (args: string[]): ParsedArgs => {
  const parsed: ParsedArgs = { dryRun: false, full: false, json: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--inventory":
        parsed.inventory = args[++i];
        break;
      case "--identities":
        parsed.identities = args[++i];
        break;
      case "--archive-root":
        parsed.archiveRoot = args[++i];
        break;
      case "--archive":
        parsed.archive = args[++i];
        break;
      case "--target":
        parsed.target = args[++i];
        break;
      case "--dry-run":
        parsed.dryRun = true;
        break;
      case "--full":
        parsed.full = true;
        break;
      case "--json":
        parsed.json = true;
        break;
      default:
        if (arg?.startsWith("--")) {
          throw new Error(`Unknown flag: ${arg}`);
        }
    }
  }
  return parsed;
};

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

const runPreserveQ2 = async (args: string[]): Promise<number> => {
  const opts = parseArgs(args);
  if (!opts.inventory || !opts.archiveRoot) {
    console.error(
      "Usage: preserve:q2 -- --inventory <file> --archive-root <root> [--dry-run] [--json]",
    );
    return 1;
  }

  const signingKey = loadSigningKeyFromEnv();
  const inventory = await inventorySources({
    roots: [opts.archiveRoot],
  });

  const diagnostic = await preserveQ2({
    inventory,
    archiveRoot: opts.archiveRoot,
    dryRun: opts.dryRun,
    signingKey,
    replicaDestinations: [
      {
        dest: path.join(opts.archiveRoot, "replica-1"),
        failureDomain: "host-a",
        medium: "ssd",
        credentialBoundary: "key-a",
      },
      {
        dest: path.join(opts.archiveRoot, "replica-2"),
        failureDomain: "host-b",
        medium: "hdd",
        credentialBoundary: "key-b",
      },
      {
        dest: path.join(opts.archiveRoot, "replica-3"),
        failureDomain: "host-c",
        medium: "tape",
        credentialBoundary: "key-c",
      },
    ],
  });

  if (opts.json) {
    console.log(JSON.stringify(diagnostic, null, 2));
  }

  return diagnostic.status === "pass" ? 0 : 1;
};

const runPreserveVerify = async (args: string[]): Promise<number> => {
  const opts = parseArgs(args);
  if (!opts.archive) {
    console.error("Usage: preserve:verify -- --archive <path> [--full] [--json]");
    return 1;
  }

  const diagnostic = await verifyReplicas({
    archivePath: opts.archive,
    full: opts.full,
    expectedReplicaCount: 3,
  });

  if (opts.json) {
    console.log(JSON.stringify(diagnostic, null, 2));
  }

  return diagnostic.status === "pass" ? 0 : 1;
};

const runBaselineImport = async (args: string[]): Promise<number> => {
  const opts = parseArgs(args);
  if (!opts.archive || !opts.target) {
    console.error(
      "Usage: baseline:import -- --archive <path> --target <fresh-root> [--inventory <file>] [--identities <file>] [--json]",
    );
    return 1;
  }

  let inventory: InventoryEntry[] = [];
  if (opts.inventory) {
    const raw = await import("node:fs/promises").then((m) => m.readFile(opts.inventory!, "utf8"));
    inventory = JSON.parse(raw) as InventoryEntry[];
  }

  let identities: BaselineIdentity[] = [];
  if (opts.identities) {
    const raw = await import("node:fs/promises").then((m) => m.readFile(opts.identities!, "utf8"));
    identities = JSON.parse(raw) as BaselineIdentity[];
  }

  const receipt = await importBaseline({
    archivePath: opts.archive,
    targetRoot: opts.target,
    inventory,
    identities,
  });

  if (opts.json) {
    console.log(JSON.stringify(receipt, null, 2));
  }

  return 0;
};

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

const main = async (): Promise<void> => {
  const command = process.argv[2];
  const restArgs = process.argv.slice(3);

  let exitCode: number;
  switch (command) {
    case "preserve:q2":
      exitCode = await runPreserveQ2(restArgs);
      break;
    case "preserve:verify":
      exitCode = await runPreserveVerify(restArgs);
      break;
    case "baseline:import":
      exitCode = await runBaselineImport(restArgs);
      break;
    default:
      console.error("Usage: cli.ts <preserve:q2|preserve:verify|baseline:import> [options]");
      process.exit(1);
  }

  process.exit(exitCode);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
