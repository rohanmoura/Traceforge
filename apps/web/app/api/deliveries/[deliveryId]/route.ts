import { prisma } from "@traceforge/db";
import { isAuthorizedApiRequest } from "@/src/server/api-auth";

export async function GET(
  request: Request,
  context: { params: Promise<{ deliveryId: string }> },
) {
  if (!isAuthorizedApiRequest(request))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { deliveryId } = await context.params;
  const delivery = await prisma.delivery.findUnique({
    where: { id: deliveryId },
    select: {
      id: true,
      eventType: true,
      status: true,
      attemptCount: true,
      nextAttemptAt: true,
      lastStatusCode: true,
      lastError: true,
      responseBody: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!delivery)
    return Response.json({ error: "Delivery not found." }, { status: 404 });
  return Response.json({ delivery });
}
