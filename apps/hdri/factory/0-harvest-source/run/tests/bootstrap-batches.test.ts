import { describe, expect, it } from "vitest";
import { selectCumulativeBatchNames } from "../app/input/batch-selection.js";

describe("cumulative source batch discovery", () => {
  it("includes preserved prior batches and every current-quarter new-source folder", () => {
    expect(
      selectCumulativeBatchNames(
        ["2026-q3-de-02", "2026-q2-de-05", "2026-q4-de-01", "2026-q3-de-01"],
        "2026-q3-de-01",
      ),
    ).toEqual(["2026-q2-de-05", "2026-q3-de-01", "2026-q3-de-02"]);
  });

  it("refuses a run whose declared current folder is absent", () => {
    expect(() =>
      selectCumulativeBatchNames(["2026-q2-de-05"], "2026-q3-de-01"),
    ).toThrow(/not discoverable/);
  });
});
