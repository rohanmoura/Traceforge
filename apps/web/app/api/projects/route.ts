import { prisma } from "@traceforge/db";
import { isAuthorizedApiRequest } from "@/src/server/api-auth";
import { z } from "zod";

const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

export async function POST(request: Request) {
  if (!isAuthorizedApiRequest(request))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = createProjectSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return Response.json(
      { error: "A project name is required." },
      { status: 400 },
    );
  const project = await prisma.project.create({
    data: parsed.data,
    include: { _count: { select: { endpoints: true } } },
  });
  return Response.json({ project }, { status: 201 });
}

export async function GET(request: Request) {
  if (!isAuthorizedApiRequest(request))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const projects = await prisma.project.findMany({
    include: { _count: { select: { endpoints: true } } },
    orderBy: { createdAt: "desc" },
  });
  return Response.json({ projects });
}
