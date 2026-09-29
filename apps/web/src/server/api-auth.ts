import { timingSafeEqual } from "node:crypto";
import { loadEnv } from "@traceforge/env";

export function hasValidApiKey(request: Request) {
  const configuredKey = loadEnv().TRACEFORGE_API_KEY;
  const authorization = request.headers.get("authorization") ?? "";
  const suppliedKey = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  if (configuredKey) {
    const expected = Buffer.from(configuredKey);
    const supplied = Buffer.from(suppliedKey);
    if (
      expected.length === supplied.length &&
      timingSafeEqual(expected, supplied)
    )
      return true;
  }
  return false;
}

export function isPublicReadOnlyGuestRequest(request: Request) {
  return (
    loadEnv().TRACEFORGE_PUBLIC_READONLY &&
    request.method === "GET" &&
    !hasValidApiKey(request)
  );
}

export function isAuthorizedApiRequest(request: Request) {
  return (
    hasValidApiKey(request) ||
    (loadEnv().TRACEFORGE_PUBLIC_READONLY && request.method === "GET")
  );
}
