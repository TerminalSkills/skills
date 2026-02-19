---
name: hashicorp-vault
description: >-
  Assists with managing secrets, encryption keys, and dynamic credentials using HashiCorp
  Vault. Use when configuring secret engines, setting up dynamic database credentials,
  implementing access policies, integrating with Kubernetes, or using Transit for encryption
  as a service. Trigger words: vault, secrets management, dynamic secrets, transit engine,
  pki, approle, vault agent.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: ["hashicorp-vault", "secrets", "security", "encryption", "dynamic-credentials"]
---

# HashiCorp Vault

## Overview

HashiCorp Vault is a secrets management platform that provides KV storage with versioning, dynamic short-lived credentials for databases and cloud providers, PKI certificate management, Transit encryption as a service, and fine-grained HCL-based access policies. It integrates with Kubernetes via sidecar injection and CI/CD pipelines via AppRole authentication.

## Instructions

- When storing static secrets, use the KV v2 engine with versioning for API keys and configuration values, organizing secrets by application and environment paths.
- When managing database access, use the Database secret engine to generate dynamic, short-lived credentials that automatically expire, limiting the blast radius of credential leaks.
- When authenticating applications, use AppRole for services and CI/CD (with secret_id rotation), Kubernetes auth for pods, and JWT/OIDC for SSO integration; never hardcode tokens.
- When encrypting data, use the Transit engine for encryption as a service so applications encrypt/decrypt data without managing keys, with support for key rotation and convergent encryption.
- When defining access, write HCL policies with deny-by-default, granting minimum capabilities (create, read, update, delete, list) per path, and use path templating for per-user isolation.
- When deploying in Kubernetes, use Vault Agent sidecar injector or CSI provider to inject secrets into pods as files or environment variables, so applications read secrets without a Vault SDK.

## Examples

### Example 1: Set up dynamic database credentials for a microservice

**User request:** "Configure Vault to issue short-lived PostgreSQL credentials for my API service"

**Actions:**
1. Enable the Database secret engine and configure the PostgreSQL connection
2. Create a role with a SQL statement for read-only access and a 1-hour TTL
3. Set up AppRole authentication for the API service with a policy allowing `database/creds/readonly`
4. Configure Vault Agent sidecar to inject credentials into the pod and auto-renew leases

**Output:** A microservice that receives dynamic database credentials with automatic rotation and a 1-hour expiry.

### Example 2: Add encryption as a service with Transit engine

**User request:** "Encrypt sensitive user data at rest using Vault Transit without managing keys"

**Actions:**
1. Enable the Transit secret engine and create a named encryption key
2. Build an API middleware that encrypts data via `transit/encrypt/key-name` before database writes
3. Add a decryption path that calls `transit/decrypt/key-name` on reads
4. Configure key rotation policy and verify old data remains decryptable

**Output:** Application-level encryption using Vault Transit with automatic key management and rotation.

## Guidelines

- Use dynamic secrets for databases since short-lived credentials limit the blast radius of a breach.
- Use AppRole for services, never hardcoded tokens, since AppRole supports secret_id rotation.
- Use Transit engine instead of application-level encryption since key management is Vault's responsibility.
- Set TTLs as short as practical: 1 hour for database credentials and 15 minutes for CI tokens.
- Enable audit device logging for compliance since it records who accessed what and when.
- Use Vault Agent sidecar in Kubernetes so applications read secrets from files without needing a Vault SDK.
- Store the root token securely and revoke it after initial setup; operators should use personal tokens.
