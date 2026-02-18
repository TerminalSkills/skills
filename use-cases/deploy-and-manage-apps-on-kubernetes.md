---
title: "Deploy and Manage Production Applications on Kubernetes with Helm"
slug: deploy-and-manage-apps-on-kubernetes
description: "Go from Docker containers to a production Kubernetes deployment with Helm charts, autoscaling, TLS ingress, GitOps, and zero-downtime rollouts."
skills: [kubernetes-helm, docker-helper, cicd-pipeline, security-audit]
category: devops
tags: [kubernetes, helm, deployment, gitops, containers, production]
---

# Deploy and Manage Production Applications on Kubernetes with Helm

## The Problem

A team runs 6 microservices on a handful of EC2 instances with docker-compose. Deployments are SSH-and-pray: someone logs into the server, pulls the latest image, and restarts the container. There is no autoscaling — during a product launch last quarter, the API server maxed out and returned 503s for 2 hours. Rollbacks mean manually reverting image tags and hoping the database migration was backward-compatible. Staging and production drift constantly because configs are edited in place. The team wants to move to Kubernetes but nobody has done it before.

## The Solution

Use `kubernetes-helm` to write Kubernetes manifests and Helm charts for all services, `docker-helper` to optimize container images for production, `cicd-pipeline` to automate build and deploy with GitOps, and `security-audit` to harden the cluster and scan for misconfigurations.

```bash
npx terminal-skills install kubernetes-helm docker-helper cicd-pipeline security-audit
```

## Step-by-Step Walkthrough

### 1. Containerize and optimize all services

```text
We have 6 services: API (Node.js), frontend (React/nginx), auth service
(Go), worker (Python), PostgreSQL, and Redis. The Docker images are large
(API is 1.2 GB, worker is 900 MB). Optimize all Dockerfiles with
multi-stage builds and create a docker-compose.yaml for local development
that mirrors the Kubernetes setup. Target image sizes under 200 MB each.
```

The agent rewrites all Dockerfiles with multi-stage builds: the API drops from 1.2 GB to 140 MB using a Node.js alpine builder stage, the Python worker goes from 900 MB to 180 MB with pip install in a build stage and copy to a slim runtime. Each image gets a health check endpoint and runs as a non-root user.

### 2. Write Kubernetes manifests and Helm chart

```text
Create a Helm chart for our entire platform. Each service should be a
subchart or a configurable component in the main chart. Requirements:
- API: 3 replicas, HPA scaling 3-20 on CPU (70%), readiness/liveness probes
- Frontend: 2 replicas, nginx serving static files
- Auth: 2 replicas, handles JWT validation
- Worker: 2 replicas, processes background jobs from Redis queue
- PostgreSQL: StatefulSet with 50Gi persistent volume (or use cloud-managed)
- Redis: single replica for caching, no persistence needed
- Ingress: nginx-ingress with TLS via cert-manager
- Separate values files for dev, staging, and production

Include resource requests/limits, pod disruption budgets, network policies,
and service accounts with minimal RBAC.
```

The agent generates a complete Helm chart with parameterized templates, helper functions for labels and selectors, environment-specific values files (dev uses minimal resources, production uses HA configuration), and all the requested security controls. The chart passes `helm lint` and `helm template` without errors.

### 3. Set up the cluster and deploy

```text
We're using EKS (AWS). Set up the cluster with:
- 3 node groups: system (t3.medium), app (t3.large), worker (c5.xlarge spot)
- Taints on worker nodes so only worker pods schedule there
- Install nginx-ingress controller, cert-manager, external-secrets-operator
- Create namespaces: app-dev, app-staging, app-production with resource quotas
- Deploy our Helm chart to staging first

Walk me through the commands step by step.
```

The agent provides the exact `eksctl` cluster config, Helm install commands for cluster add-ons, namespace creation with resource quotas and limit ranges, and the deployment command with staging values. Each step includes verification commands to confirm successful setup.

### 4. Implement GitOps with ArgoCD

```text
Set up ArgoCD for continuous deployment:
- Install ArgoCD on the cluster
- Create ArgoCD Applications for each environment (dev, staging, production)
- Dev auto-syncs from the main branch
- Staging auto-syncs from release/* branches
- Production requires manual sync with approval
- Set up notifications to Slack on sync success/failure
- Add the Helm chart repo as a source

Show me the full ArgoCD configuration.
```

The agent installs ArgoCD via Helm, configures three Application resources with different sync policies, sets up an ApplicationSet for automatic environment detection, configures Slack notifications via argocd-notifications, and adds RBAC so only the platform team can trigger production syncs.

### 5. Add monitoring, autoscaling, and zero-downtime deploys

```text
Complete the production setup:
- Prometheus + Grafana for monitoring (install via kube-prometheus-stack)
- Dashboards for: pod CPU/memory, request latency, error rates, HPA status
- Alerts for: pod CrashLoopBackOff, high error rate, HPA at max replicas,
  node disk pressure, certificate expiry
- Configure zero-downtime rolling updates with preStop hooks and PDBs
- Set up KEDA for the worker to scale based on Redis queue length
- Run a security audit: pod security standards, network policies, RBAC review

Show me the Grafana dashboard JSON and all alerting rules.
```

The agent deploys kube-prometheus-stack with custom values, creates Grafana dashboards with panels for all key metrics, configures PrometheusRule resources for alerting, adds preStop hooks (sleep 10) and PodDisruptionBudgets (minAvailable: 1) to all deployments, installs KEDA with a ScaledObject for the worker targeting Redis list length, and runs a security scan reporting findings with fix recommendations.

## Real-World Example

A lead engineer at a 20-person SaaS startup runs 6 services on EC2 with docker-compose. Deployments require SSH access, there is no autoscaling, and last quarter's product launch caused a 2-hour outage from overloaded servers.

1. She optimizes Docker images — total image size drops from 4.5 GB to 800 MB, cutting deploy times by 70%
2. The Helm chart codifies the entire stack — spinning up a new environment takes 5 minutes instead of a day
3. EKS cluster with spot instances for workers saves 65% on compute costs compared to on-demand EC2
4. ArgoCD automates deployments — git push triggers a staged rollout through dev → staging → production
5. HPA handles the next product launch smoothly — the API scales from 3 to 15 pods in 2 minutes, zero 503s
6. After 2 months: deploy frequency increases from 2/week to 5/day, MTTR drops from 2 hours to 10 minutes, and the team has not SSH'd into a server once
