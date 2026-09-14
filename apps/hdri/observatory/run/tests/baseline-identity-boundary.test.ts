import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { convertToBaseline, resolveIdentities } from "../../tools/preservation/baseline-import.js";
import {
  parseBaselineIdentities,
  validateBaselineImportReceipt,
  type BaselineIdentity,
} from "../../tools/preservation/contracts.js";

const identity = (patch: Partial<BaselineIdentity> = {}): BaselineIdentity => ({
  producer: "liveness",
  device: "device-one",
  databaseSha256: "a".repeat(64),
  localSiteId: 1,
  provisionalId: "da-one",
  canonicalId: "0198f000-0000-7000-8000-000000000001",
  evidenceRefs: ["originals/source-0000/identity-map.json"],
  ...patch,
});
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("baseline identity boundary", () => {
  it("keeps identical local numbers distinct across producers, devices and database generations", () => {
    const input = [
      identity(),
      identity({ producer: "profile", canonicalId: "0198f000-0000-7000-8000-000000000002" }),
      identity({ device: "device-two", canonicalId: "0198f000-0000-7000-8000-000000000003" }),
      identity({
        databaseSha256: "b".repeat(64),
        canonicalId: "0198f000-0000-7000-8000-000000000004",
      }),
    ];
    expect(parseBaselineIdentities(input)).toEqual(input);
  });

  it("retains an existing UUID byte-for-byte without reminting or normalization", () => {
    const canonicalId = "0198F000-0000-7000-8000-000000000001";
    expect(
      resolveIdentities({
        producer: "profile",
        device: "retained-device",
        databaseSha256: "a".repeat(64),
        localIds: [{ localSiteId: 1, provisionalId: "da-one", evidenceRefs: ["originals/ids"] }],
        existingCanonicalIds: new Map([["da-one", canonicalId]]),
      }),
    ).toEqual([
      identity({
        producer: "profile",
        device: "retained-device",
        canonicalId,
        evidenceRefs: ["originals/ids"],
      }),
    ]);
  });

  it("detaches and freezes evidence refs instead of retaining caller-owned arrays", () => {
    const refs = ["originals/ids"];
    const input = identity({ evidenceRefs: refs });
    const result = parseBaselineIdentities([input]);
    refs.push("originals/injected");
    expect(result[0].evidenceRefs).toEqual(["originals/ids"]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result[0])).toBe(true);
    expect(Object.isFrozen(result[0].evidenceRefs)).toBe(true);
  });

  it.each([
    ["missing device", { device: undefined }],
    ["empty device", { device: "" }],
    ["control character", { producer: "a\nb" }],
    ["bad digest", { databaseSha256: "abc" }],
    ["UUID placeholder", { canonicalId: "canonical-uuid-1" }],
    ["zero local ID", { localSiteId: 0 }],
    ["fractional local ID", { localSiteId: 1.5 }],
    ["unsafe local ID", { localSiteId: Number.MAX_SAFE_INTEGER + 1 }],
    ["empty refs", { evidenceRefs: [] }],
    ["traversal", { evidenceRefs: ["originals/../ids"] }],
    ["absolute ref", { evidenceRefs: ["/tmp/ids"] }],
    ["duplicate refs", { evidenceRefs: ["originals/ids", "originals/ids"] }],
    ["unknown field", { inferred: true }],
  ])("rejects %s", (_name, patch) => {
    expect(() => parseBaselineIdentities([{ ...identity(), ...patch }])).toThrow();
  });

  it("rejects duplicate scoped rows even when their UUIDs agree", () => {
    expect(() => parseBaselineIdentities([identity(), identity()])).toThrow(/IDENTITY_AMBIGUITY/);
  });

  it("rejects one scoped provisional alias with different canonical owners", () => {
    expect(() =>
      parseBaselineIdentities([
        identity(),
        identity({ localSiteId: 2, canonicalId: "0198f000-0000-7000-8000-000000000002" }),
      ]),
    ).toThrow(/IDENTITY_AMBIGUITY/);
  });

  it("rejects sparse identity and evidence arrays", () => {
    expect(() => parseBaselineIdentities(new Array(1))).toThrow(/INVALID_BASELINE_INPUT/);
    expect(() => parseBaselineIdentities([identity({ evidenceRefs: new Array(1) })])).toThrow(
      /INVALID_BASELINE_INPUT/,
    );
  });

  it("does not confuse separator characters in the producer/device tuple", () => {
    expect(
      parseBaselineIdentities([
        identity({ producer: "a/b", device: "c" }),
        identity({
          producer: "a",
          device: "b/c",
          canonicalId: "0198f000-0000-7000-8000-000000000002",
        }),
      ]),
    ).toHaveLength(2);
  });

  it("rejects missing bindings and empty resolution instead of treating them as a successful import", () => {
    const options = {
      producer: "profile",
      device: "device-one",
      databaseSha256: "a".repeat(64),
      localIds: [{ localSiteId: 1, provisionalId: "da-missing", evidenceRefs: ["originals/ids"] }],
      existingCanonicalIds: new Map<string, string>(),
    };
    expect(() => resolveIdentities(options)).toThrow(/UNRESOLVED_IDENTITY/);
    expect(() => resolveIdentities({ ...options, localIds: [] })).toThrow(/INVALID_BASELINE_INPUT/);
  });

  it("refuses the unscoped copier before output creation for a multi-device identity set", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hdri-scoped-identities-"));
    roots.push(root);
    const targetRoot = path.join(root, "new-target");
    await expect(
      convertToBaseline({
        archivePath: path.join(root, "unreadable-source"),
        targetRoot,
        inventory: [],
        identities: [
          identity(),
          identity({ device: "device-two", canonicalId: "0198f000-0000-7000-8000-000000000002" }),
        ],
      }),
    ).rejects.toThrow(/BASELINE_CONVERSION_UNVERIFIED/);
    expect(fs.readdirSync(root)).toEqual([]);
  });

  it("rejects overlapping numeric and provisional aliases before output creation", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hdri-alias-collision-"));
    roots.push(root);
    await expect(
      convertToBaseline({
        archivePath: path.join(root, "unreadable-source"),
        targetRoot: path.join(root, "target"),
        inventory: [],
        identities: [
          identity(),
          identity({
            localSiteId: 2,
            provisionalId: "1",
            canonicalId: "0198f000-0000-7000-8000-000000000002",
          }),
        ],
      }),
    ).rejects.toThrow(/IDENTITY_AMBIGUITY/);
    expect(fs.readdirSync(root)).toEqual([]);
  });
});

describe("closed baseline receipt shape, not evidence authentication", () => {
  const receipt = {
    schema: "hdri-baseline-import@1",
    period: "2026-q2",
    sourceInventorySha256: "a".repeat(64),
    identityMapSha256: "b".repeat(64),
    conversionImplementationSha256: "c".repeat(64),
    currentBaselineManifestSha256: "d".repeat(64),
    unresolvedReferences: 0,
    comparisonReportSha256: "e".repeat(64),
  };
  it.each([NaN, Infinity, -1, 0.5, "0", null, Number.MAX_SAFE_INTEGER + 1])(
    "rejects non-count unresolved references: %s",
    (unresolvedReferences) => {
      expect(() => validateBaselineImportReceipt({ ...receipt, unresolvedReferences })).toThrow(
        /unresolvedReferences/,
      );
    },
  );
  it.each([
    null,
    [],
    { ...receipt, verified: true },
    { ...receipt, sourceInventorySha256: { toString: () => "a".repeat(64) } },
  ])("rejects malformed or coercible receipt %s", (input) => {
    expect(() => validateBaselineImportReceipt(input)).toThrow();
  });
});
