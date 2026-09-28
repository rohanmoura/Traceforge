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
