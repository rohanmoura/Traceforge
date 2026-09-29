import { loadEnv } from "@traceforge/env";

export async function GET() {
  const { TRACEFORGE_PUBLIC_READONLY } = loadEnv();
  return Response.json({ publicReadOnly: TRACEFORGE_PUBLIC_READONLY });
}
