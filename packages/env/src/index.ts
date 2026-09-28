import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z
    .string()
    .url()
    .default(
      "postgresql://traceforge:traceforge@localhost:5432/traceforge?schema=public",
    ),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
});

export function loadEnv(source: NodeJS.ProcessEnv = process.env) {
  const result = envSchema.safeParse(source);
  if (!result.success)
    throw new Error(
      `Invalid environment configuration: ${result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`,
    );
  return result.data;
}
