import { createHmac } from "node:crypto";
import { prisma } from "@traceforge/db";
import { loadEnv } from "@traceforge/env";
import { Worker, type Job } from "bullmq";
import { Redis } from "ioredis";

const env = loadEnv();
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const MAX_ATTEMPTS = 6;
const DELIVERY_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 4_096;

type DeliveryJob = { deliveryId: string };

async function readResponseBody(response: Response) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (length < MAX_RESPONSE_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = value.subarray(0, MAX_RESPONSE_BYTES - length);
    chunks.push(chunk);
    length += chunk.length;
    if (chunk.length < value.length) break;
  }
  await reader.cancel().catch(() => undefined);
  return Buffer.concat(chunks).toString("utf8");
}

async function processDelivery(job: Job<DeliveryJob>) {
  const delivery = await prisma.delivery.findUnique({
    where: { id: job.data.deliveryId },
    include: { endpoint: true },
  });
  if (!delivery) return;
  if (!delivery.endpoint.enabled) {
    await prisma.delivery.update({
      where: { id: delivery.id },
      data: { status: "failed", lastError: "Endpoint is disabled." },
    });
    return;
  }

  const attemptNumber = job.attemptsMade + 1;
  const body = JSON.stringify({
    id: delivery.id,
    type: delivery.eventType,
    createdAt: delivery.createdAt.toISOString(),
    data: delivery.payload,
  });
  const signature = createHmac("sha256", delivery.endpoint.secret)
    .update(body)
    .digest("hex");
  await prisma.delivery.update({
    where: { id: delivery.id },
    data: {
      status: "processing",
      attemptCount: attemptNumber,
      nextAttemptAt: null,
      lastError: null,
    },
  });

  let statusCode: number | null = null;
  let responseBody = "";
  let failure: string | null = null;
  try {
    const response = await fetch(delivery.endpoint.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "TraceForge-Webhooks/1.0",
        "x-traceforge-delivery": delivery.id,
        "x-traceforge-event": delivery.eventType,
        "x-traceforge-signature": `sha256=${signature}`,
      },
      body,
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      redirect: "manual",
    });
    statusCode = response.status;
    responseBody = await readResponseBody(response);
    if (!response.ok) failure = `Endpoint returned HTTP ${response.status}.`;
  } catch (error) {
    failure =
      error instanceof Error
        ? error.message.slice(0, 1_000)
        : "Endpoint request failed.";
  }

  const exhausted = failure !== null && attemptNumber >= MAX_ATTEMPTS;
  const retryDelayMs = Math.min(1_000 * 2 ** (attemptNumber - 1), 60_000);
  await prisma.delivery.update({
    where: { id: delivery.id },
    data: {
      status: failure ? (exhausted ? "failed" : "retrying") : "succeeded",
      lastStatusCode: statusCode,
      responseBody,
      lastError: failure,
      nextAttemptAt:
        failure && !exhausted ? new Date(Date.now() + retryDelayMs) : null,
    },
  });
  if (failure && !exhausted) throw new Error(failure);
}

const worker = new Worker<DeliveryJob>("webhook-deliveries", processDelivery, {
  connection,
  concurrency: 10,
  limiter: { max: 100, duration: 1_000 },
});

worker.on("completed", (job) =>
  process.stdout.write(`Delivery ${job.data.deliveryId} processed.\n`),
);
worker.on("failed", (job, error) =>
  process.stderr.write(
    `Delivery ${job?.data.deliveryId ?? "unknown"} failed: ${error.message}\n`,
  ),
);

async function shutdown(signal: string) {
  process.stdout.write(`Received ${signal}; shutting down worker.\n`);
  await worker.close();
  await connection.quit();
  await prisma.$disconnect();
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
