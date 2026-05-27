import type { CheerioAPI } from 'cheerio';
export type { CheerioAPI };

// Core types and convenience wrapper
export * from './core.js';
// Individual focused extractors (original 5)
export * from './impressum.js';
export * from './datenschutz.js';
export * from './opening-hours.js';
export * from './cookie-banner.js';
export * from './copyright-year.js';
// New signal groups
export * from './schema.js';
export * from './legal.js';
export * from './content.js';
export * from './links.js';
export * from './social.js';
