---
name: cert-manager
description: >-
  cert-manager for automatic TLS certificate management in Kubernetes. Use when
  the user needs to issue, renew, and manage TLS certificates from Let's Encrypt
  or other CAs, configure ClusterIssuers, and secure Ingress resources.
license: Apache-2.0
compatibility:
  - linux
  - macos
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
    - cert-manager
    - tls
    - kubernetes
    - letsencrypt
    - certificates
---

# cert-manager

cert-manager automates the management and issuance of TLS certificates in Kubernetes.

## Installation

```bash
# Install cert-manager with Helm
helm repo add jetstack https://charts.jetstack.io
helm repo update

helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager \
  --create-namespace \
  --set crds.enabled=true \
  --set prometheus.enabled=true

# Verify
kubectl get pods -n cert-manager
cmctl check api
```

## ClusterIssuers

```yaml
# issuers/letsencrypt-staging.yaml — Let's Encrypt staging issuer for testing
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-staging
spec:
  acme:
    server: https://acme-staging-v02.api.letsencrypt.org/directory
    email: admin@example.com
    privateKeySecretRef:
      name: letsencrypt-staging-key
    solvers:
      - http01:
          ingress:
            class: nginx
```

```yaml
# issuers/letsencrypt-prod.yaml — Let's Encrypt production issuer
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@example.com
    privateKeySecretRef:
      name: letsencrypt-prod-key
    solvers:
      - http01:
          ingress:
            class: nginx
      - dns01:
          cloudDNS:
            project: my-gcp-project
          selector:
            dnsZones:
              - "example.com"
```

```yaml
# issuers/dns01-route53.yaml — DNS-01 solver with AWS Route 53
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-dns
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@example.com
    privateKeySecretRef:
      name: letsencrypt-dns-key
    solvers:
      - dns01:
          route53:
            region: us-east-1
            hostedZoneID: Z1234567890
```

## Certificate Resources

```yaml
# certs/wildcard-cert.yaml — Wildcard certificate for domain
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: wildcard-example-com
  namespace: default
spec:
  secretName: wildcard-example-com-tls
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
  commonName: "*.example.com"
  dnsNames:
    - "example.com"
    - "*.example.com"
  duration: 2160h    # 90 days
  renewBefore: 360h  # 15 days before expiry
  privateKey:
    algorithm: ECDSA
    size: 256
```

```yaml
# certs/internal-ca.yaml — Self-signed CA for internal services
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: selfsigned-issuer
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
  commonName: internal-ca
  secretName: internal-ca-secret
  issuerRef:
    name: selfsigned-issuer
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

## Ingress Integration

```yaml
# ingress/web-ingress.yaml — Ingress with automatic TLS via annotation
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
        - app.example.com
        - api.example.com
      secretName: app-example-com-tls
  rules:
    - host: app.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web-app
                port:
                  number: 80
    - host: api.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: api-service
                port:
                  number: 8080
```

## Istio Gateway Integration

```yaml
# certs/istio-cert.yaml — Certificate for Istio Gateway
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: gateway-cert
  namespace: istio-system
spec:
  secretName: gateway-tls
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
  dnsNames:
    - "app.example.com"
    - "api.example.com"
```

## Common Commands

```bash
# Check certificate status
kubectl get certificates -A
kubectl describe certificate wildcard-example-com

# View certificate details
cmctl status certificate wildcard-example-com

# Manually trigger renewal
cmctl renew wildcard-example-com

# Check challenges and orders
kubectl get challenges -A
kubectl get orders -A

# Inspect certificate secret
kubectl get secret wildcard-example-com-tls -o jsonpath='{.data.tls\.crt}' | base64 -d | openssl x509 -text -noout

# Troubleshoot
kubectl logs -n cert-manager deploy/cert-manager -f
cmctl check api
```
