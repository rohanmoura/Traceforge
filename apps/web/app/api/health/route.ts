import { prisma } from "@traceforge/db";
import { loadEnv } from "@traceforge/env";
import { Redis } from "ioredis";

export async function GET() {
  const { REDIS_URL } = loadEnv();
  const redis = new Redis(REDIS_URL, {
    connectTimeout: 1500,
    maxRetriesPerRequest: 0,
    lazyConnect: true,
  });
  try {
    await prisma.$queryRaw`SELECT 1`;
    await redis.connect();
    await redis.ping();
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503 });
  } finally {
    redis.disconnect();
  }
}
