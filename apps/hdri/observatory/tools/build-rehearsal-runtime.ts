/*
<MODULE_CONTRACT>
  <purpose>Assemble the frozen rehearsal runtime closure: esbuild-bundled stage adapters, external native deps, config files, and the rehearsal profile.</purpose>
  <non-goals>
    <item>Does not generate the fixture corpus — rehearsal-fixture.ts owns that.</item>
    <item>Does not run the rehearsal — quarter-rehearsal.ts consumes the emitted profile.</item>
  </non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0115 C4: runtime closure builder — bundle adapters, vendor native deps, emit profile.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: The closure must be self-contained — a bundled adapter may only resolve externals from <out>/node_modules.

import { createRequire } from "node:module";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { QUALIFICATION_STAGES } from "@syrokomskyi/observatory-emit";
import { FAULT_BOUNDARIES } from "../run/qualification/adapters/common.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const observatoryRoot = path.resolve(here, "..");
const adaptersRoot = path.join(observatoryRoot, "run/qualification/adapters");

const arg = (flag: string): string | undefined => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
};
const requireArg = (flag: string): string => {
  const value = arg(flag);
  if (!value) throw new Error(`MISSING_ARG:${flag}`);
  return value;
};

const outRoot = path.resolve(requireArg("--out"));
const fixtureRoot = path.resolve(requireArg("--fixture-root"));
const browserRoot = arg("--browser-root") ? path.resolve(arg("--browser-root")!) : undefined;
const stageTimeoutMs = Number(arg("--stage-timeout-ms") ?? 3_600_000);
if (!Number.isSafeInteger(stageTimeoutMs) || stageTimeoutMs <= 0)
  throw new Error("INVALID_STAGE_TIMEOUT");

// ── 1. Bundle every adapter ─────────────────────────────────────────────────
// Native/heavy externals stay external and are vendored into node_modules.
const EXTERNALS = [
  "better-sqlite3",
  "playwright",
  "playwright-core",
  "@axe-core/playwright",
  "axe-core",
  "@duckdb/node-api",
  // Lazily required by business-crawler robots-honor — esbuild leaves it external.
  "robots-parser",
];

await fsp.mkdir(outRoot, { recursive: true });
// Bundled adapters are ESM .js — the closure root must declare module type.
await fsp.writeFile(
  path.join(outRoot, "package.json"),
  `${JSON.stringify({ name: "hdri-rehearsal-runtime", type: "module" }, null, 2)}\n`,
);
/** True when the built bundle text references the given literal (e.g. a data file name). */
const bundleTextIncludes = async (outfile: string, needle: string): Promise<boolean> =>
  (await fsp.readFile(outfile, "utf8")).includes(needle);
for (const stage of QUALIFICATION_STAGES) {
  for (const mode of ["produce", "verify"] as const) {
    const entry = path.join(adaptersRoot, stage, `${mode}.ts`);
    if (!fs.existsSync(entry)) throw new Error(`ADAPTER_MISSING:${stage}/${mode}`);
    await esbuild.build({
      entryPoints: [entry],
      outfile: path.join(outRoot, "adapters", stage, `${mode}.js`),
      bundle: true,
      format: "esm",
      platform: "node",
      target: "node22",
      external: EXTERNALS,
      // Workspace deps resolve to dist/; keep sourcemaps off for a frozen closure.
      // CJS deps (e.g. yaml) emit dynamic require() calls — provide a real
      // require via createRequire under a non-colliding binding name.
      sourcemap: false,
      minify: false,
      banner: {
        js: "import { createRequire as __rehearsalCR } from 'node:module'; const require = __rehearsalCR(import.meta.url);",
      },
    });
    // Bundled modules resolve __dirname to the adapter dir — runtime data files
    // (e.g. business-core gewerk JSON) must be vendored next to the bundle.
    const outfile = path.join(outRoot, "adapters", stage, `${mode}.js`);
    if (await bundleTextIncludes(outfile, "hwo-master.json")) {
      const dataSrc = path.join(
        observatoryRoot,
        "../../../packages/business/business-core/src/gewerk/data",
      );
      await fsp.cp(dataSrc, path.join(outRoot, "adapters", stage, "data"), {
        recursive: true,
      });
    }
  }
}

// ── 2. Vendor external packages into <out>/node_modules ─────────────────────
// Recursive: each external's own runtime dependencies are vendored flat so the
// sandboxed process resolves everything under /runtime/closure/node_modules.
const require2 = createRequire(path.join(observatoryRoot, "package.json"));
const vendored = new Set<string>();
/** Resolve a package's root dir — works whether or not ./package.json is exported. */
const resolvePackageDir = async (name: string, fromDir: string): Promise<string> => {
  try {
    return path.dirname(require2.resolve(`${name}/package.json`, { paths: [fromDir] }));
  } catch {
    // Exports map hides package.json — resolve the entry and walk up to the
    // ancestor package.json whose name matches.
    const entry = require2.resolve(name, { paths: [fromDir] });
    let dir = path.dirname(entry);
    while (true) {
      const candidate = path.join(dir, "package.json");
      if (fs.existsSync(candidate)) {
        const pkg = JSON.parse(await fsp.readFile(candidate, "utf8")) as { name?: string };
        if (pkg.name === name) return dir;
      }
      const parent = path.dirname(dir);
      if (parent === dir) throw new Error(`PACKAGE_ROOT_NOT_FOUND:${name}`);
      dir = parent;
    }
  }
};
const vendor = async (name: string, fromDir: string): Promise<void> => {
  const pkgDir = await fsp.realpath(await resolvePackageDir(name, fromDir));
  const pkgJson = path.join(pkgDir, "package.json");
  if (vendored.has(pkgDir)) return;
  vendored.add(pkgDir);
  const dest = path.join(outRoot, "node_modules", name);
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  await fsp.cp(pkgDir, dest, { recursive: true, dereference: true });
  const pkg = JSON.parse(await fsp.readFile(pkgJson, "utf8")) as {
    dependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  };
  for (const dep of Object.keys(pkg.dependencies ?? {})) await vendor(dep, pkgDir);
  // Platform-specific native packages (e.g. @duckdb/node-bindings-linux-x64) are
  // optionalDependencies — vendor the ones installed for this platform, skip the rest.
  for (const dep of Object.keys(pkg.optionalDependencies ?? {})) {
    try {
      await vendor(dep, pkgDir);
    } catch {
      // Not installed on this platform — expected for cross-platform optional deps.
    }
  }
};
for (const ext of EXTERNALS) await vendor(ext, observatoryRoot);

// ── 3. Config files the adapters load from the closure ──────────────────────
const configDir = path.join(outRoot, "config");
await fsp.mkdir(configDir, { recursive: true });
for (const name of ["ontology.yaml", "codebook.yaml"]) {
  const src = path.join(observatoryRoot, ".input", name);
  if (!fs.existsSync(src)) throw new Error(`CONFIG_MISSING:${src}`);
  await fsp.copyFile(src, path.join(configDir, name));
}

// ── 4. Emit the rehearsal profile ───────────────────────────────────────────
// Per-stage fault boundaries: the deterministic failpoint each producer acks.
const STAGE_FAULTS: Record<string, (typeof FAULT_BOUNDARIES)[number]> = {
  "homepage-capture": "cas-write",
  "detected-capture": "extraction-checkpoint",
  extraction: "extraction-checkpoint",
  translation: "event-transaction",
  "scientific-check": "scientific-report",
  "privacy-check": "final-publication",
  replication: "replica-copy",
  "independent-rebuild": "public-promotion",
};
const STAGE_OUTPUTS: Record<string, string[]> = {
  "source-admission": [
    "work/source-admission/registry.sqlite",
    "work/source-admission/projection.jsonl",
    "work/source-admission/admission-receipt.json",
  ],
  "frame-identity": [
    "work/frame-identity/identity.sqlite",
    "work/frame-identity/projection.jsonl",
    "work/frame-identity/identity-receipt.json",
  ],
  liveness: [
    "work/liveness/liveness.sqlite",
    "work/liveness/projection.jsonl",
    "work/liveness/liveness-receipt.json",
  ],
  "homepage-capture": [
    "work/homepage-capture/capture.sqlite",
    "work/homepage-capture/projection.jsonl",
    "work/homepage-capture/capture-receipt.json",
  ],
  "detected-capture": [
    "work/detected-capture/detected.sqlite",
    "work/detected-capture/projection.jsonl",
    "work/detected-capture/detected-receipt.json",
  ],
  extraction: [
    "work/extraction/signals.sqlite",
    "work/extraction/projection.jsonl",
    "work/extraction/extraction-manifest.json",
  ],
  "browser-audit": [
    "work/browser-audit/audit.sqlite",
    "work/browser-audit/projection.jsonl",
    "work/browser-audit/slots.jsonl",
    "work/browser-audit/audit-receipt.json",
  ],
  translation: [
    "work/translation/observations.sqlite",
    "work/translation/projection.jsonl",
    "work/translation/translation-receipt.json",
    "work/translation/emit/manifest.json",
  ],
  scoring: [
    "work/scoring/observations.sqlite",
    "work/scoring/projection.jsonl",
    "work/scoring/scoring-receipt.json",
  ],
  "scientific-check": [
    "work/scientific-check/availability-report.json",
    "work/scientific-check/reconcile-counts.json",
    "work/scientific-check/projection.jsonl",
    "work/scientific-check/scientific-receipt.json",
  ],
  "privacy-check": [
    "work/privacy-check/report.json",
    "work/privacy-check/projection.jsonl",
    "work/privacy-check/privacy-receipt.json",
  ],
  replication: [
    "work/replication/projection.jsonl",
    "work/replication/replication-receipt.json",
    "work/replication/vault/vault-manifest.json",
    "work/replication/replica/vault-manifest.json",
  ],
  "independent-rebuild": [
    "work/independent-rebuild/rebuilt.sqlite",
    "work/independent-rebuild/projection.jsonl",
    "work/independent-rebuild/rebuild-receipt.json",
  ],
};

const profile = {
  schema: "hdri-rehearsal-profile@1",
  runtimeRoot: outRoot,
  fixtureRoot,
  ...(browserRoot ? { browserRoot } : {}),
  stageTimeoutMs,
  stages: QUALIFICATION_STAGES.map((stage) => ({
    stage,
    producer: `adapters/${stage}/produce.js`,
    verifier: `adapters/${stage}/verify.js`,
    outputs: STAGE_OUTPUTS[stage]!,
    ...(STAGE_FAULTS[stage] ? { faultBoundary: STAGE_FAULTS[stage] } : {}),
  })),
  // The selected-result projection for resume equivalence: the scored assets
  // and the independently rebuilt observation ids.
  comparisonFiles: ["work/scoring/projection.jsonl", "work/independent-rebuild/projection.jsonl"],
};
await fsp.writeFile(path.join(outRoot, "profile.json"), `${JSON.stringify(profile, null, 2)}\n`);

console.log(
  `[build-rehearsal-runtime] closure at ${outRoot}: ${QUALIFICATION_STAGES.length} stages bundled, ${vendored.size} packages vendored`,
);
