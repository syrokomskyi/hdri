import { describe, it, expect } from "vitest";
import { getParserForSource } from "../../parsers/index.js";

describe("getParserForSource routing", () => {
  it("routes www.stadtbranchenbuch.com to WwwStadtbranchenbuchComParser", () => {
    const parser = getParserForSource("www.stadtbranchenbuch.com");
    expect(parser.sourceId).toBe("www.stadtbranchenbuch.com");
  });

  it("routes nested subdomain to BacknangStadtbranchenbuchComParser", () => {
    const parser = getParserForSource("www.stadtbranchenbuch.com/darmstadt.stadtbranchenbuch.com");
    expect(parser.sourceId).toBe("backnang.stadtbranchenbuch.com");
  });

  it("routes external domain in nested structure to UnknownSourceParser", () => {
    const parser = getParserForSource("www.stadtbranchenbuch.com/30grad-solar.com");
    expect(parser.sourceId).toBe("www.stadtbranchenbuch.com/30grad-solar.com");
    expect(parser.constructor.name).toBe("UnknownSourceParser");
  });

  it("routes backnang.stadtbranchenbuch.com to BacknangStadtbranchenbuchComParser", () => {
    const parser = getParserForSource("backnang.stadtbranchenbuch.com");
    expect(parser.sourceId).toBe("backnang.stadtbranchenbuch.com");
  });
});
