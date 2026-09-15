import { describe, it, expect } from "vitest";
import { getParserForSource } from "../../parsers/index.js";

describe("getParserForSource routing", () => {
  it("routes the root catalog host to the mirror parser", () => {
    const parser = getParserForSource("www.stadtbranchenbuch.com");
    expect(parser.sourceId).toBe("stadtbranchenbuch-mirror");
  });

  it("routes nested city hosts to the same shape-aware mirror parser", () => {
    const parser = getParserForSource("www.stadtbranchenbuch.com/darmstadt.stadtbranchenbuch.com");
    expect(parser.sourceId).toBe("stadtbranchenbuch-mirror");
  });

  it("routes external domain in nested structure to UnknownSourceParser", () => {
    const parser = getParserForSource("www.stadtbranchenbuch.com/30grad-solar.com");
    expect(parser.sourceId).toBe("www.stadtbranchenbuch.com/30grad-solar.com");
    expect(parser.constructor.name).toBe("UnknownSourceParser");
  });

  it("routes a standalone city host to the same mirror parser", () => {
    const parser = getParserForSource("backnang.stadtbranchenbuch.com");
    expect(parser.sourceId).toBe("stadtbranchenbuch-mirror");
  });
});
