---
name: hashicorp-vault
description: >-
  Assists with managing secrets, encryption keys, and dynamic credentials using HashiCorp
  Vault. Use when configuring secret engines, setting up dynamic database credentials,
  implementing access policies, integrating with Kubernetes, or using Transit for encryption
  as a service. Trigger words: vault, secrets management, dynamic secrets, transit engine,
  pki, approle, vault agent.
license: Apache-2.0
compatibility: "Vault 2.x CLI (HashiCorp release zip, Homebrew tap or HashiCorp apt repo); a running Vault server"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  repository: https://github.com/hashicorp/vault
  tags: "hashicorp-vault, secrets, security, encryption, dynamic-credentials"
---

# HashiCorp Vault

## Overview

HashiCorp Vault is a secrets management server: versioned key/value storage (KV v2), dynamic short-lived credentials for databases and clouds, PKI certificates, Transit encryption as a service, and HCL access policies, with authentication methods such as AppRole, Kubernetes and OIDC. Every action is checked against the caller's token policies and can be written to an audit device. This skill covers the CLI workflow on Vault 2.x (2.2.1 at the time of writing).

## Instructions

### Install the CLI and reach a server

Use a package manager when you can: `brew tap hashicorp/tap && brew install hashicorp/tap/vault`, or the HashiCorp apt/yum repository. A release zip from the release directory on releases.hashicorp.com must be checked against the `vault_2.2.1_SHA256SUMS` file in the same directory (`grep linux_amd64.zip vault_2.2.1_SHA256SUMS | sha256sum -c -`) before you unzip it.

```bash
export VAULT_ADDR=https://vault.internal.example:8200   # your server
vault login -method=oidc                                  # or: vault login (paste a token)
vault status
```

For local experiments only, `vault server -dev -dev-listen-address=127.0.0.1:8200` starts an in-memory, already unsealed server with a single unseal key and a printed root token (`-dev-root-token-id=` sets it). Dev mode stores nothing on disk and is never for real secrets. A real server needs a config file, storage, `vault operator init` (store the unseal key shares and root token with different people) and `vault operator unseal`.

### KV v2 static secrets

```bash
vault kv put -mount=secret myapp/prod db_url="postgres://svc@db:5432/app" api_key="k-81f3"
vault kv get -mount=secret myapp/prod
vault kv get -mount=secret -field=api_key myapp/prod
vault kv patch -mount=secret myapp/prod api_key="k-92aa"   # changes one key, keeps the rest
vault kv get -mount=secret -version=1 myapp/prod            # earlier version
vault kv metadata get -mount=secret myapp/prod
```

`kv put` replaces the whole secret: keys you leave out are dropped from the new version (older versions stay readable). Use `kv patch` to change one key. In policies the KV v2 API paths include `data/` and `metadata/` (`secret/data/myapp/*`) even though the CLI hides them.

### Policies and AppRole

```bash
cat > api-service.hcl <<'EOF'
path "secret/data/myapp/*"       { capabilities = ["read"] }
path "secret/metadata/myapp/*"   { capabilities = ["list"] }
path "transit/encrypt/orders"    { capabilities = ["update"] }
path "transit/decrypt/orders"    { capabilities = ["update"] }
EOF
vault policy write api-service api-service.hcl

vault auth enable approle
vault write auth/approle/role/api-service token_policies=api-service \
  token_ttl=1h token_max_ttl=4h secret_id_ttl=24h
vault read -field=role_id auth/approle/role/api-service/role-id
vault write -f -field=secret_id auth/approle/role/api-service/secret-id
vault write auth/approle/login role_id="$ROLE_ID" secret_id="$SECRET_ID"
```

Everything not granted is denied. Deliver the `role_id` with the deployment and the `secret_id` through a separate trusted channel (CI secret store, orchestrator); the login returns a token that carries only the role's policies.

### Transit (encryption as a service)

```bash
vault secrets enable transit
vault write -f transit/keys/orders
vault write transit/encrypt/orders plaintext="$(echo -n 'card 4242' | base64)"   # returns vault:v1:...
vault write transit/decrypt/orders ciphertext="vault:v1:K8OU6..."                 # returns base64 plaintext
vault write -f transit/keys/orders/rotate     # new key version; old ciphertext still decrypts
```

Plaintext must be base64 encoded. The key never leaves Vault; applications store only the ciphertext.

### Dynamic database credentials

```bash
vault secrets enable database
vault write database/config/orders-db plugin_name=postgresql-database-plugin \
  allowed_roles=readonly connection_url="postgresql://{{username}}:{{password}}@db.internal:5432/orders" \
  username=vaultadmin password="$VAULT_DB_ADMIN_PASSWORD"
vault write database/roles/readonly db_name=orders-db default_ttl=1h max_ttl=24h \
  creation_statements="CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}'; GRANT SELECT ON ALL TABLES IN SCHEMA public TO \"{{name}}\";"
vault read database/creds/readonly      # username, password and lease_id valid for 1h
```

The connecting `vaultadmin` account needs permission to create roles. Each read creates a new database user; revoke early with `vault lease revoke` with the lease_id from the read.

### Kubernetes

Two supported ways to get secrets into pods: the Vault Agent Injector (a sidecar configured by pod annotations such as `vault.hashicorp.com/agent-inject: "true"`) and the Vault Secrets Operator (syncs Vault secrets into native Kubernetes Secrets through custom resources). Pods authenticate with `vault auth enable kubernetes` and a role bound to a service account and namespace.

### Audit

```bash
vault audit enable file file_path=/var/log/vault/audit.log
```

If every enabled audit device is failing, Vault refuses requests; keep at least two devices on production servers.

## Examples

### Example 1: Short-lived PostgreSQL credentials for an API service
**User request:** "Configure Vault to issue short-lived PostgreSQL credentials for my orders API."

The agent runs the Dynamic database credentials commands above, adds `path "database/creds/readonly" { capabilities = ["read"] }` to the `api-service` policy, and creates the AppRole login. The service logs in, reads `database/creds/readonly`, and gets a user such as `v-approle-readonly-Xk2b` valid for one hour; it renews the lease or requests a new credential before expiry.

### Example 2: Encrypt customer data with Transit
**User request:** "Encrypt card references before they are stored; I do not want keys in the app."

The agent enables Transit, creates the `orders` key, grants the service `update` on `transit/encrypt/orders` and `transit/decrypt/orders`, and calls the encrypt endpoint before each write. The database column holds `vault:v1:...`; after `transit/keys/orders/rotate` new writes use `vault:v2:` and old rows still decrypt (`transit/rewrap/orders` upgrades them; grant `update` on that path too).

## Guidelines

- Do not use the root token for day-to-day work: create it only to bootstrap, create admin policies and personal logins, then revoke it (`vault token revoke -self`).
- Never run `-dev` mode for real data, and never put tokens, secret_ids or unseal keys in code, images or shell history; read them from the environment or a secret store.
- Serve Vault over TLS only; `VAULT_ADDR` with `http://` is acceptable only for loopback experiments.
- Keep TTLs short (1 hour for database credentials, minutes for CI tokens) and set `token_max_ttl` so tokens cannot be renewed forever.
- Write least-privilege policies per application and path; test with `vault token capabilities secret/data/myapp/prod` before shipping.
- Enable at least two audit devices before production traffic.
