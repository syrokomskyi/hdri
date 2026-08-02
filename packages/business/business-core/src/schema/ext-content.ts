import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const extContactForm = sqliteTable(
  "ext_contact_form",
  {
    contentSha256: text("content_sha256").primaryKey(),
    extractorVer: text("extractor_ver").notNull(),
    present: integer("present").notNull(),
    confidence: integer("confidence"),
    extractedAt: integer("extracted_at").default(sql`(unixepoch())`),
  },
  (t) => ({
    verIdx: index("ext_contact_form_ver_idx").on(t.extractorVer),
  }),
);

export const extPortfolio = sqliteTable(
  "ext_portfolio",
  {
    contentSha256: text("content_sha256").primaryKey(),
    extractorVer: text("extractor_ver").notNull(),
    present: integer("present").notNull(),
    confidence: integer("confidence"),
    extractedAt: integer("extracted_at").default(sql`(unixepoch())`),
  },
  (t) => ({
    verIdx: index("ext_portfolio_ver_idx").on(t.extractorVer),
  }),
);

export const extMap = sqliteTable(
  "ext_map",
  {
    contentSha256: text("content_sha256").primaryKey(),
    extractorVer: text("extractor_ver").notNull(),
    present: integer("present").notNull(),
    confidence: integer("confidence"),
    extractedAt: integer("extracted_at").default(sql`(unixepoch())`),
  },
  (t) => ({
    verIdx: index("ext_map_ver_idx").on(t.extractorVer),
  }),
);

export const extTestimonials = sqliteTable(
  "ext_testimonials",
  {
    contentSha256: text("content_sha256").primaryKey(),
    extractorVer: text("extractor_ver").notNull(),
    present: integer("present").notNull(),
    confidence: integer("confidence"),
    extractedAt: integer("extracted_at").default(sql`(unixepoch())`),
  },
  (t) => ({
    verIdx: index("ext_testimonials_ver_idx").on(t.extractorVer),
  }),
);

export const extCertifications = sqliteTable(
  "ext_certifications",
  {
    contentSha256: text("content_sha256").primaryKey(),
    extractorVer: text("extractor_ver").notNull(),
    present: integer("present").notNull(),
    confidence: integer("confidence"),
    extractedAt: integer("extracted_at").default(sql`(unixepoch())`),
  },
  (t) => ({
    verIdx: index("ext_certifications_ver_idx").on(t.extractorVer),
  }),
);

export const extAwards = sqliteTable(
  "ext_awards",
  {
    contentSha256: text("content_sha256").primaryKey(),
    extractorVer: text("extractor_ver").notNull(),
    present: integer("present").notNull(),
    confidence: integer("confidence"),
    extractedAt: integer("extracted_at").default(sql`(unixepoch())`),
  },
  (t) => ({
    verIdx: index("ext_awards_ver_idx").on(t.extractorVer),
  }),
);

export const extMemberships = sqliteTable(
  "ext_memberships",
  {
    contentSha256: text("content_sha256").primaryKey(),
    extractorVer: text("extractor_ver").notNull(),
    present: integer("present").notNull(),
    confidence: integer("confidence"),
    extractedAt: integer("extracted_at").default(sql`(unixepoch())`),
  },
  (t) => ({
    verIdx: index("ext_memberships_ver_idx").on(t.extractorVer),
  }),
);

export const extMeister = sqliteTable(
  "ext_meister",
  {
    contentSha256: text("content_sha256").primaryKey(),
    extractorVer: text("extractor_ver").notNull(),
    present: integer("present").notNull(),
    confidence: integer("confidence"),
    extractedAt: integer("extracted_at").default(sql`(unixepoch())`),
  },
  (t) => ({
    verIdx: index("ext_meister_ver_idx").on(t.extractorVer),
  }),
);

export const extCaseStudies = sqliteTable(
  "ext_case_studies",
  {
    contentSha256: text("content_sha256").primaryKey(),
    extractorVer: text("extractor_ver").notNull(),
    present: integer("present").notNull(),
    confidence: integer("confidence"),
    extractedAt: integer("extracted_at").default(sql`(unixepoch())`),
  },
  (t) => ({
    verIdx: index("ext_case_studies_ver_idx").on(t.extractorVer),
  }),
);
