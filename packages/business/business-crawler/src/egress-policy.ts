/*
<MODULE_CONTRACT>
<purpose>Egress policy address validation for HTTP acquisition (RFC-0103).</purpose>
<non-goals>
  <item>This module does not perform network requests or DNS resolution.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation — extracted from app capture-policy for shared reuse (RFC-0103).</item>
</CHANGE_SUMMARY>
*/

import type { EgressPolicy } from "./types.js";

const PRIVATE_IPV4_RANGES: readonly [number, number][] = [
  [0x0a000000, 0x0affffff], // 10.0.0.0/8
  [0xac100000, 0xac1fffff], // 172.16.0.0/12
  [0xc0a80000, 0xc0a8ffff], // 192.168.0.0/16
];

const isPrivateIpv4 = (ip: string): boolean => {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return false;
  const num = ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
  return PRIVATE_IPV4_RANGES.some(([lo, hi]) => num >= lo && num <= hi);
};

const isLoopback = (ip: string): boolean => {
  if (ip === "127.0.0.1" || ip === "::1") return true;
  return ip.startsWith("127.") || ip.startsWith("::ffff:127.");
};

const isLinkLocal = (ip: string): boolean => {
  if (ip.startsWith("169.254.")) return true;
  if (ip.startsWith("fe80:")) return true;
  return false;
};

const isMulticast = (ip: string): boolean => {
  if (ip.startsWith("224.") || ip.startsWith("239.")) return true;
  if (ip.startsWith("ff")) return true;
  return false;
};

const isReserved = (ip: string): boolean => {
  if (ip === "0.0.0.0" || ip === "::") return true;
  if (ip.startsWith("0.")) return true;
  if (ip.startsWith("240.") || ip.startsWith("255.")) return true;
  return false;
};

const METADATA_HOSTS = new Set([
  "169.254.169.254", // AWS / Azure / GCP metadata
  "fd00:ec2::254", // AWS IPv6 metadata
  "100.100.100.200", // Alibaba Cloud metadata
  "metadata.google.internal", // GCP metadata (DNS-based)
  "metadata.azure.com", // Azure metadata (DNS-based)
]);

const isMetadata = (ip: string): boolean => {
  if (METADATA_HOSTS.has(ip)) return true;
  // Cloud metadata via link-local 169.254.169.254 is already caught by isLinkLocal,
  // but we add an explicit deny for clarity and for DNS-based metadata hosts.
  return false;
};

const extractIpv4FromMapped = (ip: string): string | null => {
  // IPv4-mapped IPv6: ::ffff:a.b.c.d
  const match = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  return match ? match[1] : null;
};

export const isAddressBlocked = (ip: string, policy: EgressPolicy): boolean => {
  // Unwrap IPv4-mapped IPv6 before checking IPv4 ranges
  const mappedIpv4 = extractIpv4FromMapped(ip);
  const effectiveIp = mappedIpv4 ?? ip;

  if (policy.denyMetadata && isMetadata(effectiveIp)) return true;
  if (policy.denyPrivateAddresses && isPrivateIpv4(effectiveIp)) return true;
  if (policy.denyLoopback && isLoopback(effectiveIp)) return true;
  if (policy.denyLinkLocal && isLinkLocal(effectiveIp)) return true;
  if (policy.denyMulticast && isMulticast(effectiveIp)) return true;
  if (policy.denyReserved && isReserved(effectiveIp)) return true;
  if (policy.includeIpv6 && effectiveIp.includes(":")) {
    if (policy.denyLoopback && effectiveIp === "::1") return true;
    if (policy.denyLinkLocal && effectiveIp.startsWith("fe80:")) return true;
    if (policy.denyMulticast && effectiveIp.startsWith("ff")) return true;
  }
  return false;
};

export const DEFAULT_EGRESS_POLICY: EgressPolicy = {
  denyPrivateAddresses: true,
  denyLoopback: true,
  denyLinkLocal: true,
  denyMulticast: true,
  denyReserved: true,
  denyMetadata: true,
  includeIpv6: true,
};
