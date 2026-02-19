---
name: vault-secrets
description: >-
  Manage application secrets with HashiCorp Vault. Use when a user asks to
  store API keys securely, rotate database credentials, manage certificates,
  inject secrets into applications, or implement dynamic secrets.
license: Apache-2.0
compatibility: 'Any platform'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: security
  tags:
    - vault
    - secrets
    - hashicorp
    - credentials
    - encryption
---

# HashiCorp Vault (Secrets Management)

## Overview

Vault centrally manages secrets (API keys, passwords, certificates), provides dynamic credentials (auto-rotating database passwords), encrypts data, and controls access with policies.

## Instructions

### Step 1: Dev Server

```bash
vault server -dev
export VAULT_ADDR='http://127.0.0.1:8200'
export VAULT_TOKEN='dev-root-token'
```

### Step 2: Store and Retrieve Secrets

```bash
vault kv put secret/myapp db_password=s3cret api_key=sk-xxx
vault kv get secret/myapp
vault kv get -field=db_password secret/myapp
```

### Step 3: Dynamic Database Credentials

```bash
# Configure PostgreSQL dynamic secrets
vault secrets enable database

vault write database/config/mydb \
  plugin_name=postgresql-database-plugin \
  allowed_roles="app-role" \
  connection_url="postgresql://vault:password@db:5432/myapp"

vault write database/roles/app-role \
  db_name=mydb \
  creation_statements="CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}';" \
  default_ttl="1h" \
  max_ttl="24h"

# Get temporary credentials (auto-expires after 1h)
vault read database/creds/app-role
```

### Step 4: Application Integration

```typescript
// lib/vault.ts — Fetch secrets from Vault
import Vault from 'node-vault'

const vault = Vault({ endpoint: process.env.VAULT_ADDR, token: process.env.VAULT_TOKEN })

async function getSecrets() {
  const { data } = await vault.read('secret/data/myapp')
  return data.data    // { db_password, api_key }
}
```

## Guidelines

- Never use dev server in production — stores everything in memory.
- Dynamic secrets (database, AWS) are preferred over static KV — they auto-expire.
- Use AppRole auth for applications, OIDC for humans.
- Vault Agent auto-renews tokens and caches secrets.
