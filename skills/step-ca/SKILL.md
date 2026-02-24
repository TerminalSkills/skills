---
name: step-ca
description: >-
  Run a private certificate authority with step-ca. Use when a user asks to
  issue internal TLS certificates, set up mTLS between services, create a
  private PKI, or manage certificates for internal infrastructure.
license: Apache-2.0
compatibility: 'Linux, macOS, Docker'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: security
  tags:
    - step-ca
    - pki
    - certificates
    - mtls
    - internal-tls
---

# step-ca (Smallstep)

## Overview

step-ca is a private certificate authority for issuing TLS certificates to internal services. Automated certificate issuance, renewal, and revocation — like Let's Encrypt but for private infrastructure.

## Instructions

### Step 1: Initialize CA

```bash
brew install step
step ca init --name "Internal CA" --dns localhost --address :443 --provisioner admin
```

### Step 2: Issue Certificates

```bash
step-ca $(step path)/config/ca.json    # start CA server
step ca certificate api.internal api.crt api.key    # issue cert
```

### Step 3: Auto-Renewal

```bash
step ca renew --daemon api.crt api.key    # auto-renews before expiry
```

### Step 4: mTLS Between Services

```typescript
// server.ts — Node.js server with mutual TLS
import https from 'https'
import fs from 'fs'

const server = https.createServer({
  cert: fs.readFileSync('server.crt'),
  key: fs.readFileSync('server.key'),
  ca: fs.readFileSync('root_ca.crt'),
  requestCert: true,          // require client certificate
  rejectUnauthorized: true,
}, (req, res) => {
  const clientCN = req.socket.getPeerCertificate().subject.CN
  res.end('Hello ' + clientCN)
})
```

## Guidelines

- Use step-ca for internal services, Let's Encrypt for public-facing.
- Short-lived certs (24h) with auto-renewal are more secure than long-lived ones.
- ACME protocol support — works with Certbot, Caddy.
- Integrates with Kubernetes cert-manager for automatic pod certificates.
