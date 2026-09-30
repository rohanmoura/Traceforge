FROM node:22-alpine

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

ENV DATABASE_URL=postgresql://traceforge:traceforge@postgres:5432/traceforge?schema=public
ENV REDIS_URL=redis://redis:6379
COPY . .
RUN pnpm install --frozen-lockfile --prod=false
RUN pnpm build
ENV NODE_ENV=production
RUN pnpm prune --prod

EXPOSE 3000
CMD ["pnpm", "--filter", "@traceforge/web", "start"]
