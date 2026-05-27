import { describe, it, expect } from 'vitest';
import { extractImpressum } from '../impressum.js';

const BASE = 'https://example.de';

describe('extractImpressum', () => {
  it('detects a plain /impressum link', () => {
    const html = `<html><body><a href="/impressum">Impressum</a></body></html>`;
    const r = extractImpressum(html, BASE);
    expect(r.present).toBe(true);
    expect(r.url).toBe('https://example.de/impressum');
    expect(r.confidence).toBeGreaterThanOrEqual(90);
  });

  it('detects link text "Impressum" regardless of href', () => {
    const html = `<html><body><a href="/legal">Impressum</a></body></html>`;
    const r = extractImpressum(html, BASE);
    expect(r.present).toBe(true);
  });

  it('detects /imprint href', () => {
    const html = `<html><body><a href="/imprint">Legal notice</a></body></html>`;
    const r = extractImpressum(html, BASE);
    expect(r.present).toBe(true);
    expect(r.confidence).toBeGreaterThanOrEqual(90);
  });

  it('returns false on page with no impressum link', () => {
    const html = `<html><body><a href="/kontakt">Kontakt</a><a href="/about">Über uns</a></body></html>`;
    const r = extractImpressum(html, BASE);
    expect(r.present).toBe(false);
    expect(r.url).toBeNull();
    expect(r.confidence).toBeNull();
  });

  it('returns false on empty HTML', () => {
    const r = extractImpressum('', BASE);
    expect(r.present).toBe(false);
  });

  it('resolves absolute href unchanged', () => {
    const html = `<html><body><a href="https://other.de/impressum">Impressum</a></body></html>`;
    const r = extractImpressum(html, BASE);
    expect(r.present).toBe(true);
    expect(r.url).toBe('https://other.de/impressum');
  });

  it('picks first match when multiple impressum links exist', () => {
    const html = `<html><body>
      <a href="/imprint">Imprint</a>
      <a href="/impressum">Impressum</a>
    </body></html>`;
    const r = extractImpressum(html, BASE);
    expect(r.present).toBe(true);
    expect(r.url).toBe('https://example.de/imprint');
  });
});
