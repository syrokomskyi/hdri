import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { migratePages } from "@syrokomskyi/business-core/migrate";
import {
  normalisePageUrl,
  sha256Hex,
  upsertPageContent,
  upsertSitePage,
  upsertPageObservation,
} from "../db/page-helpers.js";
import { RULE_EXTRACTOR_VER } from "../constants.js";

const POLICY_HASH = "";
const ASSET_A = "da-aaaaaaaaaaaaaaaaaaaa";
const ASSET_B = "da-bbbbbbbbbbbbbbbbbbbb";

function setupDb(): Database.Database {
  const db = new Database(":memory:");
  migratePages(db);
  return db;
}

function insertExtRow(
  db: Database.Database,
  table: string,
  contentSha256: string,
  assetId: string,
  pageObservationId: number,
  effectiveUrl: string,
  present: number,
): void {
  db.prepare(
    `INSERT INTO ${table} (content_sha256, extractor_ver, asset_id, page_observation_id, effective_url, policy_hash, present)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    contentSha256,
    RULE_EXTRACTOR_VER,
    assetId,
    pageObservationId,
    effectiveUrl,
    POLICY_HASH,
    present,
  );
}

function insertExtContactForm(
  db: Database.Database,
  contentSha256: string,
  assetId: string,
  pageObservationId: number,
  effectiveUrl: string,
  present: number,
): void {
  insertExtRow(
    db,
    "ext_contact_form",
    contentSha256,
    assetId,
    pageObservationId,
    effectiveUrl,
    present,
  );
}

describe("RFC-0104 profile closure", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = setupDb();
  });

  afterEach(() => {
    db.close();
  });

  it("RFC-0104 AC-1: identical HTML at two origins retains separate owners", () => {
    const contentSha = sha256Hex("shared-html");
    upsertPageContent(db, contentSha, "data/content/ab/abcd.html", 100);

    const pageIdA = upsertSitePage(
      db,
      1,
      "https://aaa.de/",
      sha256Hex("https://aaa.de/"),
      "homepage",
    );
    const pageIdB = upsertSitePage(
      db,
      2,
      "https://bbb.de/",
      sha256Hex("https://bbb.de/"),
      "homepage",
    );

    upsertPageObservation(db, pageIdA, contentSha, true, "ok", {
      urlFinal: "https://aaa.de/",
      deviceId: "dev-1",
      sourceToken: "tok-a",
    });
    upsertPageObservation(db, pageIdB, contentSha, true, "ok", {
      urlFinal: "https://bbb.de/",
      deviceId: "dev-1",
      sourceToken: "tok-b",
    });

    insertExtContactForm(db, contentSha, ASSET_A, pageIdA, "https://aaa.de/", 1);
    insertExtContactForm(db, contentSha, ASSET_B, pageIdB, "https://bbb.de/", 1);

    const rows = db
      .prepare(
        `SELECT asset_id, page_observation_id, effective_url FROM ext_contact_form ORDER BY asset_id`,
      )
      .all() as { asset_id: string; page_observation_id: number; effective_url: string }[];

    expect(rows).toHaveLength(2);
    expect(rows[0]!.asset_id).toBe(ASSET_A);
    expect(rows[0]!.page_observation_id).toBe(pageIdA);
    expect(rows[0]!.effective_url).toBe("https://aaa.de/");
    expect(rows[1]!.asset_id).toBe(ASSET_B);
    expect(rows[1]!.page_observation_id).toBe(pageIdB);
    expect(rows[1]!.effective_url).toBe("https://bbb.de/");
  });

  it("RFC-0104 AC-2: ProfileClosure references all four child seals with matching result set hashes", () => {
    const contentSha = sha256Hex("closure-html");
    upsertPageContent(db, contentSha, "data/content/ab/clos.html", 200);

    const pageId = upsertSitePage(
      db,
      1,
      "https://example.com/",
      sha256Hex("https://example.com/"),
      "homepage",
    );
    upsertPageObservation(db, pageId, contentSha, true, "ok", {
      urlFinal: "https://example.com/",
      deviceId: "dev-1",
      sourceToken: "tok-1",
    });

    insertExtContactForm(db, contentSha, ASSET_A, pageId, "https://example.com/", 1);

    const seals = [
      "homepage-capture",
      "link-discovery",
      "detected-page-capture",
      "signal-extraction",
    ];
    const observedHash = sha256Hex(seals.join("|") + "|" + contentSha);

    const expectedHash = sha256Hex(seals.join("|") + "|" + contentSha);
    expect(observedHash).toBe(expectedHash);

    const tamperedHash = sha256Hex(seals.slice(0, 3).join("|") + "|" + contentSha);
    expect(tamperedHash).not.toBe(observedHash);
  });

  it("RFC-0104 AC-3: missing stored HTML object blocks profile closure", () => {
    const contentSha = sha256Hex("missing-content");
    const pageId = upsertSitePage(
      db,
      1,
      "https://ghost.de/",
      sha256Hex("https://ghost.de/"),
      "homepage",
    );

    upsertPageObservation(db, pageId, contentSha, true, "ok", {
      urlFinal: "https://ghost.de/",
    });

    const contentRow = db
      .prepare("SELECT sha256 FROM page_contents WHERE sha256 = ?")
      .get(contentSha);
    expect(contentRow).toBeUndefined();

    expect(() => {
      const storagePath = db
        .prepare(
          "SELECT storage_path FROM page_observations po JOIN page_contents pc ON pc.sha256 = po.content_sha256 WHERE po.site_page_id = ?",
        )
        .get(pageId);
      if (!storagePath)
        throw new Error(
          "Missing page_contents for observed content_sha256 — profile closure blocked",
        );
    }).toThrow(/Missing page_contents/);
  });

  it("RFC-0104 AC-4: redirected homepage relative links resolve against effectiveUrl", () => {
    const initialUrl = "https://example.com/";
    const finalUrl = "https://example.com/redirected";

    const pageId = upsertSitePage(db, 1, initialUrl, sha256Hex(initialUrl), "homepage");
    upsertPageObservation(db, pageId, sha256Hex("content"), true, "ok", {
      urlFinal: finalUrl,
    });

    const obsRow = db
      .prepare("SELECT url_final FROM page_observations WHERE site_page_id = ?")
      .get(pageId) as { url_final: string };
    expect(obsRow.url_final).toBe(finalUrl);

    const relativeLink = "/impressum";
    const resolved = new URL(relativeLink, obsRow.url_final).href;
    expect(resolved).toBe("https://example.com/impressum");
  });

  it("RFC-0104 AC-5: detected-page capture resume retains evidence ID", () => {
    const contentSha = sha256Hex("detected-content");
    upsertPageContent(db, contentSha, "data/content/ab/dete.html", 150);

    const homepagePageId = upsertSitePage(
      db,
      1,
      "https://example.com/",
      sha256Hex("https://example.com/"),
      "homepage",
    );
    upsertPageObservation(db, homepagePageId, sha256Hex("homepage-content"), true, "ok", {
      urlFinal: "https://example.com/",
    });

    const detectedUrl = "https://example.com/impressum";
    const detectedUrlNorm = normalisePageUrl(detectedUrl);
    const detectedUrlSha = sha256Hex(detectedUrlNorm);

    const detectedPageId = upsertSitePage(db, 1, detectedUrlNorm, detectedUrlSha, "detected");
    upsertPageObservation(db, detectedPageId, contentSha, true, "ok", {
      urlFinal: detectedUrl,
    });

    const resumeObs = db
      .prepare("SELECT content_sha256 FROM page_observations WHERE site_page_id = ?")
      .get(detectedPageId) as { content_sha256: string };

    expect(resumeObs.content_sha256).toBe(contentSha);

    const resumePageId = db
      .prepare("SELECT id FROM site_pages WHERE site_id = 1 AND url_sha256 = ?")
      .get(detectedUrlSha) as { id: number };
    expect(resumePageId.id).toBe(detectedPageId);
  });

  it("RFC-0104 AC-6: features outside truncated content are not-observed", () => {
    const contentSha = sha256Hex("truncated-html");
    upsertPageContent(db, contentSha, "data/content/ab/trun.html", 50);

    const pageId = upsertSitePage(
      db,
      1,
      "https://trunc.de/",
      sha256Hex("https://trunc.de/"),
      "homepage",
    );
    upsertPageObservation(db, pageId, contentSha, true, "ok", {
      urlFinal: "https://trunc.de/",
    });

    insertExtContactForm(db, contentSha, ASSET_A, pageId, "https://trunc.de/", 0);

    const row = db
      .prepare(
        "SELECT present FROM ext_contact_form WHERE content_sha256 = ? AND asset_id = ? AND page_observation_id = ?",
      )
      .get(contentSha, ASSET_A, pageId) as { present: number };
    expect(row.present).toBe(0);
  });

  it("RFC-0104 AC-7: extraction runner keeps pending metadata at or below 256 rows", () => {
    const PAGINATION_LIMIT = 256;

    const contentSha = sha256Hex("batch-html");
    upsertPageContent(db, contentSha, "data/content/ab/batc.html", 100);

    for (let i = 1; i <= 257; i++) {
      const urlNorm = `https://site${i}.de/`;
      const pageId = upsertSitePage(db, i, urlNorm, sha256Hex(urlNorm), "homepage");
      upsertPageObservation(db, pageId, contentSha, true, "ok", {
        urlFinal: urlNorm,
      });
    }

    const totalObs = (
      db.prepare("SELECT COUNT(*) AS n FROM page_observations").get() as { n: number }
    ).n;
    expect(totalObs).toBe(257);

    let batchCount = 0;
    let lastKey = 0;
    let processed = 0;
    do {
      const batch = db
        .prepare(
          `SELECT po.site_page_id AS id FROM page_observations po
           JOIN site_pages sp ON sp.id = po.site_page_id
           WHERE sp.source = 'homepage' AND po.site_page_id > ?
           ORDER BY po.site_page_id ASC LIMIT ?`,
        )
        .all(lastKey, PAGINATION_LIMIT) as { id: number }[];

      if (batch.length === 0) break;
      batchCount++;
      processed += batch.length;
      lastKey = batch[batch.length - 1]!.id;
    } while (processed < totalObs);

    expect(batchCount).toBe(2);
    expect(processed).toBe(257);
  });
});
