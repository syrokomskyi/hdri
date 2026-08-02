import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const extSocialFacebook = sqliteTable(
  "ext_social_facebook",
  {
    contentSha256: text("content_sha256").primaryKey(),
    extractorVer: text("extractor_ver").notNull(),
    present: integer("present").notNull(),
    url: text("url"),
    extractedAt: integer("extracted_at").default(sql`(unixepoch())`),
  },
  (t) => ({
    verIdx: index("ext_social_facebook_ver_idx").on(t.extractorVer),
  }),
);

export const extSocialInstagram = sqliteTable(
  "ext_social_instagram",
  {
    contentSha256: text("content_sha256").primaryKey(),
    extractorVer: text("extractor_ver").notNull(),
    present: integer("present").notNull(),
    url: text("url"),
    extractedAt: integer("extracted_at").default(sql`(unixepoch())`),
  },
  (t) => ({
    verIdx: index("ext_social_instagram_ver_idx").on(t.extractorVer),
  }),
);

export const extSocialYoutube = sqliteTable(
  "ext_social_youtube",
  {
    contentSha256: text("content_sha256").primaryKey(),
    extractorVer: text("extractor_ver").notNull(),
    present: integer("present").notNull(),
    url: text("url"),
    extractedAt: integer("extracted_at").default(sql`(unixepoch())`),
  },
  (t) => ({
    verIdx: index("ext_social_youtube_ver_idx").on(t.extractorVer),
  }),
);

export const extSocialXing = sqliteTable(
  "ext_social_xing",
  {
    contentSha256: text("content_sha256").primaryKey(),
    extractorVer: text("extractor_ver").notNull(),
    present: integer("present").notNull(),
    url: text("url"),
    extractedAt: integer("extracted_at").default(sql`(unixepoch())`),
  },
  (t) => ({
    verIdx: index("ext_social_xing_ver_idx").on(t.extractorVer),
  }),
);

export const extSocialLinkedin = sqliteTable(
  "ext_social_linkedin",
  {
    contentSha256: text("content_sha256").primaryKey(),
    extractorVer: text("extractor_ver").notNull(),
    present: integer("present").notNull(),
    url: text("url"),
    extractedAt: integer("extracted_at").default(sql`(unixepoch())`),
  },
  (t) => ({
    verIdx: index("ext_social_linkedin_ver_idx").on(t.extractorVer),
  }),
);

export const extSocialTiktok = sqliteTable(
  "ext_social_tiktok",
  {
    contentSha256: text("content_sha256").primaryKey(),
    extractorVer: text("extractor_ver").notNull(),
    present: integer("present").notNull(),
    url: text("url"),
    extractedAt: integer("extracted_at").default(sql`(unixepoch())`),
  },
  (t) => ({
    verIdx: index("ext_social_tiktok_ver_idx").on(t.extractorVer),
  }),
);

export const extSocialWhatsapp = sqliteTable(
  "ext_social_whatsapp",
  {
    contentSha256: text("content_sha256").primaryKey(),
    extractorVer: text("extractor_ver").notNull(),
    present: integer("present").notNull(),
    url: text("url"),
    extractedAt: integer("extracted_at").default(sql`(unixepoch())`),
  },
  (t) => ({
    verIdx: index("ext_social_whatsapp_ver_idx").on(t.extractorVer),
  }),
);

export const extSocialPinterest = sqliteTable(
  "ext_social_pinterest",
  {
    contentSha256: text("content_sha256").primaryKey(),
    extractorVer: text("extractor_ver").notNull(),
    present: integer("present").notNull(),
    url: text("url"),
    extractedAt: integer("extracted_at").default(sql`(unixepoch())`),
  },
  (t) => ({
    verIdx: index("ext_social_pinterest_ver_idx").on(t.extractorVer),
  }),
);

export const extSocialTwitter = sqliteTable(
  "ext_social_twitter",
  {
    contentSha256: text("content_sha256").primaryKey(),
    extractorVer: text("extractor_ver").notNull(),
    present: integer("present").notNull(),
    url: text("url"),
    extractedAt: integer("extracted_at").default(sql`(unixepoch())`),
  },
  (t) => ({
    verIdx: index("ext_social_twitter_ver_idx").on(t.extractorVer),
  }),
);
