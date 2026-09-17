/*
<MODULE_CONTRACT>
  <purpose>Generate the deterministic rehearsal fixture corpus: a SQLite corpus of synthetic sites and pages plus a signed fixture manifest consumed by the production qualification adapters.</purpose>
  <non-goals>
    <item>Does not produce operational evidence — the corpus is fixture-class material only.</item>
    <item>Does not replace real source admission; it supplies the transport-boundary inputs the adapters consume.</item>
  </non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0115 C4: deterministic corpus generator for the production rehearsal profile.</item>
</CHANGE_SUMMARY>
*/
// @ai-invariant: Corpus bytes are a pure function of (seed, targets); regeneration must reproduce identical digests.

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import { fixtureSigningKey } from "../run/qualification/adapters/common.js";

const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const targets = Number(arg("--targets"));
const out = arg("--out");
const seed = Number(arg("--seed") ?? "115");
if (![1000, 10_000, 50_000, 200_000].includes(targets))
  throw new Error("--targets must be one of 1000|10000|50000|200000");
if (!out) throw new Error("--out <fixture-dir> is required");
if (!Number.isSafeInteger(seed) || seed <= 0) throw new Error("--seed must be a positive integer");

const FROZEN_TIME = "2026-09-17T00:00:00.000Z";
const PERIOD = "2026-q3";

const BUNDESLAENDER = [
  "Baden-Württemberg",
  "Bayern",
  "Berlin",
  "Brandenburg",
  "Bremen",
  "Hamburg",
  "Hessen",
  "Mecklenburg-Vorpommern",
  "Niedersachsen",
  "Nordrhein-Westfalen",
  "Rheinland-Pfalz",
  "Saarland",
  "Sachsen",
  "Sachsen-Anhalt",
  "Schleswig-Holstein",
  "Thüringen",
] as const;
const DESTATIS_GROUPS = [
  "Bauhauptgewerbe",
  "Ausbaugewerbe",
  "Kfz-Gewerbe",
  "Metallgewerbe",
  "Elektrogewerbe",
  "Holzgewerbe",
  "Lebensmittelgewerbe",
  "Gesundheitsgewerbe",
] as const;

const domain = (seq: number) => `site-${String(seq).padStart(6, "0")}.fix.test`;

function homePage(seq: number, dom: string): string {
  const parts = [
    `<!doctype html><html lang="de"><head><meta charset="utf-8">`,
    `<title>Handwerksbetrieb ${dom}</title>`,
    `<meta name="description" content="Handwerksbetrieb ${seq} in Deutschland">`,
    `<link rel="canonical" href="https://${dom}/">`,
  ];
  if (seq % 5 === 0)
    parts.push(
      `<script type="application/ld+json">${JSON.stringify({
        "@context": "https://schema.org",
        "@type": "LocalBusiness",
        name: `Handwerksbetrieb ${seq}`,
        openingHours: "Mo-Fr 08:00-17:00",
      })}</script>`,
    );
  parts.push(`</head><body><h1>Handwerksbetrieb ${seq}</h1><nav>`);
  if (seq % 7 !== 0) parts.push(`<a href="/impressum">Impressum</a>`);
  if (seq % 5 !== 0) parts.push(`<a href="/datenschutz">Datenschutz</a>`);
  if (seq % 3 === 0) parts.push(`<a href="/kontakt">Kontakt</a>`);
  parts.push(`</nav>`);
  if (seq % 2 === 0) parts.push(`<p>Tel: +49 30 ${String(1000000 + (seq % 8999999))}</p>`);
  if (seq % 4 === 0) parts.push(`<p>E-Mail: info@${dom}</p>`);
  if (seq % 4 === 0)
    parts.push(`<div id="cookie-banner"><p>Wir verwenden Cookies.</p><button>OK</button></div>`);
  if (seq % 6 === 0)
    parts.push(
      `<a href="https://facebook.com/${dom}">Facebook</a><a href="https://instagram.com/${dom}">Instagram</a>`,
    );
  parts.push(`<footer>© 2020–2026 Handwerksbetrieb ${seq}</footer></body></html>`);
  return parts.join("");
}

const impressumPage = (seq: number, dom: string): string =>
  `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Impressum – ${dom}</title></head>` +
  `<body><h1>Impressum</h1><p>Handwerksbetrieb ${seq} GmbH<br>Musterstraße ${seq % 200}<br>` +
  `${String(10000 + (seq % 89999))} Musterstadt</p><p>Tel: +49 30 ${String(1000000 + (seq % 8999999))}<br>` +
  `E-Mail: impressum@${dom}</p><p>Geschäftsführer: Max Mustermann ${seq}</p></body></html>`;

const datenschutzPage = (seq: number, dom: string): string =>
  `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Datenschutz – ${dom}</title></head>` +
  `<body><h1>Datenschutzerklärung</h1><p>Verantwortlicher: Handwerksbetrieb ${seq}, ` +
  `datenschutz@${dom}</p><p>Wir verarbeiten personenbezogene Daten gemäß DSGVO.</p></body></html>`;

const contactPage = (seq: number, dom: string): string =>
  `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Kontakt – ${dom}</title></head>` +
  `<body><h1>Kontakt</h1><form action="/send" method="post"><input name="email"></form>` +
  `<p>Tel: +49 30 ${String(1000000 + (seq % 8999999))}</p></body></html>`;

const outDir = path.resolve(out);
await fs.mkdir(outDir, { recursive: true });
const corpusPath = path.join(outDir, "corpus.sqlite");
await fs.rm(corpusPath, { force: true });

const db = new Database(corpusPath);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE sites (
    seq INTEGER PRIMARY KEY,
    domain TEXT NOT NULL UNIQUE,
    bundesland TEXT NOT NULL,
    destatis_group TEXT NOT NULL,
    live INTEGER NOT NULL,
    http_status INTEGER NOT NULL,
    redirect_to TEXT
  );
  CREATE TABLE pages (
    site_seq INTEGER NOT NULL,
    kind TEXT NOT NULL,
    html BLOB NOT NULL,
    PRIMARY KEY (site_seq, kind)
  ) WITHOUT ROWID;
  CREATE TABLE frame_cells (
    bundesland TEXT NOT NULL,
    destatis_group TEXT NOT NULL,
    companies INTEGER NOT NULL,
    PRIMARY KEY (bundesland, destatis_group)
  ) WITHOUT ROWID;
`);

const insertSite = db.prepare(
  "INSERT INTO sites(seq, domain, bundesland, destatis_group, live, http_status, redirect_to) VALUES (?, ?, ?, ?, ?, ?, ?)",
);
const insertPage = db.prepare("INSERT INTO pages(site_seq, kind, html) VALUES (?, ?, ?)");
const insertCell = db.prepare(
  "INSERT INTO frame_cells(bundesland, destatis_group, companies) VALUES (?, ?, ?)",
);

const generate = db.transaction(() => {
  for (let seq = 1; seq <= targets; seq++) {
    const dom = domain(seq);
    const live = seq % 97 === 0 ? 0 : 1;
    const httpStatus = live ? 200 : seq % 2 === 0 ? 503 : 0;
    const redirectTo = live && seq % 11 === 0 ? `www.${dom}` : null;
    insertSite.run(
      seq,
      dom,
      BUNDESLAENDER[seq % BUNDESLAENDER.length],
      DESTATIS_GROUPS[seq % DESTATIS_GROUPS.length],
      live,
      httpStatus,
      redirectTo,
    );
    if (!live) continue;
    insertPage.run(seq, "home", Buffer.from(homePage(seq, dom), "utf8"));
    if (seq % 7 !== 0)
      insertPage.run(seq, "impressum", Buffer.from(impressumPage(seq, dom), "utf8"));
    if (seq % 5 !== 0)
      insertPage.run(seq, "datenschutz", Buffer.from(datenschutzPage(seq, dom), "utf8"));
    if (seq % 3 === 0) insertPage.run(seq, "contact", Buffer.from(contactPage(seq, dom), "utf8"));
  }
  for (const land of BUNDESLAENDER)
    for (const [gi, group] of DESTATIS_GROUPS.entries())
      insertCell.run(land, group, 500 + ((land.length * 31 + gi * 17) % 4000));
});
generate();
// The corpus is mounted read-only in the sandbox — a WAL-mode database cannot
// be opened readonly without writable -shm/-wal sidecars. Checkpoint, return to
// rollback journal mode, then vacuum so the file is self-contained.
db.exec("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode = DELETE; VACUUM;");
db.close();

const corpusBytes = await fs.readFile(corpusPath);
const manifest = {
  schema: "hdri-rehearsal-fixture@1",
  seed,
  targets,
  frozenTime: FROZEN_TIME,
  period: PERIOD,
  runId: `rehearsal-${seed}-${targets}`,
  signingKey: {
    ...fixtureSigningKey(seed),
    signingKeyId: "rehearsal-fixture",
    collectorId: "rehearsal-fixture",
  },
  files: [
    {
      uri: "corpus.sqlite",
      bytes: corpusBytes.length,
      sha256: createHash("sha256").update(corpusBytes).digest("hex"),
    },
  ],
};
await fs.writeFile(
  path.join(outDir, "fixture-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);
console.log(JSON.stringify({ fixtureRoot: outDir, targets, corpusBytes: corpusBytes.length }));
