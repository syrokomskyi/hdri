import { describe, it, expect } from 'vitest';
import { extractDatenschutz } from '../datenschutz.js';

const BASE = 'https://example.de';

describe('extractDatenschutz', () => {
  it('detects /datenschutz link by href', () => {
    const html = `<html><body><a href="/datenschutz">Datenschutz</a></body></html>`;
    const r = extractDatenschutz(html, BASE);
    expect(r.present).toBe(true);
    expect(r.url).toBe('https://example.de/datenschutz');
    expect(r.confidence).toBeGreaterThanOrEqual(90);
  });

  it('detects /privacy-policy link', () => {
    const html = `<html><body><a href="/privacy-policy">Privacy</a></body></html>`;
    const r = extractDatenschutz(html, BASE);
    expect(r.present).toBe(true);
    expect(r.confidence).toBeGreaterThanOrEqual(90);
  });

  it('detects link text "Datenschutzerklärung"', () => {
    const html = `<html><body><a href="/legal">Datenschutzerklärung</a></body></html>`;
    const r = extractDatenschutz(html, BASE);
    expect(r.present).toBe(true);
  });

  it('returns false on page with no privacy link', () => {
    const html = `<html><body><a href="/kontakt">Kontakt</a></body></html>`;
    const r = extractDatenschutz(html, BASE);
    expect(r.present).toBe(false);
    expect(r.url).toBeNull();
    expect(r.confidence).toBeNull();
  });

  it('returns false on empty HTML', () => {
    const r = extractDatenschutz('', BASE);
    expect(r.present).toBe(false);
  });

  it('word "cookie" alone triggers low confidence match', () => {
    const html = `<html><body><a href="/cookies">Cookie settings</a></body></html>`;
    const r = extractDatenschutz(html, BASE);
    expect(r.present).toBe(true);
    expect(r.confidence).toBeLessThan(90);
  });
});
