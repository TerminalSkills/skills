---
name: step-ca
description: >-
  Runs a private certificate authority with step-ca from Smallstep, issuing short-lived TLS certificates for internal services. Use when a user asks to issue internal TLS certificates, set up mTLS between services, create a private PKI or internal CA, renew certificates automatically, or point ACME clients at a private CA.
license: Apache-2.0
compatibility: 'step-ca 0.30.x and step CLI 0.31.x on Linux, macOS, Windows or Docker'
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  tags:
    - step-ca
    - pki
    - certificates
    - mtls
    - internal-tls
  repository: https://github.com/smallstep/certificates
---

# step-ca (Smallstep)

## Overview

step-ca is an open-source private certificate authority. It issues X.509 certificates (and optionally SSH certificates) to your internal services, through the `step` CLI or any ACME client, and supports renewal and revocation. Think Let's Encrypt for infrastructure that is not on the public internet.

Two binaries are involved: `step-ca` (the server) and `step` (the client and setup tool). Checked against step-ca 0.30.2 and step 0.31.0.

## Instructions

### Step 1: Install

```bash
brew install step                                  # macOS: installs step and step-ca
winget install Smallstep.step-ca                   # Windows
sudo apt-get install -y step-cli step-ca           # Debian/Ubuntu, after adding the Smallstep apt source
```

The Smallstep apt/dnf source setup is on https://smallstep.com/docs/step-ca/installation/. For a plain binary, download the tarballs from the GitHub releases of `smallstep/certificates` and `smallstep/cli`, and compare `sha256sum` with the `checksums.txt` of that release before extracting. Docker image: `smallstep/step-ca`.

### Step 2: Initialize the CA

```bash
step ca init --name "Internal CA" \
  --dns ca.corp.internal --address :443 \
  --provisioner ops@corp.internal
```

Prompts for a password (or leave it empty to have one generated). It writes the root and intermediate certificates under `$(step path)/certs`, the encrypted keys under `secrets/`, and `config/ca.json`. Note the printed root fingerprint. Useful flags: `--acme` (add an ACME provisioner), `--ssh` (SSH certificates too), `--password-file` and `--provisioner-password-file` (non-interactive), `--remote-management`.

### Step 3: Run the CA and issue certificates

```bash
step-ca $(step path)/config/ca.json                # start; use --password-file to avoid the prompt
step ca bootstrap --ca-url https://ca.corp.internal --fingerprint e58f8792ef35d31051d10b9c39ba3f715a6a20583f181a66178b00d784450306   # on each client machine; use the fingerprint printed by init
step ca certificate api.corp.internal api.crt api.key
step ca certificate --not-after 24h orders-client client.crt client.key
step certificate install $(step path)/certs/root_ca.crt   # optional: trust the root system-wide
```

`step ca certificate` takes the subject name (it becomes the CN and a SAN), then the certificate file, then the key file. The default certificate lifetime is 24 hours.

### Step 4: Renew automatically

```bash
step ca renew --daemon api.crt api.key                              # renews at about two-thirds of the lifetime
step ca renew --daemon --exec "systemctl reload nginx" api.crt api.key
step ca renew --force --expires-in 8h api.crt api.key               # one-shot, for cron or a systemd timer
```

Smallstep recommends a systemd timer with a `cert-renewer@.service` template for production. Renewal needs the current, unexpired certificate; once it expires you must issue a new one.

### Step 5: mTLS between services

```typescript
// server.ts: Node.js server that requires a client certificate signed by our CA
import https from 'node:https'
import fs from 'node:fs'

https.createServer({
  cert: fs.readFileSync('api.crt'),
  key: fs.readFileSync('api.key'),
  ca: fs.readFileSync('root_ca.crt'),      // copy from $(step path)/certs/root_ca.crt
  requestCert: true,
  rejectUnauthorized: true,
}, (req, res) => {
  const peer = req.socket.getPeerCertificate()
  res.end(`Hello ${peer.subject.CN}\n`)
}).listen(9443)
```

The client presents its own certificate:

```bash
curl --cacert root_ca.crt --cert client.crt --key client.key https://api.corp.internal:9443/
```

Without `--cert` and `--key` the TLS handshake is refused.

## Examples

### Example 1: Internal CA for a small team

**User prompt:** "Set up a private CA so our services can talk over TLS, certs valid for a day and renewed automatically."

Run `step ca init --name "Internal CA" --dns ca.corp.internal --address :443 --provisioner ops@corp.internal`, start `step-ca` as a systemd service with a password file, then on each service host run `step ca bootstrap`, `step ca certificate billing.corp.internal billing.crt billing.key` and `step ca renew --daemon --exec "systemctl reload billing" billing.crt billing.key`. Result: every host holds a 24-hour certificate that rolls over before it expires.

### Example 2: mTLS between two services

**User prompt:** "Only the orders service should be able to call the payments API."

Issue `payments.corp.internal` to the API and `orders-client` to the orders service, run the Node.js server from Step 5 and call it with curl or an HTTPS agent that loads `client.crt` and `client.key`. Result: the call prints `Hello orders-client`; a request without a client certificate fails during the handshake (curl exit code 56).

## Guidelines

- Use step-ca for internal names; keep Let's Encrypt for public-facing sites.
- Short lifetimes with automatic renewal are safer than long-lived certificates; passive revocation (let them expire) is the simplest model.
- Protect `secrets/root_ca_key`: for production keep the root key offline and run the CA from the intermediate only.
- Use `--password-file` with a file only the CA user can read; never put CA or provisioner passwords on the command line.
- Bind the CA to an address only your network can reach, and pin the root fingerprint when bootstrapping clients; do not skip the fingerprint check.
- ACME: `step ca init --acme` or add an ACME provisioner, then point Certbot, Caddy or Traefik at `https://ca.corp.internal/acme/acme/directory` (for an ACME provisioner named `acme`) with the root certificate trusted.
- For Kubernetes use cert-manager with the step issuer (see Smallstep's tutorials).
- `step ca bootstrap` and some commands may try to open a terminal; in scripts and CI pass flags (`--force`, password files) instead of relying on prompts.
