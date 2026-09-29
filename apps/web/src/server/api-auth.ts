import { timingSafeEqual } from "node:crypto";
import { loadEnv } from "@traceforge/env";

export function isAuthorizedApiRequest(request: Request) {
  const configuredKey = loadEnv().TRACEFORGE_API_KEY;
  if (!configuredKey) return false;
  const authorization = request.headers.get("authorization") ?? "";
  const suppliedKey = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  const expected = Buffer.from(configuredKey);
  const supplied = Buffer.from(suppliedKey);
  return (
    expected.length === supplied.length && timingSafeEqual(expected, supplied)
  );
}
