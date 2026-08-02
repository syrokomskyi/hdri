/*
<MODULE_CONTRACT>
<purpose>This module aggregates and exports various components and utilities for web scraping and data extraction, focusing on legal and content-related information.</purpose>
<non-goals>
  <item>This module does not handle the actual execution of web scraping tasks.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Added new signal groups for schema, legal, content, links, and social extraction.</item>
</CHANGE_SUMMARY>
*/

import type { CheerioAPI } from "cheerio";
export type { CheerioAPI };

// Core types and convenience wrapper
export * from "./core.js";
// Individual focused extractors (original 5)
export * from "./impressum.js";
// Factory-local Impressum contact details (PII — never bridged to observations)
export * from "./impressum-contacts.js";
export * from "./datenschutz.js";
export * from "./opening-hours.js";
export * from "./cookie-banner.js";
export * from "./copyright-year.js";
// New signal groups
export * from "./schema.js";
export * from "./legal.js";
export * from "./content.js";
export * from "./links.js";
export * from "./social.js";
