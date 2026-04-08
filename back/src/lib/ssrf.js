import dns from "node:dns/promises";
import net from "node:net";

const PRIVATE_V4_PREFIXES = [
  "10.",
  "127.",
  "169.254.",
  "172.16.",
  "172.17.",
  "172.18.",
  "172.19.",
  "172.20.",
  "172.21.",
  "172.22.",
  "172.23.",
  "172.24.",
  "172.25.",
  "172.26.",
  "172.27.",
  "172.28.",
  "172.29.",
  "172.30.",
  "172.31.",
  "192.168.",
  "0."
];

function isPrivateIpv4(ip) {
  return PRIVATE_V4_PREFIXES.some((prefix) => ip.startsWith(prefix));
}

export function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    return isPrivateIpv4(ip);
  }
  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    return (
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80")
    );
  }
  return true;
}

async function assertSafeHost(hostname) {
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new Error(`SSRF blocked: disallowed IP ${hostname}`);
    }
    return;
  }
  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!records.length) {
    throw new Error("DNS lookup returned no records");
  }
  for (const record of records) {
    if (isPrivateIp(record.address)) {
      throw new Error(`SSRF blocked: hostname resolves to private IP (${record.address})`);
    }
  }
}

export async function assertSafeUrl(inputUrl, { allowPrivateIp = false } = {}) {
  const parsed = new URL(inputUrl);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`Unsupported protocol: ${parsed.protocol}`);
  }
  if (parsed.username || parsed.password) {
    throw new Error("URL credentials are not allowed");
  }
  const port = parsed.port ? Number(parsed.port) : parsed.protocol === "https:" ? 443 : 80;
  if (Number.isNaN(port) || port < 1 || port > 65535) {
    throw new Error("Invalid port");
  }
  if (allowPrivateIp) {
    return;
  }
  await assertSafeHost(parsed.hostname);
}
