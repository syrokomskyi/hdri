/*
<MODULE_CONTRACT>
<purpose>Build network-free availability verification entrypoints and reject remaining non-builtin runtime imports.</purpose>
<non-goals><item>Does not certify reproducibility or archive the container image; execution qualification is separate.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>Exclude only unreachable heavy-library imports from the standalone availability verifier bundle.</item></CHANGE_SUMMARY>
*/
import { build } from "esbuild";
import { builtinModules } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({ strict: true, allowPositionals: false, options: { outdir: { type: "string" } } });
if (!values.outdir) throw new Error("--outdir is required");
const outdir = path.resolve(values.outdir);
const result = await build({
  entryPoints: ["tools/prepare-availability.ts", "tools/reconcile-availability.ts",
    "tools/prepare-availability-preview.ts", "tools/review-availability-preview.ts"],
  bundle: true, platform: "node", format: "esm", target: "node24", conditions: ["@syrokomskyi/source"],
  outdir, outExtension: { ".js": ".mjs" }, metafile: true, write: false,
  banner: { js: 'import { createRequire as hdriCreateRequire } from "node:module"; const require = hdriCreateRequire(import.meta.url);' },
  plugins: [{ name: "remove-unreachable-heavy-imports", setup(builder) {
    // These modules are not stubbed. If a live path still uses one, the external-import
    // check below rejects the entire build before writing output.
    builder.onResolve({ filter: /^(sharp|playwright|playwright-core|better-sqlite3)(\/.*)?$/ }, args =>
      ({ path: args.path, external: true, sideEffects: false }));
  } }],
});
const allowed = new Set([...builtinModules, ...builtinModules.map(name => `node:${name}`)]);
for (const output of Object.values(result.metafile!.outputs))
  for (const dependency of output.imports)
    if (dependency.external && !allowed.has(dependency.path))
      throw new Error(`AVAILABILITY_RUNTIME_EXTERNAL_DEPENDENCY:${dependency.path}`);
await fs.mkdir(outdir, { recursive: true, mode: 0o700 });
for (const output of result.outputFiles!) await fs.writeFile(output.path, output.contents, { mode: 0o600 });
await fs.writeFile(path.join(outdir, "build-metafile.json"), `${JSON.stringify(result.metafile, null, 2)}\n`, { mode: 0o600 });
process.stdout.write(`${JSON.stringify({ status: "built-not-qualified", outdir, files: result.outputFiles!.map(file => path.basename(file.path)) })}\n`);
