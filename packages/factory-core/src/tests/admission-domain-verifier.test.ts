import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  generateSigningKey,
  signAdmissionEvidence,
  type AdmissionEvidenceScope,
} from "@syrokomskyi/observatory-crypto";
import {
  ADMISSION_ARTIFACT_SCHEMAS,
  createFileAdmissionVerificationDeps,
  evaluateProgramGate,
  loadAdmissionInputFromFiles,
  verifyAdmissionDomainEvidence,
  verifyAdmissionInput,
} from "../index.js";

const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

const scope: AdmissionEvidenceScope = {
  period: "2026-q3",
  capsuleId: "019ff219-69fe-7025-943c-dae2a8c37801",
  operation: "collect",
  implementationFingerprint: "implementation-q3",
  policySha256: "a".repeat(64),
  evidenceClass: "operational",
};

const artifacts = {
  // Real QuarterCapsule manifest shape: the producer emits no schema field.
  predecessor: {
    period: "2026-q2",
    capsuleId: "0198f000-0000-7000-8000-000000000000",
    state: "sealed",
    instrumentPlan: [
      { instrument: "liveness", state: "required", reason: null },
      { instrument: "profile", state: "required", reason: null },
      { instrument: "axe", state: "required", reason: null },
      { instrument: "lighthouse", state: "disabled", reason: "Legacy quarter" },
    ],
    artifacts: [{ stage: "frame", uri: "frame.json", sha256: "b".repeat(64), bytes: 10 }],
  },
  preservation: {
    schema: "hdri-preservation@1",
    operation: "preserve:verify",
    status: "pass",
    inputFingerprint: "c".repeat(64),
    evidenceRefs: [],
    violations: [],
  },
  qualification: {
    schema: "hdri-rehearsal-run@1",
    inputFingerprint: "d".repeat(64),
    targets: 1000,
    profileSha256: "e".repeat(64),
    runtimeSha256: "f".repeat(64),
    fixtureSha256: "0".repeat(64),
    nodeSha256: "1".repeat(64),
    stages: [],
    status: "complete",
    selectedProjectionSha256: "2".repeat(64),
    comparison: {
      inputFingerprint: "d".repeat(64),
      selectedProjectionSha256: "2".repeat(64),
      match: true,
    },
    operationallyQualified: true,
    elapsedMs: 1000,
  },
  capacity: {
    schema: "hdri-capacity-report@1",
    period: "2026-q3",
    runner: "test-runner",
    measuredAt: "2026-09-16T00:00:00.000Z",
    measuredPath: "/tmp",
    minimums: { freeDiskBytes: 1, availableMemoryBytes: 1, freeInodes: 1 },
    resources: { freeDiskBytes: 100, availableMemoryBytes: 100, freeInodes: 100 },
    verdict: "pass",
  },
} as const;

type Role = keyof typeof artifacts;

async function mintEnvelope(
  root: string,
  key: ReturnType<typeof generateSigningKey>,
  role: Role,
  artifact: unknown,
): Promise<{ uri: string; bytes: number; sha256: string }> {
  const artifactBytes = Buffer.from(JSON.stringify(artifact));
  const artifactUri = `${role}-domain.json`;
  await fs.writeFile(path.join(root, artifactUri), artifactBytes);
  const manifest = signAdmissionEvidence({
    signingKey: { ...key, signingKeyId: "operational-key", collectorId: "operator" },
    role,
    scope,
    evidence: {
      schema: ADMISSION_ARTIFACT_SCHEMAS[role],
      uri: artifactUri,
      bytes: artifactBytes.length,
      sha256: sha256(artifactBytes),
    },
    signedAt: "2026-09-16T00:00:00.000Z",
  });
  const envelopeBytes = Buffer.from(JSON.stringify(manifest));
  const envelopeUri = `${role}.json`;
  await fs.writeFile(path.join(root, envelopeUri), envelopeBytes);
  return { uri: envelopeUri, bytes: envelopeBytes.length, sha256: sha256(envelopeBytes) };
}

async function writeAdmissionFixture(
  root: string,
  key: ReturnType<typeof generateSigningKey>,
  overrides: Partial<Record<Role, unknown>> = {},
) {
  const refs: Record<string, { uri: string; bytes: number; sha256: string } | null> = {};
  for (const role of Object.keys(artifacts) as Role[]) {
    refs[role] = await mintEnvelope(root, key, role, overrides[role] ?? artifacts[role]);
  }
  const input = {
    schema: "hdri-admission-input@1",
    scope,
    preservation: refs.preservation && {
      schema: "hdri-admission-evidence@1",
      ...refs.preservation,
    },
    qualification: refs.qualification && {
      schema: "hdri-admission-evidence@1",
      ...refs.qualification,
    },
    predecessor: refs.predecessor && { schema: "hdri-admission-evidence@1", ...refs.predecessor },
    capacity: refs.capacity && { schema: "hdri-admission-evidence@1", ...refs.capacity },
    publication: null,
  };
  const inputPath = path.join(root, "admission.json");
  await fs.writeFile(inputPath, JSON.stringify(input));
  const trustBytes = Buffer.from(
    JSON.stringify({
      schema: "hdri-admission-trust@1",
      keys: [
        {
          signingKeyId: "operational-key",
          publicKeyPem: key.publicKeyPem,
          keyClass: "operational",
        },
      ],
    }),
  );
  const trustPath = path.join(root, "trusted-keys.json");
  await fs.writeFile(trustPath, trustBytes);
  return { inputPath, trustPath, trustBytes };
}

function loaderOptions(inputPath: string, trustPath: string, trustBytes: Buffer, root: string) {
  return {
    admissionInputPath: inputPath,
    evidenceRoot: root,
    trustedKeysPath: trustPath,
    trustedKeysSha256: sha256(trustBytes),
    requiredEvidenceClass: "operational" as const,
    verifyDomainEvidence: verifyAdmissionDomainEvidence,
    expected: { period: scope.period, capsuleId: scope.capsuleId, operation: "collect" as const },
  };
}

describe("admission domain verifier", () => {
  it("admits a fully evidenced operational collect through the real loader", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-domain-ok-"));
    try {
      const key = generateSigningKey();
      const { inputPath, trustPath, trustBytes } = await writeAdmissionFixture(root, key);
      const verified = await loadAdmissionInputFromFiles(
        loaderOptions(inputPath, trustPath, trustBytes, root),
      );
      const gate = evaluateProgramGate(verified);
      expect(gate.status).toBe("allowed");
      expect(gate.blockerCodes).toEqual([]);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("rejects a predecessor artifact from the wrong period", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-domain-pred-"));
    try {
      const key = generateSigningKey();
      const { inputPath, trustPath, trustBytes } = await writeAdmissionFixture(root, key, {
        predecessor: { ...artifacts.predecessor, period: "2026-q1" },
      });
      await expect(
        loadAdmissionInputFromFiles(loaderOptions(inputPath, trustPath, trustBytes, root)),
      ).rejects.toThrow("ADMISSION_DOMAIN_ARTIFACT_PERIOD_MISMATCH");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("rejects an unsealed predecessor capsule", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-domain-unsealed-"));
    try {
      const key = generateSigningKey();
      const { inputPath, trustPath, trustBytes } = await writeAdmissionFixture(root, key, {
        predecessor: { ...artifacts.predecessor, state: "candidate" },
      });
      await expect(
        loadAdmissionInputFromFiles(loaderOptions(inputPath, trustPath, trustBytes, root)),
      ).rejects.toThrow("ADMISSION_DOMAIN_PREDECESSOR_NOT_SEALED");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("rejects a preservation receipt that did not pass", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-domain-pres-"));
    try {
      const key = generateSigningKey();
      const { inputPath, trustPath, trustBytes } = await writeAdmissionFixture(root, key, {
        preservation: { ...artifacts.preservation, status: "incomplete" },
      });
      await expect(
        loadAdmissionInputFromFiles(loaderOptions(inputPath, trustPath, trustBytes, root)),
      ).rejects.toThrow("ADMISSION_DOMAIN_PRESERVATION_NOT_PASSING");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("rejects a rehearsal manifest that is not operationally qualified", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-domain-qual-"));
    try {
      const key = generateSigningKey();
      const { inputPath, trustPath, trustBytes } = await writeAdmissionFixture(root, key, {
        qualification: { ...artifacts.qualification, operationallyQualified: false },
      });
      await expect(
        loadAdmissionInputFromFiles(loaderOptions(inputPath, trustPath, trustBytes, root)),
      ).rejects.toThrow("ADMISSION_DOMAIN_QUALIFICATION_NOT_OPERATIONAL");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("rejects a capacity report whose verdict failed", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-domain-cap-"));
    try {
      const key = generateSigningKey();
      const { inputPath, trustPath, trustBytes } = await writeAdmissionFixture(root, key, {
        capacity: { ...artifacts.capacity, verdict: "fail" },
      });
      await expect(
        loadAdmissionInputFromFiles(loaderOptions(inputPath, trustPath, trustBytes, root)),
      ).rejects.toThrow("ADMISSION_DOMAIN_CAPACITY_NOT_PASSING");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("rejects an artifact whose declared schema does not match the role", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-domain-schema-"));
    try {
      const key = generateSigningKey();
      const { inputPath, trustPath, trustBytes } = await writeAdmissionFixture(root, key, {
        capacity: { ...artifacts.capacity, schema: "hdri-preservation@1" },
      });
      await expect(
        loadAdmissionInputFromFiles(loaderOptions(inputPath, trustPath, trustBytes, root)),
      ).rejects.toThrow("ADMISSION_DOMAIN_ARTIFACT_SCHEMA_MISMATCH");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("still blocks when a required role ref is missing", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-domain-missing-"));
    try {
      const key = generateSigningKey();
      const { inputPath, trustPath, trustBytes } = await writeAdmissionFixture(root, key);
      const input = JSON.parse(await fs.readFile(inputPath, "utf8")) as Record<string, unknown>;
      input.capacity = null;
      await fs.writeFile(inputPath, JSON.stringify(input));
      const verified = await loadAdmissionInputFromFiles(
        loaderOptions(inputPath, trustPath, trustBytes, root),
      );
      const gate = evaluateProgramGate(verified);
      expect(gate.status).toBe("blocked");
      expect(gate.blockerCodes).toContain("MISSING_COLLECTION_READINESS");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("verifies fixture-class evidence without a domain verifier", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-domain-fixture-"));
    try {
      const key = generateSigningKey();
      const fixtureScope = { ...scope, evidenceClass: "fixture" as const };
      const domainBytes = Buffer.from('{"schema":"fixture-qualification@1","status":"pass"}');
      await fs.writeFile(path.join(root, "qualification-domain.json"), domainBytes);
      const manifest = signAdmissionEvidence({
        signingKey: { ...key, signingKeyId: "fixture-key", collectorId: "fixture" },
        role: "qualification",
        scope: fixtureScope,
        evidence: {
          schema: "fixture-qualification@1",
          uri: "qualification-domain.json",
          bytes: domainBytes.length,
          sha256: sha256(domainBytes),
        },
      });
      const bytes = Buffer.from(JSON.stringify(manifest));
      await fs.writeFile(path.join(root, "qualification.json"), bytes);
      const verified = await verifyAdmissionInput(
        {
          schema: "hdri-admission-input@1",
          scope: fixtureScope,
          preservation: null,
          qualification: {
            schema: "hdri-admission-evidence@1",
            uri: "qualification.json",
            bytes: bytes.length,
            sha256: sha256(bytes),
          },
          predecessor: null,
          capacity: null,
          publication: null,
        },
        createFileAdmissionVerificationDeps({
          evidenceRoot: root,
          trustedKeys: new Map([
            [
              "fixture-key",
              { signingKeyId: "fixture-key", publicKeyPem: key.publicKeyPem, keyClass: "fixture" },
            ],
          ]),
        }),
      );
      expect(verified.qualification?.sha256).toBe(sha256(bytes));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
