import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Observation } from '@org/observatory-core';
import { canonicalize } from './canonicalize.js';
import type { SignedObservation, SigningKeyConfig } from './types.js';

// Fields added by signing — excluded from the signed payload.
const SIGNING_FIELDS = new Set([
  'signature',
  'signed_at',
  'signing_key_id',
  'collector_id',
] as const);

/**
 * Computes the signing payload for an observation.
 *
 * Payload = SHA-256( RFC 8785( observation_without_signing_fields ) )
 */
export function signingPayload(obs: Observation): Buffer {
  const stripped: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obs)) {
    if (!SIGNING_FIELDS.has(k as never)) stripped[k] = v;
  }
  const canonical = canonicalize(stripped);
  return crypto.createHash('sha256').update(canonical, 'utf-8').digest();
}

/**
 * Signs an observation and returns a new SignedObservation with the four
 * signing fields appended. Does not mutate the input.
 */
export function signObservation(
  obs: Observation,
  key: SigningKeyConfig,
): SignedObservation {
  const payload = signingPayload(obs);
  const privateKey = crypto.createPrivateKey(key.privateKeyPem);
  const sigBytes = crypto.sign(null, payload, privateKey);
  const signature = sigBytes.toString('base64url');

  return {
    ...obs,
    signature,
    signed_at: new Date().toISOString(),
    signing_key_id: key.signingKeyId,
    collector_id: key.collectorId,
  };
}

/**
 * Loads the signing key from environment variables (canonical path):
 *
 *   DEVICE_ID            — operational identity (= collector_id in signed obs)
 *   DEVICE_SIGNING_KEY   — base64-encoded PKCS8 PEM ed25519 private key,
 *                          or base64-encoded raw PKCS8 DER (auto-detected)
 *
 * Public key is derived from the private key; signing_key_id is derived as
 *   "<DEVICE_ID>-<sha256(publicKeyPem) first 16 hex chars>"
 *
 * Rotation: generate a new key, replace DEVICE_SIGNING_KEY, optionally bump
 * DEVICE_ID. The signing_key_id changes automatically because the public key
 * fingerprint changes — old observations remain verifiable via their stored
 * key_id, new ones use the new key_id.
 */
export function loadSigningKeyFromEnv(): SigningKeyConfig {
  const deviceId = process.env.DEVICE_ID?.trim();
  const keyB64 = process.env.DEVICE_SIGNING_KEY?.trim();
  if (!deviceId) {
    throw new Error('DEVICE_ID env var is required (e.g. set in .env at repo root).');
  }
  if (!keyB64) {
    throw new Error(
      'DEVICE_SIGNING_KEY env var is required (base64-encoded PKCS8 PEM or DER). ' +
      'Run `pnpm setup:device-id` to generate one.',
    );
  }

  const decoded = Buffer.from(keyB64, 'base64');
  const decodedStr = decoded.toString('utf-8');

  let privateKeyPem: string;
  let privateKey: crypto.KeyObject;
  if (decodedStr.includes('-----BEGIN PRIVATE KEY-----')) {
    privateKeyPem = decodedStr;
    privateKey = crypto.createPrivateKey(privateKeyPem);
  } else {
    privateKey = crypto.createPrivateKey({ key: decoded, format: 'der', type: 'pkcs8' });
    privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  }

  const publicKey = crypto.createPublicKey(privateKey);
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
  const fingerprint = crypto.createHash('sha256').update(publicKeyPem).digest('hex').slice(0, 16);
  const signingKeyId = `${deviceId}-${fingerprint}`;

  return { privateKeyPem, publicKeyPem, signingKeyId, collectorId: deviceId };
}

/**
 * @deprecated Use loadSigningKeyFromEnv() and the .env / DEVICE_SIGNING_KEY mechanism.
 * Kept temporarily for migration of legacy .input/signing-key/ deployments.
 */
export async function loadSigningKey(keyDir: string): Promise<SigningKeyConfig> {
  const [privateKeyPem, publicKeyPem, signingKeyId, collectorId] = await Promise.all([
    fsp.readFile(path.join(keyDir, 'private.pem'), 'utf-8'),
    fsp.readFile(path.join(keyDir, 'public.pem'), 'utf-8'),
    fsp.readFile(path.join(keyDir, 'key-id.txt'), 'utf-8').then((s) => s.trim()),
    fsp.readFile(path.join(keyDir, 'collector-id.txt'), 'utf-8').then((s) => s.trim()),
  ]);
  return { privateKeyPem, publicKeyPem, signingKeyId, collectorId };
}

/**
 * Generates a fresh ed25519 key pair and returns the PEM strings.
 * Operator is responsible for writing them to disk at the conventional path.
 *
 * Example usage:
 *   const { privateKeyPem, publicKeyPem } = generateSigningKey();
 *   await fs.writeFile('.input/signing-key/private.pem', privateKeyPem);
 *   await fs.writeFile('.input/signing-key/public.pem', publicKeyPem);
 */
export function generateSigningKey(): { privateKeyPem: string; publicKeyPem: string } {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  return { privateKeyPem: privateKey as string, publicKeyPem: publicKey as string };
}
