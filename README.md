# TraceForge

TraceForge is a webhook delivery service for applications that need dependable integrations. Register a receiver URL, submit a typed JSON event, and TraceForge queues delivery, signs each request with HMAC-SHA256, retries failures, and records the outcome for inspection.

## Run locally

### Build from source

Requirements: Docker Desktop, Git, Node.js 22, and pnpm 9.

```powershell
git clone https://github.com/rohanmoura/Traceforge.git
cd Traceforge
.\scripts\start-local.ps1 -Mode source
```

Open http://localhost:3000. The launcher creates `.env` with a random API key on first run. Use `TRACEFORGE_API_KEY` from that file when connecting the workspace. Local PostgreSQL and Redis data persist in Docker volumes. Stop containers without deleting data using `docker compose down`; remove data too with `docker compose down -v`.

### Run published Docker Hub images (no source clone)

Requirements: Docker Desktop. After a successful GitHub Actions publish, use a PowerShell window:

```powershell
Invoke-WebRequest https://raw.githubusercontent.com/rohanmoura/Traceforge/main/scripts/start-local.ps1 -OutFile start-local.ps1
powershell -ExecutionPolicy Bypass -File .\start-local.ps1 -Mode image -DockerHubImage rohanmoura/traceforge:latest
```

The launcher downloads the Compose files, creates a unique local API key, pulls the image, and starts PostgreSQL, Redis, web, and worker. It saves config/data under `%LOCALAPPDATA%\TraceForge`. Stop it from that directory with:

```powershell
docker compose --env-file .env down
```

## Launch on AWS EC2

This is your own writable TraceForge server—not a pre-seeded demo. One command launches an EC2 instance; it clones this GitHub repo, installs Docker Compose, generates fresh database/API secrets, obtains a short-lived trusted HTTPS certificate for its public IP, pulls your published Docker Hub image, runs migrations, and starts the web app, worker, PostgreSQL, Redis, and HTTPS proxy. You receive an `https://<public-ip>` URL to share. The instance and data stay yours until you stop or terminate it.

### One-time setup

1. Make the `rohanmoura/traceforge` Docker Hub repository **public** and confirm the GitHub Actions run named **Publish TraceForge image** succeeds. Your `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` repository secrets are already configured; the workflow publishes the image used by both local image-only access and EC2.
2. Install AWS CLI and run `aws configure` with your AWS account credentials and preferred region. The IAM identity needs permissions to create EC2 instances/security groups, create and configure an instance profile/role, attach `AmazonSSMManagedInstanceCore`, and pass that role to EC2. The region must have a default VPC. Do not put AWS credentials in this repository.
3. Make sure the selected region has capacity for the instance type. Launch defaults to `t3.small`; the app is pulled as an image so EC2 does not compile the monorepo.

### Launch for an interview

Run in the repo directory:

```powershell
.\scripts\aws\deploy.ps1
```

Or explicitly select region/type/ref:

```powershell
.\scripts\aws\deploy.ps1 -Region ap-south-1 -InstanceType t3.small -GitRef main
```

The script waits for the app health check and prints the EC2 instance ID and public URL, for example `https://3.110.20.30`. Initial startup takes a few minutes while the OS installs Docker, requests the certificate, and pulls the services. Ports 80 (HTTPS redirect/certificate renewal) and 443 (HTTPS) are open publicly; SSH, the database, and Redis are not. The EC2 instance profile allows you to connect through AWS Systems Manager Session Manager instead of opening SSH. For owner access, use SSM to read `TRACEFORGE_API_KEY` from `/opt/traceforge/.env.production`, then enter it in TraceForge before showing your screen. Do not share that key.

### Remove after the interview

Each launch gets a new public IP and a certificate for that exact IP. After the interview, permanently remove the instance, database volume, and per-launch security group:

```powershell
.\scripts\aws\terminate.ps1 -InstanceId i-0123456789abcdef0 -Region ap-south-1
```

It asks for `DELETE` before making changes. The next time, run `deploy.ps1` again for a fresh IP, secrets, database, and certificate. AWS charges for the running instance, EBS storage, and public IPv4 while assigned; account Free Tier/credits may or may not cover them. Check the billing dashboard rather than assuming this is free.

The EC2 URL uses HTTPS directly on its IP, so owner login and API calls are encrypted without needing to own a domain. Let's Encrypt IP certificates are short-lived (about 6 days); an automatic daily renewal timer runs while the instance is up. Since this workflow deletes the instance after each interview, the next launch requests a fresh certificate for its new IP. Use synthetic payloads rather than sensitive production data. The EC2 launcher intentionally keeps the workspace owner-controlled and writable after authentication.

### Troubleshooting the EC2 launch

Connect to the instance using AWS Console → EC2 → Instances → select instance → Connect → Session Manager. Then inspect bootstrap/app logs:

```bash
sudo tail -n 200 /var/log/traceforge-bootstrap.log
cd /opt/traceforge
sudo docker compose --env-file .env.production ps
sudo docker compose --env-file .env.production logs --tail=100
sudo systemctl status traceforge-cert-renew.timer
```

## Try a webhook

Create a temporary request receiver at [Webhook.site](https://webhook.site), copy its unique HTTPS URL, add it as a TraceForge endpoint, and queue an event such as `order.created`. Check the captured request and signature header on Webhook.site, then confirm the HTTP status and retry history in TraceForge. Treat the receiver URL as a secret because anyone holding it can inspect requests.

## Product behavior

- API-key authentication for workspace API requests
- Projects and endpoints persisted in PostgreSQL
- Asynchronous delivery through Redis and BullMQ
- HMAC-SHA256 request signatures in `x-traceforge-signature`
- Exponential retries for non-2xx responses and network errors, up to six attempts
- Delivery status, attempt count, HTTP status, error, and response body in the dashboard
- Endpoint URL validation and request/payload size limits

## API

Send events using `Authorization: Bearer <TRACEFORGE_API_KEY>`:

```http
POST /api/endpoints/{endpointId}/events
Content-Type: application/json
Authorization: Bearer <TRACEFORGE_API_KEY>

{
  "type": "order.created",
  "payload": { "orderId": "ord_123", "total": 49.99 }
}
```

The API returns `202 Accepted` and a delivery ID when an event is queued. The receiver gets an envelope containing `id`, `type`, `createdAt`, and `data`. Verify `x-traceforge-signature` against the exact raw request body using the endpoint signing secret.

## Repository structure

- `apps/web`: Next.js dashboard and API
- `apps/worker`: BullMQ worker that signs, delivers, retries, and records webhook results
- `packages/db`: Prisma schema and PostgreSQL migrations
- `packages/env`: validated environment and endpoint URL configuration
- `packages/ui`: shared UI components
- `infra/aws/user-data.sh`, `scripts/aws`: EC2 provisioning and lifecycle helpers
- `Dockerfile`, `docker-compose.yml`: app image and local/EC2 services

## Development commands

- `pnpm dev`: run dashboard and worker in development mode
- `pnpm lint`, `pnpm typecheck`, `pnpm build`: quality and production-build checks
- `pnpm db:migrate`: create/apply a local development migration
- `pnpm db:studio`: inspect persisted workspace and delivery data

`.env` and `.env.production` contain secrets and must never be committed.
