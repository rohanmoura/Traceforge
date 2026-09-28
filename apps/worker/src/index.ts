import { loadEnv } from "@traceforge/env";

const env = loadEnv();

async function main() {
  process.stdout.write(`TraceForge worker scaffold ready (${env.NODE_ENV}).\n`);
}

main().catch((error: unknown) => {
  process.stderr.write("TraceForge worker failed to start.\n");
  process.stderr.write(
    `${error instanceof Error ? error.stack : String(error)}\n`,
  );
  process.exitCode = 1;
});
