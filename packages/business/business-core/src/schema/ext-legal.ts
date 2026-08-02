import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const extImpressum = sqliteTable(
  "ext_impressum",
  {
    contentSha256: text("content_sha256").primaryKey(),
    extractorVer: text("extractor_ver").notNull(),
    present: integer("present").notNull(),
    url: text("url"),
    confidence: integer("confidence"),
    detectedPageSha256: text("detected_page_sha256"),
    extractedAt: integer("extracted_at").default(sql`(unixepoch())`),
  },
  (t) => ({
    verIdx: index("ext_impressum_ver_idx").on(t.extractorVer),
  }),
);

export const extDatenschutz = sqliteTable(
  "ext_datenschutz",
  {
    contentSha256: text("content_sha256").primaryKey(),
    extractorVer: text("extractor_ver").notNull(),
    present: integer("present").notNull(),
    url: text("url"),
    confidence: integer("confidence"),
    detectedPageSha256: text("detected_page_sha256"),
    extractedAt: integer("extracted_at").default(sql`(unixepoch())`),
  },
  (t) => ({
    verIdx: index("ext_datenschutz_ver_idx").on(t.extractorVer),
  }),
);

export const extBfsgPage = sqliteTable(
  "ext_bfsg_page",
  {
    contentSha256: text("content_sha256").primaryKey(),
    extractorVer: text("extractor_ver").notNull(),
    present: integer("present").notNull(),
    url: text("url"),
    confidence: integer("confidence"),
    detectedPageSha256: text("detected_page_sha256"),
    extractedAt: integer("extracted_at").default(sql`(unixepoch())`),
  },
  (t) => ({
    verIdx: index("ext_bfsg_page_ver_idx").on(t.extractorVer),
  }),
);

export const extAgbPage = sqliteTable(
  "ext_agb_page",
  {
    contentSha256: text("content_sha256").primaryKey(),
    extractorVer: text("extractor_ver").notNull(),
    present: integer("present").notNull(),
    url: text("url"),
    confidence: integer("confidence"),
    detectedPageSha256: text("detected_page_sha256"),
    extractedAt: integer("extracted_at").default(sql`(unixepoch())`),
  },
  (t) => ({
    verIdx: index("ext_agb_page_ver_idx").on(t.extractorVer),
  }),
);

export const extWiderrufPage = sqliteTable(
  "ext_widerruf_page",
  {
    contentSha256: text("content_sha256").primaryKey(),
    extractorVer: text("extractor_ver").notNull(),
    present: integer("present").notNull(),
    url: text("url"),
    confidence: integer("confidence"),
    detectedPageSha256: text("detected_page_sha256"),
    extractedAt: integer("extracted_at").default(sql`(unixepoch())`),
  },
  (t) => ({
    verIdx: index("ext_widerruf_page_ver_idx").on(t.extractorVer),
  }),
);

export const extVersandPage = sqliteTable(
  "ext_versand_page",
  {
    contentSha256: text("content_sha256").primaryKey(),
    extractorVer: text("extractor_ver").notNull(),
    present: integer("present").notNull(),
    url: text("url"),
    confidence: integer("confidence"),
    detectedPageSha256: text("detected_page_sha256"),
    extractedAt: integer("extracted_at").default(sql`(unixepoch())`),
  },
  (t) => ({
    verIdx: index("ext_versand_page_ver_idx").on(t.extractorVer),
  }),
);

export const extTeamPage = sqliteTable(
  "ext_team_page",
  {
    contentSha256: text("content_sha256").primaryKey(),
    extractorVer: text("extractor_ver").notNull(),
    present: integer("present").notNull(),
    url: text("url"),
    confidence: integer("confidence"),
    detectedPageSha256: text("detected_page_sha256"),
    extractedAt: integer("extracted_at").default(sql`(unixepoch())`),
  },
  (t) => ({
    verIdx: index("ext_team_page_ver_idx").on(t.extractorVer),
  }),
);
