import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { loadEnv } from "@traceforge/env";

const { REDIS_URL } = loadEnv();

export const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
export const deliveryQueue = new Queue("webhook-deliveries", {
  connection: redis,
});
