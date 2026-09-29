param(
  [ValidateSet("source", "image")]
  [string]$Mode = "source",
  [string]$DockerHubImage
)

$ErrorActionPreference = "Stop"
$repoUrl = "https://github.com/rohanmoura/Traceforge"
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)

if ($Mode -eq "source") {
  $workspace = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
  Set-Location $workspace
  if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    $apiKey = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
    [System.IO.File]::WriteAllText((Join-Path $workspace ".env"), (Get-Content ".env" -Raw).Replace("replace-with-a-random-secret-at-least-32-characters", $apiKey), $utf8NoBom)
  }
  if ((Get-Content ".env" -Raw) -match "replace-with-a-random-secret") {
    throw "Replace the placeholder TRACEFORGE_API_KEY in .env with a random secret, or delete .env and rerun this launcher."
  }
  docker compose up --build -d
  if ($LASTEXITCODE -ne 0) { throw "TraceForge failed to start." }
  Write-Host "TraceForge is available at http://localhost:3000"
  Write-Host "Use TRACEFORGE_API_KEY from $workspace\.env to connect."
  exit 0
}

if (-not $DockerHubImage) {
  throw "Pass -DockerHubImage with your public Docker Hub image, e.g. myname/traceforge:latest."
}

$workspace = Join-Path $env:LOCALAPPDATA "TraceForge"
New-Item -ItemType Directory -Force -Path $workspace | Out-Null
$rawBase = "$repoUrl/raw/main"
Invoke-WebRequest "$rawBase/docker-compose.yml" -OutFile (Join-Path $workspace "docker-compose.yml")
$apiKey = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
 $environmentContent = @"
DATABASE_URL=postgresql://traceforge:traceforge@localhost:5432/traceforge?schema=public
REDIS_URL=redis://localhost:6379
TRACEFORGE_API_KEY=$apiKey
TRACEFORGE_PUBLIC_READONLY=false
APP_BIND_ADDRESS=127.0.0.1
APP_PORT=3000
TRACEFORGE_IMAGE=$DockerHubImage
"@
[System.IO.File]::WriteAllText((Join-Path $workspace ".env"), $environmentContent, $utf8NoBom)
Push-Location $workspace
try {
  docker compose --env-file .env pull
  if ($LASTEXITCODE -ne 0) { throw "Could not pull the TraceForge image." }
  docker compose --env-file .env up -d
  if ($LASTEXITCODE -ne 0) { throw "TraceForge failed to start." }
} finally {
  Pop-Location
}
Write-Host "TraceForge is available at http://localhost:3000"
Write-Host "Workspace API key (also saved in $workspace\.env): $apiKey"
