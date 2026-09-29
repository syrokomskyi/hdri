import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, test } from "vitest";
import { readAvailabilityDownload } from "../lib/availability";

const document = () => ({
  schema: "hdri-public-availability@2", denominator: "sealed-liveness-targets", outcome_policy: "availability-outcome-v1",
  interpretation: [
    "Reachability follows the retained probe policy, not successful page delivery or quarter-long uptime.",
    "Blocked and indeterminate results are distinct from unavailable results and remain in the denominator.",
    "Describes measured targets only; no population, industry, business-closure or quarter-comparison inference.",
  ],
  rows: [{ period: "2026-q3", n: 100, reachable: 40, unavailable: 30, blocked: 15, indeterminate: 15, reachable_share_of_targets: 0.4 }],
});
const csv = "period,n,reachable,unavailable,blocked,indeterminate,reachable_share_of_targets\n2026-q3,100,40,30,15,15,0.4\n";
function fixture(value: unknown = document(), csvText = csv) {
  const json = `${JSON.stringify(value)}\n`;
  const manifest = { schema: "hdri-public-manifest@1", period: "2026-q3", policyDigest: "a".repeat(64), kAnonymityMin: 12,
    products: [["json", json], ["csv", csvText]].map(([format, bytes]) => ({ schema: "hdri-public-product@1", product: "availability",
      format, bytes: Buffer.byteLength(bytes!), contentSha256: createHash("sha256").update(bytes!).digest("hex"),
      schemaId: "hdri-public-availability@2", policySha256: "a".repeat(64) })) };
  return { json, manifest, csv: csvText };
}
function read(input: ReturnType<typeof fixture>, period = "2026-q3") {
  return readAvailabilityDownload(period, JSON.stringify(input.manifest), input.json, input.csv);
}

test("keeps four outcomes and exact downloadable bytes separate from score data", () => {
  const input = fixture();
  const output = read(input);
  expect(output.row).toEqual({ period: "2026-q3", n: 100, reachable: 40, unavailable: 30, blocked: 15, indeterminate: 15, reachable_share_of_targets: 0.4 });
  expect(output.json).toBe(input.json);
  expect(output.csv).toBe(csv);
  expect(output.kAnonymityMin).toBe(12);
});

test("rejects preview manifests rather than silently publishing private candidates", () => {
  const input = fixture();
  expect(() => readAvailabilityDownload("2026-q3", JSON.stringify({ ...input.manifest, status: "candidate-not-approved" }), input.json, csv)).toThrow("MANIFEST_INVALID");
});

test("rejects edited bytes and wrong quarter", () => {
  const input = fixture();
  expect(() => read({ ...input, json: input.json + " " })).toThrow("DIGEST_MISMATCH");
  expect(() => read(input, "2026-q4")).toThrow("MANIFEST_INVALID");
});

test.each([
  { schema: "hdri-public-availability@1" }, { denominator: "resolved-targets" },
  { interpretation: ["Quarter-long uptime"] }, { domain: "private.invalid" },
])("rejects incompatible schema or extra public fields: %j", change => {
  expect(() => read(fixture({ ...document(), ...change }))).toThrow();
});

test.each([
  { n: 99 }, { reachable_share_of_targets: 0.9 }, { blocked: 1, indeterminate: 29 },
  { reachable: -1 }, { reachable: 40.5 }, { asset_id: "private" },
])("rejects unsafe or inconsistent aggregate fields: %j", change => {
  const value = document();
  expect(() => read(fixture({ ...value, rows: [{ ...value.rows[0], ...change }] }))).toThrow();
});

test("rejects inconsistent CSV even when its manifest digest matches", () => {
  expect(() => read(fixture(document(), csv.replace("100,40,30", "100,30,40")))).toThrow("FORMATS_DISAGREE");
});

test("rejects missing or duplicate formats and inconsistent policy binding", () => {
  const input = fixture();
  input.manifest.products[1] = input.manifest.products[0]!;
  expect(() => read(input)).toThrow("PRODUCT_INVALID");
  const other = fixture();
  other.manifest.products[0]!.policySha256 = "b".repeat(64);
  expect(() => read(other)).toThrow("PRODUCT_INVALID");
});

test("real static build preserves the index without availability counters and retains exact historical downloads", async () => {
  const repo = fileURLToPath(new URL("../../../../../", import.meta.url));
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-dashboard-build-"));
  try {
    const app = path.join(root, "apps/hdri/dashboard");
    const source = path.join(repo, "apps/hdri/dashboard");
    await fs.mkdir(app, { recursive: true });
    await fs.cp(path.join(source, "src"), path.join(app, "src"), { recursive: true });
    for (const name of ["astro.config.mjs", "tsconfig.json", "package.json"])
      await fs.copyFile(path.join(source, name), path.join(app, name));
    await fs.symlink(path.join(repo, "packages"), path.join(root, "packages"), "dir");
    await fs.symlink(path.join(repo, "node_modules"), path.join(root, "node_modules"), "dir");
    await fs.symlink(path.join(source, "node_modules"), path.join(app, "node_modules"), "dir");
    const products = path.join(app, "src/assets/data/public/availability/2026-q3");
    await fs.mkdir(products, { recursive: true });
    // Synthetic 100-target fixture lives only in this disposable build, never the real public tree.
    const input = fixture();
    await fs.writeFile(path.join(products, "public-manifest.json"), JSON.stringify(input.manifest));
    await fs.writeFile(path.join(products, "availability.json"), input.json);
    await fs.writeFile(path.join(products, "availability.csv"), input.csv);
    const data = path.join(app, "src/assets/data/public");
    const q3 = path.join(data, "periods/2026-q3");
    await fs.cp(path.join(data, "periods/2026-q2"), q3, {recursive: true});
    const periodManifest = JSON.parse(await fs.readFile(path.join(q3, "manifest.json"), "utf8"));
    await fs.writeFile(path.join(q3, "manifest.json"), JSON.stringify({...periodManifest, period: "2026-q3", sampleSize: 100}));
    const overview = JSON.parse(await fs.readFile(path.join(q3, "overview.json"), "utf8"));
    await fs.writeFile(path.join(q3, "overview.json"), JSON.stringify({...overview, sampleSize: 100,
      maturity: [
        {id: "kritisch", label: "Kritisch", count: 40, share: .4},
        {id: "basis", label: "Basis", count: 30, share: .3},
        {id: "aufbau", label: "Aufbau", count: 10, share: .1},
        {id: "fortgeschritten", label: "Fortgeschritten & Vorbild", count: 20, share: .2},
      ]}));
    const archive = JSON.parse(await fs.readFile(path.join(data, "archive.json"), "utf8"));
    await fs.writeFile(path.join(data, "archive.json"), JSON.stringify([...archive.filter((entry: {period: string}) => entry.period !== "2026-q3"), {period: "2026-q3", manifestPath: "periods/2026-q3/manifest.json", overviewPath: "periods/2026-q3/overview.json"}]));
    for (const [file, label] of [["bundeslaender", "Q3 region fixture"], ["gewerke", "Q3 industry fixture"]]) {
      await fs.writeFile(path.join(q3, `${file}.json`), JSON.stringify([{...overview.summary, n: 100, id: label, label}]));
    }
    await fs.writeFile(path.join(data, "latest.json"), JSON.stringify({period: "2026-q3", manifestPath: "periods/2026-q3/manifest.json"}));
    // A nonzero top band catches double-counting in the presentation merge.
    await fs.writeFile(path.join(data, "periods/2026-q2/overview.json"), JSON.stringify({...overview,
      maturity: [
        {id: "kritisch", label: "Kritisch", count: 10000, share: 10000/38121},
        {id: "basis", label: "Basis", count: 20000, share: 20000/38121},
        {id: "aufbau", label: "Aufbau", count: 8000, share: 8000/38121},
        {id: "fortgeschritten", label: "Fortgeschritten", count: 100, share: 100/38121},
        {id: "vorbild", label: "Vorbild", count: 21, share: 21/38121},
      ]}));
    try {
      await promisify(execFile)("rtk", ["proxy", "pnpm", "exec", "astro", "build", "--root", app], { cwd: app, timeout: 25000 });
    } catch (error) {
      const failure = error as Error & { stdout?: string; stderr?: string };
      throw new Error(`Isolated dashboard build failed: ${failure.stdout ?? ""}\n${failure.stderr ?? failure.message}`);
    }
    const html = await fs.readFile(path.join(app, "dist/index.html"), "utf8");
    expect(html).toContain("2026-q2");
    const hero = html.slice(html.indexOf('<section class="hero">'), html.indexOf('</section>', html.indexOf('<section class="hero">')));
    expect(hero).toContain("Digitaler Reifeindex: 2026-q3");
    expect(hero).toContain("Websites im Reifeindex · 2026-q3");
    expect(html).toContain('href="/quartale/2026-q2"');
    expect(html).toContain('href="/quartale/2026-q3"');
    expect(html).toContain('N = 100');
    for (const [id, label] of [["bundeslaender", "Q3 region fixture"], ["gewerke", "Q3 industry fixture"]]) {
      const section = html.slice(html.indexOf(`id="${id}"`), html.indexOf('</section>', html.indexOf(`id="${id}"`)));
      expect(section, "Current snapshot slices must render even without admitted quarter comparisons").toContain(label);
      expect(section).not.toContain('data-col-id="delta"');
      expect(section).toContain('N = 100');
    }
    expect(html).not.toContain('"name":"Reifegrad Vorbild"');
    const q2Html = await fs.readFile(path.join(app, "dist/quartale/2026-q2.html"), "utf8");
    expect(q2Html).toContain("Digitaler Reifeindex: 2026-q2");
    expect(q2Html).toContain("N = 38.121");
    const readable = (value: string) => value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
    expect(readable(q2Html)).toContain("Publikationsschwelle n ≥ 5");
    expect(readable(q2Html)).not.toContain("Publikationsschwelle n ≥ 12");
    expect(readable(html)).toContain("Publikationsschwelle n ≥ 12");
    expect(q2Html).toContain("Metadatenkorrektur vom 29.09.2026");
    expect(html).toContain("keine freigegebene Trendreihe");
    for (const page of ["methodik", "faq"]) {
      const text = readable(await fs.readFile(path.join(app, `dist/${page}.html`), "utf8"));
      expect(text).toContain("2026-q2 n ≥ 5 und für 2026-q3 n ≥ 12");
      expect(text).toContain("keine freigegebene Trendreihe");
    }
    expect(await fs.readFile(path.join(app, "dist/quartale/2026-q3.html"), "utf8")).toContain("Digitaler Reifeindex: 2026-q3");
    expect(html).not.toContain('id="verfuegbarkeit-2026-q3"');
    expect(html).not.toContain("Zugriff blockiert");
    expect(html).not.toContain("Nicht eindeutig bestimmbar");
    expect(html).not.toContain("Nicht erreichbar");
    expect(hero).not.toContain("Verfügbarkeit 2026-q3");
    expect(await fs.readFile(path.join(app, "dist/daten/verfuegbarkeit/2026-q3.json"), "utf8")).toBe(input.json);
    expect(await fs.readFile(path.join(app, "dist/daten/verfuegbarkeit/2026-q3.csv"), "utf8")).toBe(input.csv);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}, 30000);
