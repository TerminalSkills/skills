---
name: cert-manager
description: >-
  cert-manager issues and renews TLS certificates automatically inside
  Kubernetes, from Let's Encrypt (ACME) or a private CA. Use when someone asks
  to "get HTTPS on my Kubernetes ingress", "set up Let's Encrypt in a
  cluster", "create a ClusterIssuer", "issue a wildcard certificate", "renew a
  certificate" or "debug a certificate stuck in pending".
license: Apache-2.0
compatibility: "Kubernetes (a release supported by cert-manager 1.21), Helm 3+, kubectl; cmctl optional"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  tags: "cert-manager, tls, kubernetes, letsencrypt, certificates"
  repository: https://github.com/cert-manager/cert-manager
---

# cert-manager

## Overview

cert-manager adds `Issuer`, `ClusterIssuer` and `Certificate` resources to Kubernetes. A `Certificate` asks an issuer for a key pair, stores it in a `Secret`, and renews it before it expires. Issuers can be ACME (Let's Encrypt, ZeroSSL), a private CA stored in a Secret, self-signed, Vault and others. The current release is v1.21.3. Let's Encrypt validation is either HTTP-01 (an `/.well-known/acme-challenge` path served through your ingress) or DNS-01 (a TXT record; required for wildcards).

## Instructions

### 1. Install

The project recommends the OCI chart (the Jetstack HTTP repository is updated a few hours after each release):

```bash
helm install cert-manager oci://quay.io/jetstack/charts/cert-manager \
  --version v1.21.3 \
  --namespace cert-manager \
  --create-namespace \
  --set crds.enabled=true
kubectl get pods -n cert-manager
```

With the legacy repository: `helm repo add jetstack https://charts.jetstack.io --force-update` and `jetstack/cert-manager`. `crds.enabled=true` installs the CRDs with the chart (the old `installCRDs` value is replaced by it). Never install cert-manager as a subchart. Verify the API with `cmctl check api` (`brew install cmctl` or the release binary from GitHub).

### 2. ClusterIssuers for Let's Encrypt

Start with staging (untrusted certificates, generous rate limits), then switch to production:

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-staging
spec:
  acme:
    server: https://acme-staging-v02.api.letsencrypt.org/directory
    email: platform@northwind-shop.io
    privateKeySecretRef:
      name: letsencrypt-staging-account-key
    solvers:
      - http01:
          ingress:
            ingressClassName: nginx
---
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: platform@northwind-shop.io
    privateKeySecretRef:
      name: letsencrypt-prod-account-key
    solvers:
      - http01:
          ingress:
            ingressClassName: nginx
```

Use `ingressClassName`; the older `class` field is the legacy form. The email receives account notices. Optional `profile: tlsserver` (cert-manager 1.18+) asks Let's Encrypt for its 45-day, no-Common-Name certificates; unset means the `classic` 90-day profile. A profile name the server does not know produces an error on the Order, so check the directory (`curl -fsSL https://acme-v02.api.letsencrypt.org/directory`) first.

### 3. DNS-01 (wildcards, private clusters)

Wildcards need DNS-01. Solvers are matched by `selector`, so one issuer can use HTTP-01 for most names and DNS-01 for one zone:

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-dns
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: platform@northwind-shop.io
    privateKeySecretRef:
      name: letsencrypt-dns-account-key
    solvers:
      - selector:
          dnsZones:
            - northwind-shop.io
        dns01:
          route53:
            region: eu-west-1
            hostedZoneID: Z0412345ABCDEFGHIJKLM
```

With Route 53 leave out access keys when cert-manager runs with EKS Pod Identity or IRSA (ambient credentials, used by `ClusterIssuer` only by default); otherwise reference a Secret with `accessKeyIDSecretRef` and `secretAccessKeySecretRef`. Other providers use `cloudDNS`, `cloudflare`, `azureDNS`, or a webhook solver. Give the DNS identity access to that zone only.

### 4. Certificates

```yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: wildcard-northwind-shop
  namespace: default
spec:
  secretName: wildcard-northwind-shop-tls
  issuerRef:
    name: letsencrypt-dns
    kind: ClusterIssuer
  dnsNames:
    - northwind-shop.io
    - "*.northwind-shop.io"
  duration: 2160h      # 90 days requested; Let's Encrypt decides the real lifetime
  renewBefore: 720h    # start renewing 30 days before expiry
  privateKey:
    algorithm: ECDSA
    size: 256
    rotationPolicy: Always   # the default, shown for clarity
```

List names in `dnsNames`; avoid `commonName` on leaf certificates (the docs advise against it). Durations use Go syntax (`h`, `m`, `s`, no days). Let's Encrypt ignores `duration` and issues what its profile defines (90 days for `classic`, 45 for `tlsserver`), and `renewBefore` must be shorter than that lifetime.

### 5. Internal CA

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: selfsigned-bootstrap
spec:
  selfSigned: {}
---
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: internal-ca
  namespace: cert-manager
spec:
  isCA: true
  commonName: northwind-internal-ca
  secretName: internal-ca-secret
  issuerRef:
    name: selfsigned-bootstrap
    kind: ClusterIssuer
  privateKey:
    algorithm: ECDSA
    size: 256
---
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: internal-ca-issuer
spec:
  ca:
    secretName: internal-ca-secret
```

A `ClusterIssuer` reads the CA Secret from cert-manager's own namespace (`cert-manager`), which is why the CA Certificate lives there.

### 6. Ingress and Gateway integration

Annotate an Ingress and cert-manager's ingress-shim creates the Certificate for each `tls` entry:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web-app
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - app.northwind-shop.io
        - api.northwind-shop.io
      secretName: app-northwind-shop-tls
  rules:
    - host: app.northwind-shop.io
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web-app
                port:
                  number: 80
```

For Gateway API, install the Gateway API CRDs first, then enable it in the chart: `--set config.gatewayAPI.enabled=true` (restart the cert-manager Deployment if the CRDs arrived after it). Annotate the `Gateway` with the same `cert-manager.io/cluster-issuer` annotation and give each HTTPS listener `tls.certificateRefs`. For Istio's ingress gateway, create a `Certificate` in `istio-system` and reference its Secret from the Gateway.

### 7. Inspect and debug

```bash
kubectl get certificate -A
cmctl status certificate wildcard-northwind-shop -n default
cmctl renew wildcard-northwind-shop -n default
kubectl get certificaterequest,order,challenge -A
kubectl describe challenge -n default
kubectl logs -n cert-manager deploy/cert-manager --tail=100
kubectl get secret wildcard-northwind-shop-tls -o jsonpath='{.data.tls\.crt}' | base64 -d | openssl x509 -noout -subject -dates -ext subjectAltName
```

## Examples

### Example 1: "Put HTTPS on app.northwind-shop.io"

Install (step 1), apply `letsencrypt-staging`, annotate the Ingress with `cert-manager.io/cluster-issuer: letsencrypt-staging`, and watch `kubectl get certificate -w` until `READY` is `True` (usually under two minutes). Then change the annotation to `letsencrypt-prod` and delete the old Secret so a trusted certificate is requested.

### Example 2: "A certificate has been Pending for 20 minutes"

`cmctl status certificate <name>` shows the stage. Follow the chain with `kubectl get order,challenge -A`; `kubectl describe challenge` states why. Typical causes: DNS for the host does not point at the ingress (HTTP-01), the ingress class name does not match the solver, a `www`-redirect or auth rule blocks `/.well-known/acme-challenge/`, DNS-01 credentials lack permission on the zone, or Let's Encrypt rate limits were hit (switch to staging while testing).

## Guidelines

- Test with the staging issuer first; production has rate limits (for example, a limited number of certificates per registered domain per week) and failed validations count.
- Never delete the account-key Secret of a production issuer casually; you lose the ability to revoke certificates issued under that account.
- Back up internal CA Secrets; losing `internal-ca-secret` means reissuing everything that chains to it.
- Wildcards need DNS-01. HTTP-01 cannot validate `*.` names and needs port 80 reachable from the internet.
- Pods only see a new certificate when they reload it; mount the Secret as a volume (not an env var) and use a reloader or an app that watches the file. Ingress controllers pick it up themselves.
- `rotationPolicy` defaults to `Always` (a new private key on every renewal); set `Never` only if something pins the key.
- Restrict who can create `Certificate` and `Issuer` objects; any user able to reference a `ClusterIssuer` can request certificates for hostnames it can solve.
- cert-manager supports only recent Kubernetes versions; check the supported-releases page before upgrading, and upgrade one minor version at a time.
