import { isIP } from "node:net";

function isPrivateIpv4(address: string) {
  const octets = address.split(".").map(Number);
  const [first, second] = octets;
  if (first === undefined) return true;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second !== undefined && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    first >= 224
  );
}

export function validateEndpointUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Endpoint URL must use HTTP or HTTPS.");
  }
  if (url.username || url.password) {
    throw new Error("Endpoint URL must not include credentials.");
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const ipVersion = isIP(host);
  const localName =
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local");
  const privateAddress =
    ipVersion === 4
      ? isPrivateIpv4(host)
      : ipVersion === 6 &&
        (host === "::1" ||
          host.startsWith("fc") ||
          host.startsWith("fd") ||
          host.startsWith("fe80:"));
  if (localName || privateAddress) {
    throw new Error("Endpoint URL must point to a publicly reachable host.");
  }
  return url.toString();
}
