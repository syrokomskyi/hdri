import { expect, test } from "vitest";
import fc from "fast-check";
import { gzipSync } from "node:zlib";
import { inspectSourceDocument } from "../source-document-inspection.js";

// Wrapping unchanged policy bytes in gzip cannot alter their classification or decoded digest.
test("source classification is invariant under valid gzip transport", () => {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 1_000_000 }), (value) => {
      const payload = Buffer.from(`User-agent: *\nDisallow: /section-${value}\n`);
      const file = "www.stadtbranchenbuch.com/city.stadtbranchenbuch.com/robots.txt";
      const { encoding: firstEncoding, ...first } = inspectSourceDocument(file, payload).inspection;
      const { encoding: secondEncoding, ...second } = inspectSourceDocument(
        file,
        gzipSync(payload),
      ).inspection;
      expect(firstEncoding).toBe("identity");
      expect(secondEncoding).toBe("gzip");
      expect(second).toEqual(first);
      expect(first.kind).toBe("robots-policy");
    }),
  );
});
