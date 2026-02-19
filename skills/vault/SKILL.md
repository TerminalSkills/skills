---
name: vault
description: >-
  HashiCorp Vault for secrets management and data protection. Use when the user
  needs to store and access secrets, manage encryption keys, configure dynamic
  credentials, handle PKI certificates, or integrate secrets into applications.
license: Apache-2.0
compatibility:
  - linux
  - macos
  - windows
metadata:
  author: terminal-skills
  version: 1.0.0
  category: security
  tags:
    - vault
    - secrets
    - hashicorp
    - security
    - encryption
---

# HashiCorp Vault

Vault secures, stores, and controls access to tokens, passwords, certificates, and encryption keys.

## Installation and Setup

```bash
# Install Vault
wget -O- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt update && sudo apt install vault

# Start dev server (development only)
vault server -dev

# Connect to Vault
export VAULT_ADDR='https://vault.example.com:8200'
export VAULT_TOKEN='hvs.xxxxx'
vault status
```

## Server Configuration

```hcl
# vault-config.hcl — Production Vault server configuration
storage "raft" {
  path    = "/opt/vault/data"
  node_id = "vault-1"
}

listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_cert_file = "/opt/vault/tls/tls.crt"
  tls_key_file  = "/opt/vault/tls/tls.key"
}

api_addr     = "https://vault.example.com:8200"
cluster_addr = "https://vault.example.com:8201"

ui = true

seal "awskms" {
  region     = "us-east-1"
  kms_key_id = "alias/vault-unseal"
}

telemetry {
  prometheus_retention_time = "30s"
  disable_hostname          = true
}
```

## KV Secrets Engine

```bash
# Enable KV v2 secrets engine
vault secrets enable -path=secret kv-v2

# Write and read secrets
vault kv put secret/myapp/config \
  db_host="db.example.com" \
  db_user="admin" \
  db_pass="s3cret"

vault kv get secret/myapp/config
vault kv get -field=db_pass secret/myapp/config

# Version management
vault kv get -version=1 secret/myapp/config
vault kv metadata get secret/myapp/config
vault kv delete secret/myapp/config
vault kv undelete -versions=1 secret/myapp/config
```

## Dynamic Secrets

```bash
# Enable AWS secrets engine for dynamic credentials
vault secrets enable aws

vault write aws/config/root \
  access_key=AKIA... \
  secret_key=... \
  region=us-east-1

vault write aws/roles/deploy-role \
  credential_type=iam_user \
  policy_arns=arn:aws:iam::aws:policy/AmazonS3FullAccess

# Generate dynamic AWS credentials
vault read aws/creds/deploy-role

# Database dynamic credentials
vault secrets enable database

vault write database/config/mydb \
  plugin_name=postgresql-database-plugin \
  connection_url="postgresql://{{username}}:{{password}}@db.example.com:5432/mydb" \
  allowed_roles="readonly" \
  username="vault_admin" \
  password="admin_pass"

vault write database/roles/readonly \
  db_name=mydb \
  creation_statements="CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}'; GRANT SELECT ON ALL TABLES IN SCHEMA public TO \"{{name}}\";" \
  default_ttl="1h" max_ttl="24h"

vault read database/creds/readonly
```

## Authentication Methods

```bash
# AppRole auth (for machines/apps)
vault auth enable approle
vault write auth/approle/role/myapp \
  token_policies="myapp-policy" \
  token_ttl=1h token_max_ttl=4h \
  secret_id_ttl=10m

ROLE_ID=$(vault read -field=role_id auth/approle/role/myapp/role-id)
SECRET_ID=$(vault write -f -field=secret_id auth/approle/role/myapp/secret-id)
vault write auth/approle/login role_id=$ROLE_ID secret_id=$SECRET_ID

# Kubernetes auth
vault auth enable kubernetes
vault write auth/kubernetes/config \
  kubernetes_host="https://kubernetes.default.svc"

vault write auth/kubernetes/role/myapp \
  bound_service_account_names=myapp \
  bound_service_account_namespaces=default \
  policies=myapp-policy \
  ttl=1h
```

## Policies

```hcl
# policies/myapp-policy.hcl — Application access policy
path "secret/data/myapp/*" {
  capabilities = ["read", "list"]
}

path "database/creds/readonly" {
  capabilities = ["read"]
}

path "aws/creds/deploy-role" {
  capabilities = ["read"]
}

path "pki/issue/myapp" {
  capabilities = ["create", "update"]
}
```

```bash
# Apply policy
vault policy write myapp-policy policies/myapp-policy.hcl
vault policy list
vault policy read myapp-policy
```

## PKI Certificates

```bash
# Enable PKI secrets engine
vault secrets enable pki
vault secrets tune -max-lease-ttl=87600h pki

# Generate root CA
vault write pki/root/generate/internal \
  common_name="Example Root CA" ttl=87600h

# Configure roles and issue certs
vault write pki/roles/myapp \
  allowed_domains="example.com" \
  allow_subdomains=true max_ttl=720h

vault write pki/issue/myapp \
  common_name="app.example.com" ttl=24h
```

## Common Commands

```bash
# Operator commands
vault operator init -key-shares=5 -key-threshold=3
vault operator unseal
vault operator seal
vault operator raft list-peers

# Token management
vault token create -policy=myapp-policy -ttl=8h
vault token lookup
vault token revoke hvs.xxxxx

# Audit logging
vault audit enable file file_path=/var/log/vault/audit.log

# Lease management
vault lease revoke -prefix database/creds/readonly
```
