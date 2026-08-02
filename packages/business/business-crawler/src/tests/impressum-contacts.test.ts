import { describe, it, expect } from "vitest";
import { extractImpressumContacts } from "../extract/impressum-contacts.js";

const IMPRESSUM_HTML = `
<html><body>
  <h1>Impressum</h1>
  <p>Angaben gemäß § 5 TMG</p>
  <p>
    Tischlerei Mustermann GmbH<br>
    Musterstraße 12<br>
    80331 München
  </p>
  <p>Vertreten durch: Max Mustermann</p>
  <p>Kontakt:<br>
    Telefon: +49 89 1234567<br>
    E-Mail: <a href="mailto:info@tischlerei-mustermann.de">info@tischlerei-mustermann.de</a>
  </p>
  <p>Umsatzsteuer-Identifikationsnummer gemäß §27a UStG: DE123456789</p>
</body></html>
`;

describe("extractImpressumContacts", () => {
  it("parses a typical German Impressum", () => {
    const c = extractImpressumContacts(IMPRESSUM_HTML);
    expect(c.companyName).toContain("Tischlerei Mustermann GmbH");
    expect(c.personNames).toContain("Max Mustermann");
    expect(c.street).toBe("Musterstraße 12");
    expect(c.postalCode).toBe("80331");
    expect(c.city).toBe("München");
    expect(c.phone).toContain("89 1234567");
    expect(c.email).toBe("info@tischlerei-mustermann.de");
    expect(c.vatId).toBe("DE123456789");
  });

  it("prefers mailto/tel links and de-obfuscates a plain-text email", () => {
    const withLinks = extractImpressumContacts(
      `<body><a href="tel:+4930111">call</a><a href="mailto:HELLO@Example.DE">mail</a></body>`,
    );
    expect(withLinks.phone).toBe("+4930111");
    expect(withLinks.email).toBe("hello@example.de");

    const obfuscated = extractImpressumContacts(
      `<body><p>kontakt [at] beispiel [dot] de</p></body>`,
    );
    expect(obfuscated.email).toBe("kontakt@beispiel.de");
  });

  it("captures the owner after Inhaber:", () => {
    const c = extractImpressumContacts(
      `<body><p>Inhaber: Dr. Anna Schmidt</p><p>50667 Köln</p></body>`,
    );
    expect(c.personNames).toContain("Dr. Anna Schmidt");
    expect(c.postalCode).toBe("50667");
    expect(c.city).toBe("Köln");
  });

  it("returns all-null/empty for a page with no contact data", () => {
    const c = extractImpressumContacts(`<body><p>Willkommen auf unserer Seite.</p></body>`);
    expect(c).toEqual({
      companyName: null,
      personNames: [],
      street: null,
      postalCode: null,
      city: null,
      phone: null,
      email: null,
      vatId: null,
    });
  });

  it("does not misclassify a company line as a person name", () => {
    const c = extractImpressumContacts(`<body><p>Vertreten durch: Beispiel GmbH</p></body>`);
    expect(c.personNames).toEqual([]); // legal form rejected as a person
  });
});
