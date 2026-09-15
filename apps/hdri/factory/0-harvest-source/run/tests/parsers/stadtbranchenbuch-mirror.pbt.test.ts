import { expect, test } from "vitest";
import fc from "fast-check";
import { parseSourceDocument } from "../../parsers/source-document.js";

// Renaming a retained file cannot change the company identity or website.
test("entity extraction is invariant under mirror filename changes", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 2_000_000_000 }),
      fc.integer({ min: 1, max: 2_000_000_000 }),
      (id, filename) => {
        const html = `<input name="eintragId" value="${id}"><script type="application/ld+json">${JSON.stringify({ "@type": "LocalBusiness", "@id": `https://www.stadtbranchenbuch.com/city/${id}.html`, name: "Example GmbH", url: "https://company.example" })}</script>`;
        const projection = (file: string) =>
          parseSourceDocument(
            `www.stadtbranchenbuch.com/city.stadtbranchenbuch.com/${file}.html`,
            html,
          ).result.items.map(({ raw, ...seed }) => seed);
        expect(projection(String(filename))).toEqual(projection("unrelated-name"));
        expect(projection(String(filename))[0]).toMatchObject({
          sourceItemKey: `sbb_${id}`,
          websiteUrl: "https://company.example",
        });
      },
    ),
  );
});
