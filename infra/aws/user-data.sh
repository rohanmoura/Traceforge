#!/bin/bash
set -euo pipefail

exec > >(tee -a /var/log/traceforge-bootstrap.log | logger -t traceforge-bootstrap -s 2>/dev/console) 2>&1

dnf update -y
dnf install -y docker git
systemctl enable --now docker
mkdir -p /usr/local/lib/docker/cli-plugins
curl -fsSL https://github.com/docker/compose/releases/download/v2.39.4/docker-compose-linux-x86_64 \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

TOKEN=$(curl -fsS -X PUT -H 'X-aws-ec2-metadata-token-ttl-seconds: 21600' http://169.254.169.254/latest/api/token)
PUBLIC_IP=$(curl -fsS -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4)
mkdir -p /etc/letsencrypt
docker run --rm -p 80:80 -v /etc/letsencrypt:/etc/letsencrypt certbot/certbot:v5.4.0 \
  certonly --standalone --non-interactive --agree-tos --register-unsafely-without-email \
  --preferred-profile shortlived --ip-address "$PUBLIC_IP" --cert-name traceforge

git clone --depth 1 --branch __GIT_REF__ __REPOSITORY__ /opt/traceforge
cd /opt/traceforge

cat > .env.production <<EOF
POSTGRES_PASSWORD=$(openssl rand -hex 32)
TRACEFORGE_API_KEY=$(openssl rand -hex 32)
TRACEFORGE_PUBLIC_READONLY=false
APP_BIND_ADDRESS=127.0.0.1
APP_PORT=3000
TRACEFORGE_IMAGE=rohanmoura/traceforge:latest
PUBLIC_IP=$PUBLIC_IP
EOF
chmod 600 .env.production

docker compose --profile tls --env-file .env.production pull
docker compose --profile tls --env-file .env.production up -d

cat > /etc/systemd/system/traceforge-cert-renew.service <<'EOF'
[Unit]
Description=Renew TraceForge public IP TLS certificate
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
WorkingDirectory=/opt/traceforge
ExecStartPre=-/usr/bin/docker compose --profile tls --env-file .env.production stop caddy
ExecStart=/usr/bin/docker run --rm --network host -v /etc/letsencrypt:/etc/letsencrypt certbot/certbot:v5.4.0 renew --non-interactive --preferred-profile shortlived
ExecStartPost=/usr/bin/docker compose --profile tls --env-file .env.production start caddy
ExecStopPost=/usr/bin/docker compose --profile tls --env-file .env.production start caddy

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/traceforge-cert-renew.timer <<'EOF'
[Unit]
Description=Check TraceForge IP certificate renewal daily

[Timer]
OnCalendar=daily
RandomizedDelaySec=15m
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now traceforge-cert-renew.timer
