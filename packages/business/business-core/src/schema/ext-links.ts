import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const extLinkHandelsregister = sqliteTable(
  "ext_link_handelsregister",
  {
    contentSha256: text("content_sha256").primaryKey(),
    extractorVer: text("extractor_ver").notNull(),
    present: integer("present").notNull(),
    url: text("url"),
    extractedAt: integer("extracted_at").default(sql`(unixepoch())`),
  },
  (t) => ({
    verIdx: index("ext_link_handelsregister_ver_idx").on(t.extractorVer),
  }),
);

export const extLinkUnternehmensregister = sqliteTable(
  "ext_link_unternehmensregister",
  {
    contentSha256: text("content_sha256").primaryKey(),
    extractorVer: text("extractor_ver").notNull(),
    present: integer("present").notNull(),
    url: text("url"),
    extractedAt: integer("extracted_at").default(sql`(unixepoch())`),
  },
  (t) => ({
    verIdx: index("ext_link_unternehmensregister_ver_idx").on(t.extractorVer),
  }),
);

export const extLinkKammern = sqliteTable(
  "ext_link_kammern",
  {
    contentSha256: text("content_sha256").primaryKey(),
    extractorVer: text("extractor_ver").notNull(),
    present: integer("present").notNull(),
    url: text("url"),
    extractedAt: integer("extracted_at").default(sql`(unixepoch())`),
  },
  (t) => ({
    verIdx: index("ext_link_kammern_ver_idx").on(t.extractorVer),
  }),
);

export const extLinkIndustryCatalogs = sqliteTable(
  "ext_link_industry_catalogs",
  {
    contentSha256: text("content_sha256").primaryKey(),
    extractorVer: text("extractor_ver").notNull(),
    present: integer("present").notNull(),
    url: text("url"),
    extractedAt: integer("extracted_at").default(sql`(unixepoch())`),
  },
  (t) => ({
    verIdx: index("ext_link_industry_catalogs_ver_idx").on(t.extractorVer),
  }),
);

export const extLinkGoogleBusiness = sqliteTable(
  "ext_link_google_business",
  {
    contentSha256: text("content_sha256").primaryKey(),
    extractorVer: text("extractor_ver").notNull(),
    present: integer("present").notNull(),
    url: text("url"),
    extractedAt: integer("extracted_at").default(sql`(unixepoch())`),
  },
  (t) => ({
    verIdx: index("ext_link_google_business_ver_idx").on(t.extractorVer),
  }),
);
