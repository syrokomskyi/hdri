import { describe, it, expect } from 'vitest';
import {
  extractAwards,
  extractCertifications,
  extractMemberships,
  extractMeister,
  extractTestimonials,
  extractContactForm,
  extractPortfolio,
  extractMap,
  extractTeamPage,
  extractCaseStudies,
} from '../content.js';

const BASE = 'https://example.de';

// ---------------------------------------------------------------------------
// extractAwards — KNOWN FALSE-POSITIVE RISK: 'preis' matches 'Preisliste' etc.
// ---------------------------------------------------------------------------
describe('extractAwards', () => {
  it('detects explicit award mention', () => {
    const html = `<html><body><p>Wir haben den Deutschen Award 2023 gewonnen.</p></body></html>`;
    expect(extractAwards(html).present).toBe(true);
  });

  it('detects "auszeichnung"', () => {
    const html = `<html><body><p>Unsere Auszeichnung für Qualität.</p></body></html>`;
    expect(extractAwards(html).present).toBe(true);
  });

  it('returns false on clean page', () => {
    const html = `<html><body><p>Willkommen auf unserer Webseite. Wir bieten Dienstleistungen an.</p></body></html>`;
    expect(extractAwards(html).present).toBe(false);
  });

  // 'Preisliste' / 'Preise' must NOT trigger awards
  it('does NOT false-positive on "Preisliste" or "Preise"', () => {
    const html = `<html><body><a href="/preisliste">Preisliste</a><p>Unsere Preise sind günstig.</p></body></html>`;
    expect(extractAwards(html).present).toBe(false);
  });

  it('does detect standalone "Preis" as an award', () => {
    const html = `<html><body><p>Wir haben den Preis gewonnen.</p></body></html>`;
    expect(extractAwards(html).present).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// extractCertifications — KNOWN FALSE-POSITIVE RISK: 'din ' matches 'Dinkel' etc.
// ---------------------------------------------------------------------------
describe('extractCertifications', () => {
  it('detects ISO certification', () => {
    const html = `<html><body><p>Wir sind ISO 9001 zertifiziert.</p></body></html>`;
    expect(extractCertifications(html).present).toBe(true);
  });

  it('detects TÜV mention', () => {
    const html = `<html><body><p>TÜV-geprüft und zertifiziert.</p></body></html>`;
    expect(extractCertifications(html).present).toBe(true);
  });

  it('detects "zertifikat" in img alt', () => {
    const html = `<html><body><img src="cert.png" alt="Zertifikat ISO 9001"></body></html>`;
    expect(extractCertifications(html).present).toBe(true);
  });

  it('returns false on clean page', () => {
    const html = `<html><body><p>Willkommen. Wir sind ein Handwerksbetrieb.</p></body></html>`;
    expect(extractCertifications(html).present).toBe(false);
  });

  // FALSE POSITIVE: 'din ' with trailing space could match 'din' in other contexts
  it('does NOT false-positive on "Dienstleistungen"', () => {
    const html = `<html><body><p>Wir bieten Dienstleistungen an.</p></body></html>`;
    // 'din ' (with space) should NOT appear in 'Dienstleistungen'
    expect(extractCertifications(html).present).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// extractMemberships — KNOWN FALSE-POSITIVE RISK: 'kammer', 'bund ', 'verband'
// ---------------------------------------------------------------------------
describe('extractMemberships', () => {
  it('detects IHK mention', () => {
    const html = `<html><body><p>Mitglied in der IHK München.</p></body></html>`;
    expect(extractMemberships(html).present).toBe(true);
  });

  it('detects "innung"', () => {
    const html = `<html><body><p>Wir sind Mitglied der Malerinnung.</p></body></html>`;
    expect(extractMemberships(html).present).toBe(true);
  });

  it('returns false on clean page', () => {
    const html = `<html><body><p>Kontaktieren Sie uns telefonisch oder per E-Mail.</p></body></html>`;
    expect(extractMemberships(html).present).toBe(false);
  });

  // 'Schlafkammer' must NOT trigger memberships ('kammer' only matches as whole word)
  it('does NOT false-positive on "Schlafkammer"', () => {
    const html = `<html><body><p>Wir renovieren Schlafkammer und Badezimmer.</p></body></html>`;
    expect(extractMemberships(html).present).toBe(false);
  });

  it('does detect standalone "Kammer" as membership', () => {
    const html = `<html><body><p>Mitglied der Kammer der Architekten.</p></body></html>`;
    expect(extractMemberships(html).present).toBe(true);
  });

  // FALSE POSITIVE: 'bund ' (with space) matching 'Bundesland'
  it('FALSE POSITIVE: "Bundesland" should not trigger membership', () => {
    const html = `<html><body><p>Wir sind im Bundesland Bayern tätig.</p></body></html>`;
    const r = extractMemberships(html);
    // 'bundesverband' and 'landesverband' are in terms but 'bund ' matches 'bund ' in 'bund '
    // 'bundesland' does NOT contain 'bund ' with trailing space
    expect(r.present).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// extractMeister
// ---------------------------------------------------------------------------
describe('extractMeister', () => {
  it('detects "Meisterbetrieb"', () => {
    const html = `<html><body><p>Wir sind ein anerkannter Meisterbetrieb.</p></body></html>`;
    expect(extractMeister(html).present).toBe(true);
  });

  it('detects "Handwerksmeister" in img alt', () => {
    const html = `<html><body><img src="logo.png" alt="Handwerksmeister seit 1990"></body></html>`;
    expect(extractMeister(html).present).toBe(true);
  });

  it('returns false on clean page', () => {
    const html = `<html><body><p>Herzlich willkommen bei Bau GmbH.</p></body></html>`;
    expect(extractMeister(html).present).toBe(false);
  });

  // 'meister ' with trailing space — should NOT match 'Meisterschaft' (sport)
  it('does NOT false-positive on "Meisterschaft"', () => {
    const html = `<html><body><p>Die Fußball-Meisterschaft 2023.</p></body></html>`;
    // 'meister ' (with space) is NOT in 'Meisterschaft' — should be safe
    expect(extractMeister(html).present).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// extractTestimonials
// ---------------------------------------------------------------------------
describe('extractTestimonials', () => {
  it('detects link with "Kundenstimmen" text', () => {
    const html = `<html><body><a href="/kundenstimmen">Kundenstimmen</a></body></html>`;
    expect(extractTestimonials(html).present).toBe(true);
  });

  it('detects section with class "testimonial"', () => {
    const html = `<html><body><div class="testimonial-block"><p>Super!</p></div></body></html>`;
    expect(extractTestimonials(html).present).toBe(true);
  });

  it('returns false on clean page', () => {
    const html = `<html><body><p>Über uns. Kontakt. Leistungen.</p></body></html>`;
    expect(extractTestimonials(html).present).toBe(false);
  });

  // 'referenzen' also triggers testimonials — check it is intentional
  it('"Referenzen" link triggers testimonials (low confidence)', () => {
    const html = `<html><body><a href="/referenzen">Referenzen</a></body></html>`;
    const r = extractTestimonials(html);
    expect(r.present).toBe(true);
    expect(r.confidence).toBeLessThanOrEqual(70);
  });
});

// ---------------------------------------------------------------------------
// extractContactForm
// ---------------------------------------------------------------------------
describe('extractContactForm', () => {
  it('detects form with email input', () => {
    const html = `<html><body><form><input type="email" name="email"><input type="submit"></form></body></html>`;
    expect(extractContactForm(html).present).toBe(true);
  });

  it('detects element with id="contactform"', () => {
    const html = `<html><body><div id="contactform"><form></form></div></body></html>`;
    expect(extractContactForm(html).present).toBe(true);
  });

  it('returns false for form without email field', () => {
    const html = `<html><body><form action="/search"><input type="text" name="q"><input type="submit"></form></body></html>`;
    expect(extractContactForm(html).present).toBe(false);
  });

  it('returns false on page with no form', () => {
    const html = `<html><body><p>Kontakt: info@example.de</p></body></html>`;
    expect(extractContactForm(html).present).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// extractPortfolio
// ---------------------------------------------------------------------------
describe('extractPortfolio', () => {
  it('detects /portfolio link', () => {
    const html = `<html><body><a href="/portfolio">Portfolio</a></body></html>`;
    expect(extractPortfolio(html).present).toBe(true);
    expect(extractPortfolio(html).confidence).toBeGreaterThanOrEqual(85);
  });

  it('detects body text "galerie"', () => {
    const html = `<html><body><p>Sehen Sie unsere Galerie.</p></body></html>`;
    expect(extractPortfolio(html).present).toBe(true);
  });

  it('returns false on clean page', () => {
    const html = `<html><body><p>Herzlich willkommen. Kontakt. Leistungen.</p></body></html>`;
    expect(extractPortfolio(html).present).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// extractMap
// ---------------------------------------------------------------------------
describe('extractMap', () => {
  it('detects Google Maps iframe', () => {
    const html = `<html><body><iframe src="https://maps.google.com/maps?q=Berlin"></iframe></body></html>`;
    const r = extractMap(html);
    expect(r.present).toBe(true);
    expect(r.confidence).toBe(95);
  });

  it('detects element with id="map"', () => {
    const html = `<html><body><div id="map" style="height:400px"></div></body></html>`;
    const r = extractMap(html);
    expect(r.present).toBe(true);
    expect(r.confidence).toBeLessThan(95);
  });

  it('returns false on clean page', () => {
    const html = `<html><body><p>Wir sind in Berlin.</p></body></html>`;
    expect(extractMap(html).present).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// extractTeamPage
// ---------------------------------------------------------------------------
describe('extractTeamPage', () => {
  it('detects /unser-team link', () => {
    const html = `<html><body><a href="/unser-team">Unser Team</a></body></html>`;
    const r = extractTeamPage(html, BASE);
    expect(r.present).toBe(true);
    expect(r.url).toBe('https://example.de/unser-team');
    expect(r.confidence).toBeGreaterThanOrEqual(90);
  });

  it('detects /about-us link', () => {
    const html = `<html><body><a href="/about-us">About Us</a></body></html>`;
    expect(extractTeamPage(html, BASE).present).toBe(true);
  });

  it('returns false on clean page', () => {
    const html = `<html><body><a href="/kontakt">Kontakt</a></body></html>`;
    expect(extractTeamPage(html, BASE).present).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// extractCaseStudies
// ---------------------------------------------------------------------------
describe('extractCaseStudies', () => {
  it('detects /case-study link', () => {
    const html = `<html><body><a href="/case-study">Case Study</a></body></html>`;
    expect(extractCaseStudies(html).present).toBe(true);
  });

  it('detects "Referenzprojekt" link text', () => {
    const html = `<html><body><a href="/projekte">Referenzprojekt ansehen</a></body></html>`;
    expect(extractCaseStudies(html).present).toBe(true);
  });

  it('returns false on clean page', () => {
    const html = `<html><body><p>Über uns. Kontakt.</p></body></html>`;
    expect(extractCaseStudies(html).present).toBe(false);
  });
});
