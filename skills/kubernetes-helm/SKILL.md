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
compatibility: "kubectl 1.30+, Helm 3.18+ or Helm 4. Requires access to a Kubernetes cluster (local or cloud-managed)."
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: "https://github.com/helm/helm"
  category: devops
  tags: ["kubernetes", "helm", "containers", "orchestration"]
---

# Kubernetes & Helm

## Overview

Writes Kubernetes manifests and Helm charts, deploys and manages applications on Kubernetes clusters, debugs workloads, configures networking and storage, sets up autoscaling and observability, and implements GitOps workflows.

## Instructions

### 1. Core Workloads

**Deployment:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-server
  namespace: app
spec:
  replicas: 3
  selector:
    matchLabels: { app: api-server }
  strategy:
    type: RollingUpdate
    rollingUpdate: { maxUnavailable: 1, maxSurge: 1 }
  template:
    metadata:
      labels: { app: api-server, version: v1 }
    spec:
      containers:
        - name: api
          image: ghcr.io/northwind-labs/api:1.2.3
          ports: [{ containerPort: 8080, name: http }]
          env:
            - name: DATABASE_URL
              valueFrom: { secretKeyRef: { name: db-credentials, key: url } }
          resources:
            requests: { cpu: 250m, memory: 256Mi }
            limits: { cpu: 500m, memory: 512Mi }
          readinessProbe:
            httpGet: { path: /health/ready, port: http }
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet: { path: /health/live, port: http }
            initialDelaySeconds: 15
          lifecycle:
            preStop:
              exec: { command: ["/bin/sh", "-c", "sleep 10"] }
      terminationGracePeriodSeconds: 30
      securityContext: { runAsNonRoot: true, seccompProfile: { type: RuntimeDefault } }
```

**StatefulSet (databases):** needs a headless Service (`clusterIP: None`) named in `serviceName`.
```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: redis
spec:
  serviceName: redis
  replicas: 3
  selector:
    matchLabels: { app: redis }
  template:
    metadata:
      labels: { app: redis }
    spec:
      containers:
        - name: redis
          image: redis:7-alpine
          volumeMounts: [{ name: data, mountPath: /data }]
  volumeClaimTemplates:
    - metadata: { name: data }
      spec:
        accessModes: ["ReadWriteOnce"]
        storageClassName: gp3
        resources: { requests: { storage: 10Gi } }
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
  jobTemplate:
    spec:
      backoffLimit: 2
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: backup
              image: ghcr.io/northwind-labs/db-backup:2.4.0
              envFrom: [{ secretRef: { name: backup-credentials } }]
```

### 2. Networking

The Kubernetes project retired ingress-nginx (best-effort maintenance ended March 2026) and recommends Gateway API for new clusters. The Ingress API itself still works with other controllers (Traefik, HAProxy, cloud load balancers). Gateway API example first, classic Ingress after it.

**Service + HTTPRoute (Gateway API):**
```yaml
apiVersion: v1
kind: Service
metadata:
  name: api-server
spec:
  type: ClusterIP
  selector: { app: api-server }
  ports: [{ port: 80, targetPort: http }]
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: api-route
spec:
  parentRefs: [{ name: public-gateway, namespace: gateway-system }]
  hostnames: ["api.northwind-labs.dev"]
  rules:
    - matches: [{ path: { type: PathPrefix, value: / } }]
      backendRefs: [{ name: api-server, port: 80 }]
```
The Gateway (with its `gatewayClassName` and TLS listener) comes from your chosen implementation; install its CRDs and controller first.

**Ingress (classic):**
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: api-ingress
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  ingressClassName: traefik
  tls: [{ hosts: [api.northwind-labs.dev], secretName: api-tls }]
  rules:
    - host: api.northwind-labs.dev
      http:
        paths:
          - path: /
            pathType: Prefix
            backend: { service: { name: api-server, port: { number: 80 } } }
```

### 3. Autoscaling

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-server
spec:
  scaleTargetRef: { apiVersion: apps/v1, kind: Deployment, name: api-server }
  minReplicas: 3
  maxReplicas: 20
  metrics:
    - type: Resource
      resource: { name: cpu, target: { type: Utilization, averageUtilization: 70 } }
  behavior:
    scaleUp: { stabilizationWindowSeconds: 60, policies: [{ type: Pods, value: 4, periodSeconds: 60 }] }
    scaleDown: { stabilizationWindowSeconds: 300 }
```

### 4. Helm Charts

**Chart structure:**
```
charts/api-server/
├── Chart.yaml
├── values.yaml
├── templates/
│   ├── _helpers.tpl
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── ingress.yaml
│   └── hpa.yaml
```

**values.yaml:**
```yaml
replicaCount: 2
image:
  repository: ghcr.io/northwind-labs/api
  tag: "1.2.3"
service: { type: ClusterIP, port: 80 }
ingress:
  enabled: false
  className: traefik
resources:
  requests: { cpu: 250m, memory: 256Mi }
  limits: { cpu: 500m, memory: 512Mi }
autoscaling:
  enabled: false
  minReplicas: 2
  maxReplicas: 10
```

**Commands:**
```bash
helm lint ./charts/api-server
helm upgrade --install api-server ./charts/api-server -n app --create-namespace -f values-prod.yaml --set image.tag=1.2.3 --wait --timeout 5m
helm plugin install https://github.com/databus23/helm-diff   # once; diff is a plugin
helm diff upgrade api-server ./charts/api-server -n app -f values-prod.yaml
helm rollback api-server 1 -n app
helm template api-server ./charts/api-server -f values-prod.yaml  # debug
```

Helm 4 (released November 2025) keeps these commands. Differences to know: new releases default to server-side apply (`--server-side`), `--atomic` is renamed `--rollback-on-failure`, `--wait` takes a strategy (`watcher`, `hookOnly`, `legacy`), and post-renderers must be plugins. Helm 3 stays supported alongside it.

### 5. Debugging

```bash
kubectl describe pod api-server-7d9f8b6c4-xk2pq -n app        # Check events
kubectl logs api-server-7d9f8b6c4-xk2pq -n app --previous     # Crashed container logs
kubectl exec -it api-server-7d9f8b6c4-xk2pq -n app -- /bin/sh # Shell into pod (use `kubectl debug` for distroless images)
kubectl port-forward svc/api-server 8080:80 -n app
kubectl top pods -n app
```

Common issues:
- `ImagePullBackOff` → Check image name, tag, registry auth (imagePullSecrets)
- `CrashLoopBackOff` → Check logs (`--previous`), probes, resource limits
- `Pending` → Check node resources, PVC binding, taints
- `OOMKilled` → Increase memory limits

### 6. GitOps with ArgoCD

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: api-server
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/northwind-labs/k8s-manifests
    targetRevision: main
    path: overlays/production
  destination:
    server: https://kubernetes.default.svc
    namespace: app
  syncPolicy:
    automated: { prune: true, selfHeal: true }
    syncOptions: [CreateNamespace=true]
```

## Examples

### Example 1: Full Application Stack

**Input:** "Deploy: Node.js API (3 replicas), React frontend, PostgreSQL, Redis, background worker. Include ingress, TLS, autoscaling, persistent storage."

**Output:** Namespace with quotas, API Deployment with HPA (3-20 on CPU/memory) and probes, frontend Deployment with nginx ConfigMap, PostgreSQL StatefulSet (50Gi PVC), Redis Deployment, Worker Deployment with KEDA scaling, Ingress or HTTPRoute with cert-manager TLS and path routing, Secrets via external-secrets-operator.

### Example 2: Helm Chart for Multi-Tenant SaaS

**Input:** "Helm chart deploying per-tenant isolation: own namespace, database schema, subdomain. Single `helm install` per tenant."

**Output:** Chart with parameterized namespace, tenant-specific env vars, PostgreSQL schema init job, route host `{{ .Values.tenant.slug }}.northwind-labs.dev`, NetworkPolicy isolation, resource quotas by plan (starter/pro/enterprise).

## Guidelines

- Always set resource requests and limits on every container
- Use `RollingUpdate` with `maxUnavailable: 1` and `preStop` sleep for zero-downtime deploys
- Configure both readiness and liveness probes
- Pin image tags — never use `latest` in production
- Use Helm for parameterized deployments, Kustomize for environment overlays
- Use `helm diff` (plugin) before every upgrade, and `kubectl apply --dry-run=server` for raw manifests
- Prefer `ClusterIP` + Gateway API/Ingress over one `LoadBalancer` per service
- Use PodDisruptionBudgets for production workloads
- Never run containers as root; drop all capabilities; use read-only root filesystem
- Use NetworkPolicies to restrict pod-to-pod traffic
- Scan images with Trivy in CI before deploying
