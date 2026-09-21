import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  generateSigningKey,
  signAdmissionEvidence,
} from "@syrokomskyi/observatory-crypto";
import {
  createFileAdmissionVerificationDeps,
  loadAdmissionInputFromFiles,
  verifyAdmissionInput,
} from "../index.js";

const scope = {
  period: "2026-q3",
  capsuleId: "0198f000-0000-7000-8000-000000000000",
  operation: "collect" as const,
  implementationFingerprint: "implementation-q3",
  policySha256: "a".repeat(64),
  evidenceClass: "fixture" as const,
};

describe("file admission verifier", () => {
  it("verifies bytes, signature, role and authenticated scope through the real loader", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-admission-"));
    try {
      const key = generateSigningKey();
      const domainBytes = Buffer.from('{"schema":"fixture-qualification@1","status":"pass"}');
      await fs.writeFile(path.join(root, "qualification-domain.json"), domainBytes);
      const manifest = signAdmissionEvidence({
        signingKey: { ...key, signingKeyId: "fixture-key", collectorId: "fixture" },
        role: "qualification",
        scope,
        evidence: {
          schema: "fixture-qualification@1",
          uri: "qualification-domain.json",
          bytes: domainBytes.length,
          sha256: createHash("sha256").update(domainBytes).digest("hex"),
        },
        signedAt: "2026-09-16T00:00:00.000Z",
      });
      const bytes = Buffer.from(JSON.stringify(manifest));
      await fs.writeFile(path.join(root, "qualification.json"), bytes);
      const input = {
        schema: "hdri-admission-input@1" as const,
        scope,
        preservation: null,
        qualification: {
          schema: "hdri-admission-evidence@1",
          uri: "qualification.json",
          bytes: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        },
        predecessor: null,
        capacity: null,
        publication: null,
      };
      const verified = await verifyAdmissionInput(
        input,
        createFileAdmissionVerificationDeps({
          evidenceRoot: root,
          trustedKeys: new Map([
            ["fixture-key", { signingKeyId: "fixture-key", publicKeyPem: key.publicKeyPem, keyClass: "fixture" }],
          ]),
        }),
      );
      expect(verified.scope).toEqual(scope);
      expect(verified.qualification?.sha256).toBe(input.qualification.sha256);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("does not authorize operational effects from signature validity alone", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-admission-domain-"));
    try {
      const key = generateSigningKey();
      const operationalScope = { ...scope, evidenceClass: "operational" as const };
      const domainBytes = Buffer.from('{"schema":"operational-qualification@1","status":"pass"}');
      await fs.writeFile(path.join(root, "qualification-domain.json"), domainBytes);
      const manifest = signAdmissionEvidence({
        signingKey: { ...key, signingKeyId: "operational-key", collectorId: "operator" },
        role: "qualification",
        scope: operationalScope,
        evidence: {
          schema: "operational-qualification@1",
          uri: "qualification-domain.json",
          bytes: domainBytes.length,
          sha256: createHash("sha256").update(domainBytes).digest("hex"),
        },
      });
      const bytes = Buffer.from(JSON.stringify(manifest));
      await fs.writeFile(path.join(root, "qualification.json"), bytes);
      await expect(
        verifyAdmissionInput(
          {
            schema: "hdri-admission-input@1",
            scope: operationalScope,
            preservation: null,
            qualification: {
              schema: "hdri-admission-evidence@1",
              uri: "qualification.json",
              bytes: bytes.length,
              sha256: createHash("sha256").update(bytes).digest("hex"),
            },
            predecessor: null,
            capacity: null,
            publication: null,
          },
          createFileAdmissionVerificationDeps({
            evidenceRoot: root,
            trustedKeys: new Map([
              [
                "operational-key",
                {
                  signingKeyId: "operational-key",
                  publicKeyPem: key.publicKeyPem,
                  keyClass: "operational",
                },
              ],
            ]),
          }),
        ),
      ).rejects.toThrow("ADMISSION_DOMAIN_VERIFIER_REQUIRED");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("requires an externally pinned operational trust-manifest digest", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-admission-trust-pin-"));
    try {
      const key = generateSigningKey();
      const operationalScope = { ...scope, evidenceClass: "operational" as const };
      const domainBytes = Buffer.from('{"schema":"operational-qualification@1","status":"pass"}');
      await fs.writeFile(path.join(root, "qualification-domain.json"), domainBytes);
      const manifest = signAdmissionEvidence({
        signingKey: { ...key, signingKeyId: "operational-key", collectorId: "operator" },
        role: "qualification",
        scope: operationalScope,
        evidence: {
          schema: "operational-qualification@1",
          uri: "qualification-domain.json",
          bytes: domainBytes.length,
          sha256: createHash("sha256").update(domainBytes).digest("hex"),
        },
      });
      const envelopeBytes = Buffer.from(JSON.stringify(manifest));
      await fs.writeFile(path.join(root, "qualification.json"), envelopeBytes);
      const input = {
        schema: "hdri-admission-input@1",
        scope: operationalScope,
        preservation: null,
        qualification: {
          schema: "hdri-admission-evidence@1",
          uri: "qualification.json",
          bytes: envelopeBytes.length,
          sha256: createHash("sha256").update(envelopeBytes).digest("hex"),
        },
        predecessor: null,
        capacity: null,
        publication: null,
      };
      const inputPath = path.join(root, "admission.json");
      await fs.writeFile(inputPath, JSON.stringify(input));
      const trustBytes = Buffer.from(JSON.stringify({
        schema: "hdri-admission-trust@1",
        keys: [{
          signingKeyId: "operational-key",
          publicKeyPem: key.publicKeyPem,
          keyClass: "operational",
        }],
      }));
      const trustPath = path.join(root, "trusted-keys.json");
      await fs.writeFile(trustPath, trustBytes);
      const options = {
        admissionInputPath: inputPath,
        evidenceRoot: root,
        trustedKeysPath: trustPath,
        requiredEvidenceClass: "operational" as const,
        expected: {
          period: operationalScope.period,
          capsuleId: operationalScope.capsuleId,
          operation: operationalScope.operation,
        },
      };
      await expect(loadAdmissionInputFromFiles(options)).rejects.toThrow(
        "OPERATIONAL_ADMISSION_TRUST_PIN_REQUIRED",
      );
      await expect(
        loadAdmissionInputFromFiles({ ...options, trustedKeysSha256: "b".repeat(64) }),
      ).rejects.toThrow("OPERATIONAL_ADMISSION_TRUST_PIN_MISMATCH");
      await expect(
        loadAdmissionInputFromFiles({
          ...options,
          trustedKeysSha256: createHash("sha256").update(trustBytes).digest("hex"),
        }),
      ).rejects.toThrow("ADMISSION_DOMAIN_VERIFIER_REQUIRED");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("rejects a same-size byte substitution before trusting the signature", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "hdri-admission-tamper-"));
    try {
      const key = generateSigningKey();
      const domainBytes = Buffer.from('{"schema":"fixture-qualification@1","status":"pass"}');
      await fs.writeFile(path.join(root, "qualification-domain.json"), domainBytes);
      const manifest = signAdmissionEvidence({
        signingKey: { ...key, signingKeyId: "fixture-key", collectorId: "fixture" },
        role: "qualification",
        scope,
        evidence: {
          schema: "fixture-qualification@1",
          uri: "qualification-domain.json",
          bytes: domainBytes.length,
          sha256: createHash("sha256").update(domainBytes).digest("hex"),
        },
      });
      const file = path.join(root, "qualification.json");
      const original = Buffer.from(JSON.stringify(manifest));
      await fs.writeFile(file, original);
      const mutated = Buffer.from(original);
      mutated[mutated.length - 2] = mutated[mutated.length - 2] === 0x20 ? 0x21 : 0x20;
      await fs.writeFile(file, mutated);
      await expect(
        verifyAdmissionInput(
          {
            schema: "hdri-admission-input@1",
            scope,
            preservation: null,
            qualification: {
              schema: "hdri-admission-evidence@1",
              uri: "qualification.json",
              bytes: original.length,
              sha256: createHash("sha256").update(original).digest("hex"),
            },
            predecessor: null,
            capacity: null,
            publication: null,
          },
          createFileAdmissionVerificationDeps({
            evidenceRoot: root,
            trustedKeys: new Map([
              ["fixture-key", { signingKeyId: "fixture-key", publicKeyPem: key.publicKeyPem, keyClass: "fixture" }],
            ]),
          }),
        ),
      ).rejects.toThrow("ADMISSION_EVIDENCE_BYTES_MISMATCH");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
