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

## Step 1: Install Helm and Add Chart Repositories

Helm is the foundation for installing the other components. Start by adding the repositories you'll need.

```bash
# install-helm.sh — Install Helm and add required chart repos
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

helm repo add jetstack https://charts.jetstack.io
helm repo add external-dns https://kubernetes-sigs.github.io/external-dns/
helm repo add argo https://argoproj.github.io/argo-helm
helm repo update
```

## Step 2: Install cert-manager for Automatic TLS

cert-manager watches for Certificate resources and Ingress annotations, then automatically provisions and renews TLS certificates from Let's Encrypt.

```bash
# install-cert-manager.sh — Deploy cert-manager with CRDs
helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager \
  --create-namespace \
  --set crds.enabled=true \
  --set prometheus.enabled=true \
  --wait
```

After installation, create a ClusterIssuer that cert-manager uses to request certificates:

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
            class: nginx
```

```bash
# apply-issuer.sh — Apply the ClusterIssuer
kubectl apply -f cluster-issuer.yaml
kubectl get clusterissuer letsencrypt-prod
```

## Step 3: Install ExternalDNS for Automatic DNS

ExternalDNS reads hostnames from Ingress and Service resources, then creates the corresponding DNS records in your provider. This example uses AWS Route 53.

```yaml
# external-dns-values.yaml — Helm values for ExternalDNS with Route 53
provider:
  name: aws

extraArgs:
  - --source=service
  - --source=ingress
  - --domain-filter=example.com
  - --policy=sync
  - --registry=txt
  - --txt-owner-id=production-cluster

serviceAccount:
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::123456789012:role/external-dns
```

```bash
# install-external-dns.sh — Deploy ExternalDNS
helm install external-dns external-dns/external-dns \
  --namespace external-dns \
  --create-namespace \
  --values external-dns-values.yaml \
  --wait
```

Now when you create an Ingress with a hostname, ExternalDNS automatically creates the DNS A record, and cert-manager automatically provisions the TLS certificate.

## Step 4: Install ArgoCD for GitOps

ArgoCD continuously syncs your cluster state from a Git repository, ensuring your live environment matches your declared configuration.

```bash
# install-argocd.sh — Deploy ArgoCD via Helm
helm install argocd argo/argo-cd \
  --namespace argocd \
  --create-namespace \
  --set server.ingress.enabled=true \
  --set server.ingress.hosts[0]=argocd.example.com \
  --set "server.ingress.annotations.cert-manager\\.io/cluster-issuer=letsencrypt-prod" \
  --set server.ingress.tls[0].secretName=argocd-tls \
  --set server.ingress.tls[0].hosts[0]=argocd.example.com \
  --wait
```

Retrieve the initial admin password and log in:

```bash
# argocd-login.sh — Get initial password and authenticate
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
argocd login argocd.example.com --grpc-web
```

## Step 5: Bootstrap the App of Apps

Create a root ArgoCD Application that manages all other applications from your GitOps repository. This is the "app of apps" pattern — ArgoCD manages itself and all infrastructure components.

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

With the platform ready, deploy an application that automatically gets DNS records and TLS certificates:

```yaml
# web-app.yaml — ArgoCD-managed application with automatic TLS and DNS
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

The application's Ingress triggers the full automation chain: ExternalDNS creates the DNS record, cert-manager provisions the TLS certificate, and ArgoCD keeps the deployment in sync with Git. Push a change to the repository and ArgoCD deploys it automatically.

## Verification

```bash
# verify.sh — Confirm all components are working
kubectl get pods -n cert-manager
kubectl get pods -n external-dns
kubectl get pods -n argocd
kubectl get certificates -A
argocd app list
dig app.example.com
```
