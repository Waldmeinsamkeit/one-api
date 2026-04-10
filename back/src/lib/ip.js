export function isLocalhostIp(rawIp) {
  if (!rawIp) {
    return false;
  }
  const ip = String(rawIp).trim().toLowerCase();
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}
