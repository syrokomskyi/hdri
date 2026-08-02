import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const extOpeningHours = sqliteTable(
  "ext_opening_hours",
  {
    contentSha256: text("content_sha256").primaryKey(),
    extractorVer: text("extractor_ver").notNull(),
    text: text("text"),
    source: text("source"),
    confidence: integer("confidence"),
    extractedAt: integer("extracted_at").default(sql`(unixepoch())`),
  },
  (t) => ({
    verIdx: index("ext_opening_hours_ver_idx").on(t.extractorVer),
  }),
);

export const extCopyrightYear = sqliteTable(
  "ext_copyright_year",
  {
    contentSha256: text("content_sha256").primaryKey(),
    extractorVer: text("extractor_ver").notNull(),
    year: integer("year"),
    extractedAt: integer("extracted_at").default(sql`(unixepoch())`),
  },
  (t) => ({
    verIdx: index("ext_copyright_year_ver_idx").on(t.extractorVer),
  }),
);

export const extCookieBanner = sqliteTable(
  "ext_cookie_banner",
  {
    contentSha256: text("content_sha256").primaryKey(),
    extractorVer: text("extractor_ver").notNull(),
    present: integer("present").notNull(),
    confidence: integer("confidence"),
    quality: text("quality"),
    extractedAt: integer("extracted_at").default(sql`(unixepoch())`),
  },
  (t) => ({
    verIdx: index("ext_cookie_banner_ver_idx").on(t.extractorVer),
  }),
);

// FACTORY-LOCAL PII: deliberately NOT in EXT_SIGNAL_MAP.
export const extImpressumContacts = sqliteTable(
  "ext_impressum_contacts",
  {
    contentSha256: text("content_sha256").primaryKey(),
    extractorVer: text("extractor_ver").notNull(),
    companyName: text("company_name"),
    personNames: text("person_names"),
    street: text("street"),
    postalCode: text("postal_code"),
    city: text("city"),
    phone: text("phone"),
    email: text("email"),
    vatId: text("vat_id"),
    extractedAt: integer("extracted_at").default(sql`(unixepoch())`),
  },
  (t) => ({
    verIdx: index("ext_impressum_contacts_ver_idx").on(t.extractorVer),
  }),
);
