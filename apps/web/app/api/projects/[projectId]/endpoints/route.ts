import { randomBytes } from "node:crypto";
import { prisma, type Prisma } from "@traceforge/db";
import { validateEndpointUrl } from "@traceforge/env";
import {
  isAuthorizedApiRequest,
  isPublicReadOnlyGuestRequest,
} from "@/src/server/api-auth";
import { z } from "zod";

const createEndpointSchema = z.object({
  name: z.string().trim().min(1).max(100),
  url: z.string().url(),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  if (!isAuthorizedApiRequest(request))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId } = await context.params;
  const endpoints = await prisma.endpoint.findMany({
    where: { projectId },
    select: {
      id: true,
      name: true,
      url: true,
      enabled: true,
      createdAt: true,
      _count: { select: { deliveries: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  type EndpointWithDeliveryCount = Prisma.EndpointGetPayload<{
    select: {
      id: true;
      name: true;
      url: true;
      enabled: true;
      createdAt: true;
      _count: { select: { deliveries: true } };
    };
  }>;
  return Response.json({
    endpoints: isPublicReadOnlyGuestRequest(request)
      ? endpoints.map((endpoint: EndpointWithDeliveryCount) => ({
          ...endpoint,
          url: new URL(endpoint.url).origin,
        }))
      : endpoints,
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  if (!isAuthorizedApiRequest(request))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = createEndpointSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return Response.json(
      { error: "A valid endpoint name and URL are required." },
      { status: 400 },
    );
  let url: string;
  try {
    url = validateEndpointUrl(parsed.data.url);
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Invalid endpoint URL.",
      },
      { status: 400 },
    );
  }
  const { projectId } = await context.params;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });
  if (!project)
    return Response.json({ error: "Project not found." }, { status: 404 });
  const endpoint = await prisma.endpoint.create({
    data: {
      ...parsed.data,
      url,
      projectId,
      secret: randomBytes(32).toString("hex"),
    },
    select: {
      id: true,
      name: true,
      url: true,
      enabled: true,
      projectId: true,
      createdAt: true,
      _count: { select: { deliveries: true } },
    },
  });
  return Response.json({ endpoint }, { status: 201 });
}
