import { findExternalLink, type LinkPresenceResult } from './helpers.js';
import type { CheerioAPI } from 'cheerio';

const makeSocialExtractor = (patterns: string[]) =>
  (html: string | CheerioAPI): LinkPresenceResult => {
    const url = findExternalLink(html, patterns);
    return { present: url !== null, url, confidence: url ? 95 : null };
  };

export const extractSocialFacebook  = makeSocialExtractor(['facebook.com', 'fb.com', 'fb.me']);
export const extractSocialInstagram = makeSocialExtractor(['instagram.com']);
export const extractSocialYoutube   = makeSocialExtractor(['youtube.com', 'youtu.be']);
export const extractSocialXing      = makeSocialExtractor(['xing.com']);
export const extractSocialLinkedin  = makeSocialExtractor(['linkedin.com']);
export const extractSocialTiktok    = makeSocialExtractor(['tiktok.com']);
export const extractSocialWhatsapp  = makeSocialExtractor(['whatsapp.com', 'wa.me', 'api.whatsapp.com']);
export const extractSocialPinterest = makeSocialExtractor(['pinterest.com', 'pinterest.de']);
export const extractSocialTwitter   = makeSocialExtractor(['twitter.com', 'x.com']);
