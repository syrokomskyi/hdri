/*
<MODULE_CONTRACT>
<purpose>Persist one verified publication attestation before delivery and reuse its exact signed bytes on retry.</purpose>
<non-goals><item>Does not establish admission, custody or release completeness; callers must verify those before signing.</item></non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>Make attestation delivery restart-stable without accepting changed scope, keys or signatures.</item></CHANGE_SUMMARY>
*/
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { canonicalize } from "@syrokomskyi/observatory-crypto";
import { createPublicationAttestation, type PublicationAttestation, type ReleaseEnvelope } from "./release-contract";

export async function retainPublicationAttestation(input: {
  file: string;
  envelope: ReleaseEnvelope;
  replicaReceiptSha256s: string[];
  signingKeyId: string;
  publicKeyPem: string;
  privateKeyPem: string;
  custodyPolicySha256?: string;
}): Promise<PublicationAttestation> {
  const { file, envelope, replicaReceiptSha256s, signingKeyId, custodyPolicySha256 } = input;
  const template = createPublicationAttestation(envelope, replicaReceiptSha256s, signingKeyId, "", "", custodyPolicySha256);
  const payloadDigest = (record: PublicationAttestation) => {
    const { signature: _signature, ...payload } = record;
    return crypto.createHash("sha256").update(canonicalize(payload)).digest();
  };
  const verify = (bytes: string): PublicationAttestation => {
    const record = JSON.parse(bytes) as PublicationAttestation;
    if (!record || typeof record !== "object" || typeof record.attestedAt !== "string" ||
      !Number.isFinite(Date.parse(record.attestedAt)) || typeof record.signature !== "string" ||
      JSON.stringify({ ...record, attestedAt: "", signature: "" }) !== JSON.stringify(template) ||
      bytes !== `${JSON.stringify(record, null, 2)}\n` ||
      !crypto.verify(null, payloadDigest(record), crypto.createPublicKey(input.publicKeyPem), Buffer.from(record.signature, "base64url")))
      throw new Error("RETAINED_ATTESTATION_CONFLICT_OR_INVALID_SIGNATURE");
    return record;
  };
  const read = async () => {
    const handle = await fs.open(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > 65536) throw new Error("RETAINED_ATTESTATION_NOT_BOUNDED_REGULAR_FILE");
      return verify(await handle.readFile("utf8"));
    } finally { await handle.close(); }
  };
  try { return await read(); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const record = { ...template, attestedAt: new Date().toISOString() };
  record.signature = crypto.sign(null, payloadDigest(record), crypto.createPrivateKey(input.privateKeyPem)).toString("base64url");
  const bytes = `${JSON.stringify(record, null, 2)}\n`;
  verify(bytes);
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  const handle = await fs.open(temporary, "wx", 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  try {
    try { await fs.link(temporary, file); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    const parent = await fs.open(path.dirname(file), "r");
    try { await parent.sync(); } finally { await parent.close(); }
    return await read();
  } finally { await fs.unlink(temporary); }
}
