---
title: Deploy a Production Kubernetes Cluster with GitOps
slug: deploy-production-kubernetes-cluster
description: >-
  Set up a production-ready Kubernetes cluster with Helm for package management,
  cert-manager for automatic TLS, ExternalDNS for DNS automation, and ArgoCD
  for GitOps continuous delivery.
skills:
  - argocd
  - cert-manager
  - external-dns
  - kubernetes-helm
category: devops
tags:
  - kubernetes
  - gitops
  - production
  - tls
  - dns
---

# Deploy a Production Kubernetes Cluster with GitOps

You have a Kubernetes cluster (EKS, GKE, or bare metal) and need to turn it into a production-ready platform. This walkthrough installs the essential infrastructure components: Helm for package management, cert-manager for automatic TLS certificates, ExternalDNS for DNS record automation, and ArgoCD to manage everything through GitOps.

It assumes an ingress controller is already running and uses the class name `nginx` as the example. The Kubernetes ingress-nginx project stopped receiving releases in March 2026, so on a new cluster install a maintained controller and put its class name wherever `nginx` appears below.

## Step 1: Install Helm and Add Chart Repositories

Helm installs the other components. Download a pinned release and check it against the published checksum rather than piping an install script into a shell (or use `brew install helm` on macOS).

```bash
# install-helm.sh — Install a pinned Helm release after verifying its checksum
HELM_VERSION=v4.3.1
curl -fsSLO "https://get.helm.sh/helm-${HELM_VERSION}-linux-amd64.tar.gz"
curl -fsSLO "https://get.helm.sh/helm-${HELM_VERSION}-linux-amd64.tar.gz.sha256sum"
sha256sum -c "helm-${HELM_VERSION}-linux-amd64.tar.gz.sha256sum"
tar xzf "helm-${HELM_VERSION}-linux-amd64.tar.gz"
sudo install linux-amd64/helm /usr/local/bin/helm

helm repo add jetstack https://charts.jetstack.io
helm repo add external-dns https://kubernetes-sigs.github.io/external-dns/
helm repo add argo https://argoproj.github.io/argo-helm
helm repo update
```

## Step 2: Install cert-manager for Automatic TLS

cert-manager watches for Certificate resources and Ingress annotations, then provisions and renews TLS certificates from Let's Encrypt.

```bash
# install-cert-manager.sh — Deploy cert-manager with its CRDs
helm install cert-manager jetstack/cert-manager \
  --version v1.21.3 \
  --namespace cert-manager \
  --create-namespace \
  --set crds.enabled=true \
  --wait
```

Create a ClusterIssuer that cert-manager uses to request certificates. Test with Let's Encrypt's staging server first (`https://acme-staging-v02.api.letsencrypt.org/directory`): production has rate limits and failed validations count against them.

```yaml
# cluster-issuer.yaml — Let's Encrypt production issuer with HTTP-01 solver
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: platform-team@example.com
    privateKeySecretRef:
      name: letsencrypt-prod-key
    solvers:
      - http01:
          ingress:
            ingressClassName: nginx
```

```bash
# apply-issuer.sh — Apply the ClusterIssuer and wait until it registers with Let's Encrypt
kubectl apply -f cluster-issuer.yaml
kubectl wait --for=condition=Ready clusterissuer/letsencrypt-prod --timeout=120s
```

## Step 3: Install ExternalDNS for Automatic DNS

ExternalDNS reads hostnames from Ingress and Service resources and creates the matching DNS records in your provider. This example uses AWS Route 53. The chart has first-class keys for sources, domain filters, policy and registry; repeating them in `extraArgs` duplicates the arguments.

```yaml
# external-dns-values.yaml — Helm values for ExternalDNS with Route 53
provider:
  name: aws

sources:
  - service
  - ingress
domainFilters:
  - example.com
policy: upsert-only      # creates and updates, never deletes
registry: txt
txtOwnerId: production-cluster   # unique per cluster

serviceAccount:
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::123456789012:role/external-dns
```

The IAM role needs `route53:ChangeResourceRecordSets`, `route53:ListResourceRecordSets` and `route53:ListTagsForResources` on your hosted zone, plus `route53:ListHostedZones` on `*`. Start with `upsert-only`; once the records it creates look right, switch to `sync` if you want ExternalDNS to delete records when their Ingress goes away.

```bash
# install-external-dns.sh — Deploy ExternalDNS
helm install external-dns external-dns/external-dns \
  --version 1.23.0 \
  --namespace external-dns \
  --create-namespace \
  --values external-dns-values.yaml \
  --wait
```

Now when you create an Ingress with a hostname, ExternalDNS creates the DNS record, and cert-manager (through the `cert-manager.io/cluster-issuer` annotation) provisions the TLS certificate.

## Step 4: Install ArgoCD for GitOps

ArgoCD continuously syncs your cluster state from a Git repository, ensuring your live environment matches your declared configuration. The chart derives the Ingress host from `global.domain`; TLS terminates at the Ingress, so the Argo CD server runs in insecure (plain HTTP) mode behind it.

```yaml
# argocd-values.yaml — Argo CD behind an Ingress with a cert-manager certificate
global:
  domain: argocd.example.com
configs:
  params:
    server.insecure: true
server:
  ingress:
    enabled: true
    ingressClassName: nginx
    tls: true                # certificate Secret: argocd-server-tls
    annotations:
      cert-manager.io/cluster-issuer: letsencrypt-prod
```

```bash
# install-argocd.sh — Deploy ArgoCD via Helm
helm install argocd argo/argo-cd \
  --version 10.14.0 \
  --namespace argocd \
  --create-namespace \
  --values argocd-values.yaml \
  --wait
```

Retrieve the initial admin password and log in (delete the `argocd-initial-admin-secret` once you have set your own password):

```bash
# argocd-login.sh — Get initial password and authenticate
argocd admin initial-password -n argocd
argocd login argocd.example.com --grpc-web
```

## Step 5: Bootstrap the App of Apps

Create a root ArgoCD Application that manages all other applications from your GitOps repository. This is the "app of apps" pattern: every Application manifest you commit under `apps/` is picked up automatically. To have ArgoCD manage the infrastructure components from Steps 2 to 4 as well, add an Application for each one (with the same chart versions and values) to that directory.

```yaml
# root-app.yaml — Root application managing all cluster apps from Git
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: cluster-apps
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/myorg/gitops-cluster-config.git
    targetRevision: main
    path: apps
  destination:
    server: https://kubernetes.default.svc
    namespace: argocd
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

```bash
# bootstrap.sh — Apply the root application
kubectl apply -f root-app.yaml
argocd app get cluster-apps
```

## Step 6: Deploy Your First Application

Commit this Application manifest to `apps/` in the GitOps repository; the root app creates it:

```yaml
# apps/web-app.yaml — ArgoCD-managed application with automatic TLS and DNS
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: web-app
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/myorg/web-app.git
    targetRevision: main
    path: k8s/production
  destination:
    server: https://kubernetes.default.svc
    namespace: web-app
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

The application repository's `k8s/production` directory contains the Ingress that triggers the automation chain:

```yaml
# k8s/production/ingress.yaml — hostname for ExternalDNS, issuer annotation for cert-manager
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web-app
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  ingressClassName: nginx
  tls:
    - hosts: [app.example.com]
      secretName: web-app-tls
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
```

ExternalDNS creates the DNS record for `app.example.com`, cert-manager provisions the certificate, and ArgoCD keeps the deployment in sync with Git. Push a change to the repository and ArgoCD deploys it.

## Verification

```bash
# verify.sh — Confirm all components are working
kubectl get pods -n cert-manager
kubectl get pods -n external-dns
kubectl get pods -n argocd
kubectl get certificates -A
argocd app list
dig +short app.example.com
```

## Related Skills

- `argocd` — installs Argo CD and defines the app-of-apps Applications
- `cert-manager` — the ClusterIssuer and Ingress-annotation certificates
- `external-dns` — Route 53 values and the annotation behaviour behind Step 3
- `kubernetes-helm` — chart installs, version pinning and values files
