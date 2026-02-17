---
name: kubernetes-helm
description: >-
  Manages Kubernetes clusters and Helm charts. Use when the user wants to
  write Kubernetes manifests, create Helm charts, deploy applications,
  debug pods, configure networking (services, ingress), set up autoscaling,
  manage secrets and config maps, write operators, troubleshoot cluster
  issues, or implement GitOps workflows. Trigger words: kubernetes, k8s,
  kubectl, helm, helm chart, pod, deployment, service, ingress, namespace,
  configmap, secret, hpa, pvc, statefulset, daemonset, cronjob, operator,
  kustomize, argocd, flux, gitops, node pool, taint, toleration, affinity.
license: Apache-2.0
compatibility: "kubectl 1.28+, Helm 3.12+. Requires access to a Kubernetes cluster (local or cloud-managed)."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: ["kubernetes", "helm", "containers", "orchestration"]
---

# Kubernetes & Helm

## Overview

Writes Kubernetes manifests and Helm charts, deploys and manages applications on Kubernetes clusters, debugs workloads, configures networking and storage, sets up autoscaling and observability, and implements GitOps workflows. Covers both manifest-first and Helm-first approaches for EKS, GKE, AKS, and self-managed clusters.

## Instructions

### 1. Manifest Structure

Standard Kubernetes application layout:

```
k8s/
├── base/
│   ├── namespace.yaml
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── ingress.yaml
│   ├── configmap.yaml
│   ├── secret.yaml
│   ├── hpa.yaml
│   └── kustomization.yaml
├── overlays/
│   ├── dev/
│   │   ├── kustomization.yaml
│   │   └── patch-replicas.yaml
│   ├── staging/
│   └── production/
└── README.md
```

### 2. Core Workloads

**Deployment (stateless apps):**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-server
  namespace: app
  labels:
    app: api-server
    version: v1
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api-server
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1
      maxSurge: 1
  template:
    metadata:
      labels:
        app: api-server
        version: v1
    spec:
      serviceAccountName: api-server
      containers:
        - name: api
          image: registry.example.com/api:1.2.3
          ports:
            - containerPort: 8080
              name: http
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: db-credentials
                  key: url
            - name: LOG_LEVEL
              valueFrom:
                configMapKeyRef:
                  name: api-config
                  key: log-level
          resources:
            requests:
              cpu: 250m
              memory: 256Mi
            limits:
              cpu: 500m
              memory: 512Mi
          readinessProbe:
            httpGet:
              path: /health/ready
              port: http
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /health/live
              port: http
            initialDelaySeconds: 15
            periodSeconds: 20
          lifecycle:
            preStop:
              exec:
                command: ["/bin/sh", "-c", "sleep 10"]
      terminationGracePeriodSeconds: 30
```

**StatefulSet (databases, queues):**
```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: redis
spec:
  serviceName: redis
  replicas: 3
  selector:
    matchLabels:
      app: redis
  template:
    spec:
      containers:
        - name: redis
          image: redis:7-alpine
          ports:
            - containerPort: 6379
          volumeMounts:
            - name: data
              mountPath: /data
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        storageClassName: gp3
        resources:
          requests:
            storage: 10Gi
```

**CronJob:**
```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: db-backup
spec:
  schedule: "0 2 * * *"
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      backoffLimit: 2
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: backup
              image: registry.example.com/db-backup:latest
              envFrom:
                - secretRef:
                    name: backup-credentials
```

### 3. Networking

**Service (ClusterIP for internal, LoadBalancer for external):**
```yaml
apiVersion: v1
kind: Service
metadata:
  name: api-server
spec:
  type: ClusterIP
  selector:
    app: api-server
  ports:
    - port: 80
      targetPort: http
      protocol: TCP
```

**Ingress (nginx-ingress or AWS ALB):**
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: api-ingress
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/rate-limit: "100"
    nginx.ingress.kubernetes.io/rate-limit-window: "1m"
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - api.example.com
      secretName: api-tls
  rules:
    - host: api.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: api-server
                port:
                  number: 80
```

**NetworkPolicy (restrict traffic between namespaces):**
```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: api-netpol
  namespace: app
spec:
  podSelector:
    matchLabels:
      app: api-server
  policyTypes: [Ingress, Egress]
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: ingress
      ports:
        - port: 8080
  egress:
    - to:
        - namespaceSelector:
            matchLabels:
              name: database
      ports:
        - port: 5432
    - to:  # Allow DNS
        - namespaceSelector: {}
      ports:
        - port: 53
          protocol: UDP
```

### 4. Autoscaling

**Horizontal Pod Autoscaler:**
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-server
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api-server
  minReplicas: 3
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
        - type: Pods
          value: 4
          periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 25
          periodSeconds: 60
```

### 5. Helm Charts

**Chart structure:**
```
charts/api-server/
├── Chart.yaml
├── values.yaml
├── values-dev.yaml
├── values-prod.yaml
├── templates/
│   ├── _helpers.tpl
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── ingress.yaml
│   ├── hpa.yaml
│   ├── configmap.yaml
│   ├── secret.yaml
│   ├── serviceaccount.yaml
│   └── NOTES.txt
└── .helmignore
```

**Chart.yaml:**
```yaml
apiVersion: v2
name: api-server
description: API server for the platform
type: application
version: 1.0.0
appVersion: "1.2.3"
dependencies:
  - name: redis
    version: "18.x.x"
    repository: https://charts.bitnami.com/bitnami
    condition: redis.enabled
```

**values.yaml (defaults):**
```yaml
replicaCount: 2
image:
  repository: registry.example.com/api
  tag: latest
  pullPolicy: IfNotPresent
service:
  type: ClusterIP
  port: 80
ingress:
  enabled: false
  className: nginx
  hosts:
    - host: api.example.com
      paths:
        - path: /
          pathType: Prefix
resources:
  requests:
    cpu: 250m
    memory: 256Mi
  limits:
    cpu: 500m
    memory: 512Mi
autoscaling:
  enabled: false
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilization: 70
```

**Template with helpers:**
```yaml
# templates/_helpers.tpl
{{- define "api-server.fullname" -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "api-server.labels" -}}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}
```

**Helm commands:**
```bash
# Install/upgrade
helm upgrade --install api-server ./charts/api-server \
  -n app --create-namespace \
  -f values-prod.yaml \
  --set image.tag=1.2.3

# Diff before applying
helm diff upgrade api-server ./charts/api-server -f values-prod.yaml

# Rollback
helm rollback api-server 1 -n app

# Template locally (debug)
helm template api-server ./charts/api-server -f values-prod.yaml
```

### 6. Debugging

```bash
# Pod not starting
kubectl describe pod <name> -n <ns>        # Check events
kubectl logs <pod> -n <ns> --previous       # Logs from crashed container
kubectl get events -n <ns> --sort-by='.lastTimestamp'

# Shell into pod
kubectl exec -it <pod> -n <ns> -- /bin/sh

# Port forward for local debugging
kubectl port-forward svc/api-server 8080:80 -n app

# Resource usage
kubectl top pods -n app
kubectl top nodes

# DNS debugging
kubectl run -it --rm debug --image=busybox -- nslookup api-server.app.svc.cluster.local

# Network debugging
kubectl run -it --rm debug --image=nicolaka/netshoot -- bash
```

**Common issues and fixes:**
- `ImagePullBackOff` → Check image name, tag, registry auth (imagePullSecrets)
- `CrashLoopBackOff` → Check logs (`--previous`), readiness probe, resource limits
- `Pending` → Check node resources (`kubectl describe node`), PVC binding, taints
- `OOMKilled` → Increase memory limits, check for memory leaks
- `Evicted` → Node disk pressure, check ephemeral storage limits

### 7. GitOps with ArgoCD

```yaml
# ArgoCD Application
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: api-server
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/company/k8s-manifests
    targetRevision: main
    path: overlays/production
  destination:
    server: https://kubernetes.default.svc
    namespace: app
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

### 8. Security Best Practices

- Never run containers as root: `securityContext: { runAsNonRoot: true, runAsUser: 1000 }`
- Read-only root filesystem: `readOnlyRootFilesystem: true`
- Drop all capabilities: `capabilities: { drop: ["ALL"] }`
- Use NetworkPolicies to restrict pod-to-pod traffic
- Use Secrets (or external-secrets-operator) for sensitive data, never ConfigMaps
- Scan images with Trivy in CI before deploying
- Use Pod Security Standards (restricted profile) in production namespaces
- Set resource requests AND limits on every container
- Use ServiceAccounts with minimal RBAC permissions

## Examples

### Example 1: Full Application Stack

**Input:** "Deploy our platform to Kubernetes: a Node.js API (3 replicas), a React frontend served by nginx, a PostgreSQL database, Redis for caching, and a background worker processing jobs from a queue. Include ingress, TLS, autoscaling for the API, and persistent storage for PostgreSQL."

**Output:** Complete manifest set:
- Namespace with resource quotas and limit ranges
- API: Deployment (3 replicas), Service, HPA (3-20 replicas on CPU/memory), readiness/liveness probes
- Frontend: Deployment (2 replicas), Service, nginx config via ConfigMap
- PostgreSQL: StatefulSet, PVC (50Gi gp3), Service (headless), init container for schema
- Redis: Deployment (single for caching, no persistence needed), Service
- Worker: Deployment (2 replicas), scales with queue depth via KEDA
- Ingress: nginx with TLS via cert-manager, path-based routing (/ → frontend, /api → API)
- Secrets: database credentials, Redis URL, API keys via external-secrets-operator

### Example 2: Helm Chart for Multi-Tenant SaaS

**Input:** "Create a Helm chart that deploys our SaaS app with per-tenant isolation. Each tenant gets their own namespace, database schema, and subdomain. The chart should support creating a new tenant with a single `helm install` command."

**Output:** Helm chart with:
- Parameterized namespace creation per tenant
- Deployment with tenant-specific environment variables and config
- PostgreSQL schema initialization job (creates tenant schema on shared cluster)
- Ingress rule with tenant subdomain (`{{ .Values.tenant.slug }}.app.example.com`)
- NetworkPolicy isolating tenant namespace from others
- Resource quotas per tenant (configurable by plan: starter/pro/enterprise)
- `values-tenant-template.yaml` with sensible defaults for new tenant onboarding

## Guidelines

- Always set resource requests and limits — unbound pods cause noisy neighbor problems
- Use `RollingUpdate` strategy with `maxUnavailable: 1` for zero-downtime deploys
- Add `preStop` lifecycle hook with sleep to drain connections during rolling updates
- Readiness probes gate traffic; liveness probes restart stuck processes — configure both
- Use labels consistently: `app`, `version`, `component`, `part-of`
- Pin image tags to specific versions — never use `latest` in production
- Use Helm for parameterized deployments, Kustomize for environment overlays
- Keep Helm values flat and well-documented — avoid deeply nested structures
- Use `helm diff` plugin before every upgrade to review changes
- Prefer `ClusterIP` services with Ingress over `LoadBalancer` (saves cloud LB costs)
- Use PodDisruptionBudgets to prevent all replicas being evicted during node maintenance
- Monitor with Prometheus + Grafana; alert on pod restart count, OOM kills, pending pods
