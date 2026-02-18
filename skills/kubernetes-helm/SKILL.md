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
          image: registry.example.com/api:1.2.3
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
```

**StatefulSet (databases):**
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
    spec:
      containers:
        - name: redis
          image: redis:7-alpine
          ports: [{ containerPort: 6379 }]
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
              image: registry.example.com/db-backup:latest
              envFrom: [{ secretRef: { name: backup-credentials } }]
```

### 2. Networking

**Service + Ingress:**
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
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: api-ingress
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  ingressClassName: nginx
  tls: [{ hosts: [api.example.com], secretName: api-tls }]
  rules:
    - host: api.example.com
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
  repository: registry.example.com/api
  tag: latest
service: { type: ClusterIP, port: 80 }
ingress:
  enabled: false
  className: nginx
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
helm upgrade --install api-server ./charts/api-server -n app --create-namespace -f values-prod.yaml --set image.tag=1.2.3
helm diff upgrade api-server ./charts/api-server -f values-prod.yaml
helm rollback api-server 1 -n app
helm template api-server ./charts/api-server -f values-prod.yaml  # debug
```

### 5. Debugging

```bash
kubectl describe pod <name> -n <ns>        # Check events
kubectl logs <pod> -n <ns> --previous       # Crashed container logs
kubectl exec -it <pod> -n <ns> -- /bin/sh   # Shell into pod
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
  source:
    repoURL: https://github.com/company/k8s-manifests
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

**Output:** Namespace with quotas, API Deployment with HPA (3-20 on CPU/memory) and probes, frontend Deployment with nginx ConfigMap, PostgreSQL StatefulSet (50Gi PVC), Redis Deployment, Worker Deployment with KEDA scaling, Ingress with cert-manager TLS and path routing, Secrets via external-secrets-operator.

### Example 2: Helm Chart for Multi-Tenant SaaS

**Input:** "Helm chart deploying per-tenant isolation: own namespace, database schema, subdomain. Single `helm install` per tenant."

**Output:** Chart with parameterized namespace, tenant-specific env vars, PostgreSQL schema init job, Ingress with `{{ .Values.tenant.slug }}.app.example.com`, NetworkPolicy isolation, resource quotas by plan (starter/pro/enterprise).

## Guidelines

- Always set resource requests and limits on every container
- Use `RollingUpdate` with `maxUnavailable: 1` and `preStop` sleep for zero-downtime deploys
- Configure both readiness and liveness probes
- Pin image tags — never use `latest` in production
- Use Helm for parameterized deployments, Kustomize for environment overlays
- Use `helm diff` before every upgrade
- Prefer `ClusterIP` + Ingress over `LoadBalancer` services
- Use PodDisruptionBudgets for production workloads
- Never run containers as root; drop all capabilities; use read-only root filesystem
- Use NetworkPolicies to restrict pod-to-pod traffic
- Scan images with Trivy in CI before deploying
