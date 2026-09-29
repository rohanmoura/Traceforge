import { prisma } from "@traceforge/db";
import { isAuthorizedApiRequest } from "@/src/server/api-auth";

export async function GET(request: Request) {
  if (!isAuthorizedApiRequest(request))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const endpointId = new URL(request.url).searchParams.get("endpointId");
  if (!endpointId)
    return Response.json({ error: "endpointId is required." }, { status: 400 });
  const deliveries = await prisma.delivery.findMany({
    where: { endpointId },
    select: {
      id: true,
      eventType: true,
      status: true,
      attemptCount: true,
      lastStatusCode: true,
      lastError: true,
      responseBody: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return Response.json({ deliveries });
}
