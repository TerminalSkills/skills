---
name: argocd
description: >-
  Argo CD for GitOps continuous delivery on Kubernetes. Use when the user needs
  to define applications declaratively, sync Kubernetes manifests from Git
  repositories, manage sync policies, and implement progressive delivery
  workflows.
license: Apache-2.0
compatibility:
  - linux
  - macos
  - windows
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
    - argocd
    - gitops
    - kubernetes
    - continuous-delivery
    - devops
---

# Argo CD

Argo CD is a declarative GitOps continuous delivery tool for Kubernetes that syncs application state from Git repositories.

## Installation

```bash
# Install Argo CD on Kubernetes
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Install CLI
curl -sSL -o argocd https://github.com/argoproj/argo-cd/releases/latest/download/argocd-linux-amd64
chmod +x argocd && sudo mv argocd /usr/local/bin/

# Get initial admin password
argocd admin initial-password -n argocd

# Login
argocd login argocd.example.com --grpc-web
```

## Application Definitions

```yaml
# apps/web-app.yaml — Basic ArgoCD Application manifest
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: web-app
  namespace: argocd
  finalizers:
    - resources-finalizer.argocd.argoproj.io
spec:
  project: default
  source:
    repoURL: https://github.com/myorg/web-app.git
    targetRevision: main
    path: k8s/overlays/production
  destination:
    server: https://kubernetes.default.svc
    namespace: web-app
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
      allowEmpty: false
    syncOptions:
      - CreateNamespace=true
      - PrunePropagationPolicy=foreground
      - PruneLast=true
    retry:
      limit: 5
      backoff:
        duration: 5s
        factor: 2
        maxDuration: 3m
```

```yaml
# apps/helm-app.yaml — Application using Helm chart source
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: monitoring
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://prometheus-community.github.io/helm-charts
    chart: kube-prometheus-stack
    targetRevision: 55.0.0
    helm:
      releaseName: monitoring
      valuesObject:
        grafana:
          enabled: true
          ingress:
            enabled: true
            hosts:
              - grafana.example.com
        prometheus:
          prometheusSpec:
            retention: 30d
            storageSpec:
              volumeClaimTemplate:
                spec:
                  accessModes: ["ReadWriteOnce"]
                  resources:
                    requests:
                      storage: 50Gi
  destination:
    server: https://kubernetes.default.svc
    namespace: monitoring
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
      - ServerSideApply=true
```

## App of Apps Pattern

```yaml
# apps/root-app.yaml — Root application that manages other apps
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: root-app
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/myorg/gitops-config.git
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

## ApplicationSet

```yaml
# appsets/multi-cluster.yaml — Deploy to multiple clusters automatically
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: web-app-set
  namespace: argocd
spec:
  generators:
    - clusters:
        selector:
          matchLabels:
            environment: production
  template:
    metadata:
      name: "web-app-{{name}}"
    spec:
      project: default
      source:
        repoURL: https://github.com/myorg/web-app.git
        targetRevision: main
        path: k8s/overlays/production
      destination:
        server: "{{server}}"
        namespace: web-app
      syncPolicy:
        automated:
          prune: true
          selfHeal: true
```

## Projects

```yaml
# projects/team-a.yaml — ArgoCD project with RBAC restrictions
apiVersion: argoproj.io/v1alpha1
kind: AppProject
metadata:
  name: team-a
  namespace: argocd
spec:
  description: "Team A applications"
  sourceRepos:
    - "https://github.com/myorg/team-a-*"
  destinations:
    - namespace: "team-a-*"
      server: https://kubernetes.default.svc
  clusterResourceWhitelist:
    - group: ""
      kind: Namespace
  namespaceResourceBlacklist:
    - group: ""
      kind: ResourceQuota
    - group: ""
      kind: LimitRange
  roles:
    - name: developer
      policies:
        - p, proj:team-a:developer, applications, get, team-a/*, allow
        - p, proj:team-a:developer, applications, sync, team-a/*, allow
      groups:
        - team-a-devs
```

## Sync Waves and Hooks

```yaml
# k8s/namespace.yaml — Resource with sync wave annotation
apiVersion: v1
kind: Namespace
metadata:
  name: web-app
  annotations:
    argocd.argoproj.io/sync-wave: "-1"
---
# k8s/migration-job.yaml — Pre-sync hook for database migration
apiVersion: batch/v1
kind: Job
metadata:
  name: db-migrate
  annotations:
    argocd.argoproj.io/hook: PreSync
    argocd.argoproj.io/hook-delete-policy: HookSucceeded
spec:
  template:
    spec:
      containers:
        - name: migrate
          image: myregistry.com/web-app:latest
          command: ["python", "manage.py", "migrate"]
      restartPolicy: Never
```

## Common Commands

```bash
# Application management
argocd app create web-app -f apps/web-app.yaml
argocd app list
argocd app get web-app
argocd app sync web-app
argocd app sync web-app --force --prune
argocd app delete web-app --cascade

# Diff and history
argocd app diff web-app
argocd app history web-app
argocd app rollback web-app <history-id>

# Repository management
argocd repo add https://github.com/myorg/config.git --username git --password $TOKEN
argocd repo list

# Cluster management
argocd cluster add my-cluster-context
argocd cluster list

# Account management
argocd account update-password
argocd account list
```
