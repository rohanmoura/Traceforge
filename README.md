# TraceForge

TraceForge is a developer platform for observing API integrations and making webhook delivery failures recoverable.

## Requirements

- Node.js 22.13 or newer in the 22.x line
- pnpm 9.15.9
- Docker Desktop with Compose

## Start locally

```sh
pnpm install
Copy-Item .env.example .env
docker compose up -d
pnpm db:generate
pnpm db:migrate
pnpm dev
```

The web app runs at http://localhost:3000. The worker is a separate process managed by the monorepo task runner. PostgreSQL and Redis start through Docker Compose.

## Workspace

- `apps/web`: Next.js App Router interface
- `apps/worker`: background delivery worker
- `packages/db`: Prisma schema, client, and migration commands
- `packages/env`: validated server environment configuration
- `packages/ui`: shared interface components
- `packages/eslint-config`: shared lint rules
- `packages/typescript-config`: shared TypeScript settings

## Useful commands

- `pnpm dev`: run the web app and worker
- `pnpm lint`: lint all workspace packages
- `pnpm typecheck`: check workspace types
- `pnpm build`: build all deployable packages
- `pnpm db:migrate`: create or apply a local Prisma migration
- `pnpm db:studio`: inspect the local database

## Security notes

Copy `.env.example` to `.env` for local development. Never commit credentials or production secrets. Compose credentials are intended for local development only.

## API quick start

Set `TRACEFORGE_API_KEY` in `.env` to a random value of at least 32 characters. API requests use `Authorization: Bearer <key>`.

Create a project:

```sh
curl -X POST http://localhost:3000/api/projects -H "Authorization: Bearer $TRACEFORGE_API_KEY" -H "Content-Type: application/json" -d '{"name":"Demo project"}'
```

Create an endpoint using the returned project ID:

```sh
curl -X POST http://localhost:3000/api/projects/<project-id>/endpoints -H "Authorization: Bearer $TRACEFORGE_API_KEY" -H "Content-Type: application/json" -d '{"name":"Local receiver","url":"https://example.com/webhooks"}'
```

Send an event using the returned endpoint ID:

```sh
curl -X POST http://localhost:3000/api/endpoints/<endpoint-id>/events -H "Authorization: Bearer $TRACEFORGE_API_KEY" -H "Content-Type: application/json" -d '{"type":"invoice.paid","payload":{"invoiceId":"inv_123"}}'
```

The event endpoint returns `202` with a delivery ID. The worker signs the JSON body with HMAC-SHA256 in `x-traceforge-signature` (`sha256=<hex>`), records attempt results, and retries failures with exponential backoff. Inspect status with `GET /api/deliveries/<delivery-id>` using the same bearer key.


TraceForge kya karta hai?
Maan lo tumhari app payment provider ya kisi doosri service se webhook events leti hai. Kabhi tumhara server down hota hai ya timeout ho jata hai, aur event silently miss ho sakta hai. TraceForge har webhook delivery ko record karta hai, failure par retry karta hai, aur tumhe status, attempts aur response dikhata hai.

I built TraceForge, a webhook reliability and observability platform. It queues webhook events, signs each delivery, retries failures with backoff, and stores delivery attempts and responses so developers can troubleshoot integrations.