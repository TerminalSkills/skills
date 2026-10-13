---
name: doppler
description: >-
  Manage secrets and environment variables using the Doppler CLI. Use when the
  user wants to set up Doppler, inject secrets into processes, manage projects
  and configs, upload or download secrets, create service tokens, use secret
  templates, or integrate Doppler with Docker, Kubernetes, or CI/CD pipelines.
  Trigger words: doppler, secrets manager, env vars, secret injection, doppler run,
  doppler setup, service token, secret rotation.
license: Apache-2.0
compatibility: "Requires Doppler CLI installed (brew, apt, scoop, or winget)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/DopplerHQ/cli
  category: devops
  tags: ["doppler", "secrets", "environment-variables", "devops", "security"]
---

# Doppler

## Overview

Manage application secrets and environment variables through the Doppler CLI. Covers authentication, project/config setup, secret injection into processes, secret CRUD operations, bulk import/export, service tokens for CI/CD, template-based secret substitution, and integrations with Docker and Kubernetes.

## Instructions

### 1. Install and authenticate

```bash
# macOS
brew install dopplerhq/cli/doppler
# Windows
winget install doppler.doppler
# or: scoop bucket add doppler https://github.com/DopplerHQ/scoop-doppler.git && scoop install doppler
# Debian 11+/Ubuntu 22.04+: add Doppler's signed apt repository (keyring + signed-by),
# then `sudo apt-get install doppler` — steps at https://docs.doppler.com/docs/install-cli
```

Check the install with `doppler --version`. Update later with `doppler update`.

Authenticate and verify:

```bash
doppler login
doppler me
```

### 2. Set up a project directory

Link the current directory to a Doppler project and config (creates `doppler.yaml`):

```bash
doppler setup
doppler setup --project my-api --config dev --no-interactive
```

### 3. Inject secrets into processes

Run any command with secrets injected as environment variables:

```bash
doppler run -- npm start
doppler run -- python manage.py runserver
doppler run -- docker compose up
```

Override the project/config per command:

```bash
doppler run -p payments-api -c stg -- ./run-tests.sh
```

Run multiple chained commands:

```bash
doppler run --command="./configure && ./process-jobs; ./cleanup"
```

### 4. Read and manage secrets

List all secrets:

```bash
doppler secrets
doppler secrets --only-names
```

Get a single secret value:

```bash
doppler secrets get DATABASE_URL --plain
```

Get multiple secrets as JSON:

```bash
doppler secrets get DATABASE_URL REDIS_URL API_KEY --json
```

### 5. Set and update secrets

```bash
doppler secrets set API_KEY="sk-live-abc123def456"
doppler secrets set DB_HOST="db.prod.internal" DB_PORT="5432"
cat tls-cert.pem | doppler secrets set TLS_CERT              # from file/stdin
doppler secrets set STRIPE_KEY="sk_live_51HG4xK2e" --visibility restricted   # masked | unmasked | restricted
doppler secrets delete DEPRECATED_KEY --yes   # --yes skips the confirmation
```

### 6. Download and upload secrets in bulk

Download in various formats:

```bash
doppler secrets download --no-file --format=json
doppler secrets download --no-file --format=env > .env
doppler secrets download --no-file --format=yaml > config.yaml
```

Supported formats: `json`, `yaml`, `env`, `env-no-quotes`, `docker`, `dotnet-json`.

Upload from a file:

```bash
doppler secrets upload .env
doppler secrets upload secrets.json
```

### 7. Mount secrets as ephemeral files

Mount secrets as a named pipe (most secure file-based method):

```bash
doppler run --mount .env -- npm start
doppler run --mount config.json --mount-format json -- ./app
```

Limit file reads for extra security:

```bash
doppler run --mount .env --mount-max-reads 1 -- php artisan config:cache
```

Other useful `doppler run` flags: `--only-secrets API_KEY,DATABASE_URL` (inject just those), `--preserve-env` (let existing environment values win; use with care), `--watch` (beta: restart on secret change), and `--fallback ./doppler-fallback.json` (encrypted copy used if the API is unreachable).

### 8. Use secret templates

Create a template file (e.g., `config.tmpl`):

```
db_host: {{.DB_HOST}}
db_port: {{.DB_PORT}}
{{with .LOG_FILE}}
log_file: {{.}}
{{end}}
```

Templates use Go `text/template` syntax (`tojson` is available for multiline or JSON values). Substitute and output:

```bash
doppler secrets substitute config.tmpl --output config.yaml
```

Pipe directly to kubectl:

```bash
kubectl apply -f <(doppler secrets substitute k8s-secret.yaml.tmpl)
```

### 9. Create service tokens for CI/CD

```bash
doppler configs tokens create ci-deploy -p payments-api -c prd --max-age 24h --plain
```

The token is read-only by default; add `--access read/write` only if the pipeline must write secrets. Use in CI via env var or inline flag:

```bash
export DOPPLER_TOKEN="$DOPPLER_SERVICE_TOKEN"   # stored in the CI secret store
doppler run -- ./deploy.sh
doppler run --token="$DOPPLER_SERVICE_TOKEN" -- ./deploy.sh
```

### 10. Name transformers

Transform secret names for framework compatibility:

```bash
doppler run --name-transformer camel -- node app.js        # API_KEY → apiKey
doppler run --name-transformer tf-var -- terraform apply    # API_KEY → TF_VAR_api_key
doppler run --name-transformer lower-snake -- python app.py # API_KEY → api_key
```

Available transformers for `doppler run`: `camel`, `upper-camel`, `lower-snake`, `tf-var`, `dotnet-env`, `lower-kebab` (`download` also accepts `dotnet`).

### 11. Docker and Kubernetes integration

Pass secrets to Docker containers:

```bash
docker run --env-file <(doppler secrets download --no-file --format docker) my-app:latest
```

Create a Kubernetes secret:

```bash
kubectl create secret generic app-secrets \
  --from-env-file <(doppler secrets download --no-file --format docker)
```

## Examples

### Example 1: Setting up a new microservice with Doppler

**User request:** "Set up Doppler for our Node.js order-service with dev and production configs"

**Actions:**
```bash
cd ~/projects/order-service
doppler setup --project order-service --config dev --no-interactive

# Set dev secrets
doppler secrets set \
  DATABASE_URL="postgresql://localhost:5432/orders_dev" \
  REDIS_URL="redis://localhost:6379/0" \
  STRIPE_KEY="sk_test_your_stripe_test_key_here" \
  LOG_LEVEL="debug" \
  -p order-service -c dev

# Set production secrets
doppler secrets set \
  DATABASE_URL="postgresql://db.prod.internal:5432/orders" \
  REDIS_URL="redis://redis.prod.internal:6379/0" \
  STRIPE_KEY="sk_live_51HG4..." \
  LOG_LEVEL="warn" \
  -p order-service -c prd

# Run locally with dev secrets
doppler run -- npm run dev

# Generate a production service token for CI/CD
doppler configs tokens create railway-deploy -p order-service -c prd --max-age 720h --plain
```

### Example 2: Migrating secrets from .env files to Doppler

**User request:** "Migrate our auth-service .env secrets to Doppler"

**Actions:**
```bash
doppler login
doppler secrets upload .env -p auth-service -c dev
doppler secrets -p auth-service -c dev               # verify import

# Update start command: replace "source .env && node server.js" with:
doppler run -p auth-service -c dev -- node server.js

# Remove .env from repo
echo ".env" >> .gitignore
```

Team members onboard with:
```bash
doppler login && doppler setup && doppler run -- node server.js
```

## Guidelines

- `doppler secrets download --no-file --format=env > .env` writes plaintext secrets to disk; delete the file afterwards and keep it out of git.
- Always use `doppler run` to inject secrets rather than downloading to plain-text files. The `--mount` flag with named pipes is the most secure file-based option.
- Use `doppler setup` in project directories so subsequent commands inherit the project/config context automatically.
- Create service tokens with `--max-age` for CI/CD pipelines instead of using personal auth tokens.
- Use `--visibility restricted` for highly sensitive secrets like private keys and API credentials.
- When piping secret values into files (e.g., `doppler secrets get KEY --plain > file`), set file permissions immediately: `chmod 600 file`.
- Add `HISTIGNORE='*doppler secrets set*'` to your shell profile to prevent secrets from appearing in shell history.
- Use name transformers (`--name-transformer`) when frameworks expect specific variable naming conventions.
- For Kubernetes, prefer process substitution `<(doppler secrets download ...)` over writing files to disk.
- Use `--no-file --format` flags to pipe secret downloads directly to stdout without writing temporary files.
- Run `doppler update` periodically to keep the CLI current.
