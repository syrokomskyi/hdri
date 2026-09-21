import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import http from "node:http";
import { fetchPageContent } from "../fetch-page.js";

afterEach(() => {
  vi.unstubAllGlobals();
});
const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
function response(bytes: Uint8Array, charset = "utf-8") {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(new Uint8Array(bytes).buffer, {
          headers: { "content-type": `text/html; charset=${charset}` },
        }),
    ),
  );
}
describe("stored page representation", () => {
  it("hashes the exact UTF-8 HTML bytes persisted by the profile collector", async () => {
    const entity = new Uint8Array([0xe4, 0xf6, 0xfc]);
    response(entity, "iso-8859-1");
    const result = await fetchPageContent("https://fixture.invalid/");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.errorMsg);
    expect(result.html).toBe("äöü");
    expect(result.contentHash).toBe(hash(Buffer.from(result.html, "utf8")));
    expect(result.entitySha256).toBe(hash(entity));
    expect(result.representation).toBe("utf8-html");
    expect(result.contentLengthBytes).toBe(6);
  });
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9])(
    "does not manufacture replacement bytes past the decoded limit %d",
    async (maxDecodedBytes) => {
      response(Buffer.from("ä😀日本", "utf8"));
      const result = await fetchPageContent("https://fixture.invalid/", { maxDecodedBytes });
      if (!result.ok) throw new Error(result.errorMsg);
      const stored = Buffer.from(result.html, "utf8");
      expect(stored.length).toBeLessThanOrEqual(maxDecodedBytes);
      expect(stored.length).toBe(result.contentLengthBytes);
      expect(result.contentHash).toBe(hash(stored));
      expect(result.html).not.toContain("\ufffd");
      expect(result.complete).toBe(false);
    },
  );
  it("records distinct entity and stored hashes when malformed input is decoded", async () => {
    const entity = new Uint8Array([0xff, 0x41]);
    response(entity);
    const result = await fetchPageContent("https://fixture.invalid/");
    if (!result.ok) throw new Error(result.errorMsg);
    expect(result.contentHash).toBe(hash(result.html));
    expect(result.entitySha256).toBe(hash(entity));
    expect(result.contentHash).not.toBe(result.entitySha256);
  });
  it("does not call decompressed native-fetch data wire bytes (real local gzip response)", async () => {
    const html = "<html>" + "ä".repeat(1000) + "</html>";
    const compressed = gzipSync(Buffer.from(html, "utf8"));
    const server = http.createServer((_req, res) => {
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "content-encoding": "gzip",
      });
      res.end(compressed);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Missing fixture listener");
      const result = await fetchPageContent(`http://127.0.0.1:${address.port}/`);
      if (!result.ok) throw new Error(result.errorMsg);
      expect(result.entityBytes).toBe(Buffer.byteLength(html));
      expect(result.entityBytes).not.toBe(compressed.length);
      expect(result.entitySha256).toBe(hash(html));
      expect(result.contentHash).toBe(hash(html));
      expect(result).not.toHaveProperty("wireBytes");
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
  it.each([0, -1, NaN, Infinity, 1.5])(
    "rejects invalid byte limits before opening a connection: %s",
    async (limit) => {
      const fetcher = vi.fn();
      vi.stubGlobal("fetch", fetcher);
      await expect(
        fetchPageContent("https://fixture.invalid/", { maxEntityBytes: limit }),
      ).rejects.toThrow("INVALID_FETCH_LIMIT");
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
});
