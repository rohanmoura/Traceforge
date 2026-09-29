import { prisma, type Prisma } from "@traceforge/db";
import { isAuthorizedApiRequest } from "@/src/server/api-auth";
import { deliveryQueue } from "@/src/server/queue";
import { z } from "zod";

const createEventSchema = z.object({
  type: z.string().trim().min(1).max(200),
  payload: z.record(z.unknown()),
});
const MAX_BODY_BYTES = 256 * 1024;

export async function POST(
  request: Request,
  context: { params: Promise<{ endpointId: string }> },
) {
  if (!isAuthorizedApiRequest(request))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES)
    return Response.json(
      { error: "Request body exceeds 256 KiB." },
      { status: 413 },
    );
  const parsed = createEventSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return Response.json(
      { error: "A valid event type and JSON object payload are required." },
      { status: 400 },
    );
  if (Buffer.byteLength(JSON.stringify(parsed.data)) > MAX_BODY_BYTES)
    return Response.json(
      { error: "Request body exceeds 256 KiB." },
      { status: 413 },
    );
  const { endpointId } = await context.params;
  const endpoint = await prisma.endpoint.findFirst({
    where: { id: endpointId, enabled: true },
    select: { id: true },
  });
  if (!endpoint)
    return Response.json(
      { error: "Enabled endpoint not found." },
      { status: 404 },
    );
  const delivery = await prisma.delivery.create({
    data: {
      eventType: parsed.data.type,
      payload: JSON.parse(
        JSON.stringify(parsed.data.payload),
      ) as Prisma.InputJsonValue,
      endpointId,
    },
  });
  try {
    await deliveryQueue.add(
      "deliver",
      { deliveryId: delivery.id },
      {
        jobId: delivery.id,
        attempts: 6,
        backoff: { type: "exponential", delay: 1_000 },
        removeOnComplete: 1_000,
        removeOnFail: 5_000,
      },
    );
  } catch (error) {
    await prisma.delivery.update({
      where: { id: delivery.id },
      data: {
        status: "failed",
        lastError: "Queue unavailable; delivery was not scheduled.",
      },
    });
    throw error;
  }
  return Response.json(
    { deliveryId: delivery.id, status: "pending" },
    { status: 202 },
  );
}
