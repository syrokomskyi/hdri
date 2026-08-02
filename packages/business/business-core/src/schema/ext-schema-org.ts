import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const extSchemaLocalBusiness = sqliteTable(
  "ext_schema_local_business",
  {
    contentSha256: text("content_sha256").primaryKey(),
    extractorVer: text("extractor_ver").notNull(),
    present: integer("present").notNull(),
    extractedAt: integer("extracted_at").default(sql`(unixepoch())`),
  },
  (t) => ({
    verIdx: index("ext_schema_local_business_ver_idx").on(t.extractorVer),
  }),
);

export const extSchemaService = sqliteTable(
  "ext_schema_service",
  {
    contentSha256: text("content_sha256").primaryKey(),
    extractorVer: text("extractor_ver").notNull(),
    present: integer("present").notNull(),
    extractedAt: integer("extracted_at").default(sql`(unixepoch())`),
  },
  (t) => ({
    verIdx: index("ext_schema_service_ver_idx").on(t.extractorVer),
  }),
);

export const extSchemaFaq = sqliteTable(
  "ext_schema_faq",
  {
    contentSha256: text("content_sha256").primaryKey(),
    extractorVer: text("extractor_ver").notNull(),
    present: integer("present").notNull(),
    extractedAt: integer("extracted_at").default(sql`(unixepoch())`),
  },
  (t) => ({
    verIdx: index("ext_schema_faq_ver_idx").on(t.extractorVer),
  }),
);

export const extSchemaHowTo = sqliteTable(
  "ext_schema_how_to",
  {
    contentSha256: text("content_sha256").primaryKey(),
    extractorVer: text("extractor_ver").notNull(),
    present: integer("present").notNull(),
    extractedAt: integer("extracted_at").default(sql`(unixepoch())`),
  },
  (t) => ({
    verIdx: index("ext_schema_how_to_ver_idx").on(t.extractorVer),
  }),
);

export const extSchemaBreadcrumb = sqliteTable(
  "ext_schema_breadcrumb",
  {
    contentSha256: text("content_sha256").primaryKey(),
    extractorVer: text("extractor_ver").notNull(),
    present: integer("present").notNull(),
    extractedAt: integer("extracted_at").default(sql`(unixepoch())`),
  },
  (t) => ({
    verIdx: index("ext_schema_breadcrumb_ver_idx").on(t.extractorVer),
  }),
);

export const extSchemaOpeningHoursSpec = sqliteTable(
  "ext_schema_opening_hours_spec",
  {
    contentSha256: text("content_sha256").primaryKey(),
    extractorVer: text("extractor_ver").notNull(),
    present: integer("present").notNull(),
    extractedAt: integer("extracted_at").default(sql`(unixepoch())`),
  },
  (t) => ({
    verIdx: index("ext_schema_opening_hours_spec_ver_idx").on(t.extractorVer),
  }),
);

export const extSchemaPerson = sqliteTable(
  "ext_schema_person",
  {
    contentSha256: text("content_sha256").primaryKey(),
    extractorVer: text("extractor_ver").notNull(),
    present: integer("present").notNull(),
    extractedAt: integer("extracted_at").default(sql`(unixepoch())`),
  },
  (t) => ({
    verIdx: index("ext_schema_person_ver_idx").on(t.extractorVer),
  }),
);

export const extSchemaReview = sqliteTable(
  "ext_schema_review",
  {
    contentSha256: text("content_sha256").primaryKey(),
    extractorVer: text("extractor_ver").notNull(),
    present: integer("present").notNull(),
    extractedAt: integer("extracted_at").default(sql`(unixepoch())`),
  },
  (t) => ({
    verIdx: index("ext_schema_review_ver_idx").on(t.extractorVer),
  }),
);

export const extSchemaProduct = sqliteTable(
  "ext_schema_product",
  {
    contentSha256: text("content_sha256").primaryKey(),
    extractorVer: text("extractor_ver").notNull(),
    present: integer("present").notNull(),
    extractedAt: integer("extracted_at").default(sql`(unixepoch())`),
  },
  (t) => ({
    verIdx: index("ext_schema_product_ver_idx").on(t.extractorVer),
  }),
);
