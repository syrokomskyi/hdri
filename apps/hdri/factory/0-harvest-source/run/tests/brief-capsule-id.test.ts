import { describe, it, expect } from "vitest";
import { parseBriefMarkdown } from "../brief.js";

const validBriefMd = [
  "---",
  'sourceToken: "2026-q2-de-05"',
  'capsuleId: "0198f000-0000-7000-8000-000000000000"',
  'zipcodesTablePath: "zipcodes.de.json"',
  "---",
  "",
].join("\n");

describe("brief capsuleId parsing", () => {
  it("parses valid capsuleId", () => {
    const brief = parseBriefMarkdown(validBriefMd);
    expect(brief.capsuleId).toBe("0198f000-0000-7000-8000-000000000000");
  });

  it("throws when capsuleId is missing", () => {
    const briefMd = [
      "---",
      'sourceToken: "2026-q2-de-05"',
      'zipcodesTablePath: "zipcodes.de.json"',
      "---",
      "",
    ].join("\n");
    expect(() => parseBriefMarkdown(briefMd)).toThrow(/capsuleId must be a UUID v7/);
  });

  it("throws when capsuleId is not a UUID v7", () => {
    const briefMd = [
      "---",
      'sourceToken: "2026-q2-de-05"',
      'capsuleId: "not-a-uuid"',
      'zipcodesTablePath: "zipcodes.de.json"',
      "---",
      "",
    ].join("\n");
    expect(() => parseBriefMarkdown(briefMd)).toThrow(/capsuleId must be a UUID v7/);
  });
});
