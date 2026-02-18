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

A team runs 6 microservices on a handful of EC2 instances with docker-compose. Deployments are SSH-and-pray: someone logs into the server, pulls the latest image, and restarts the container. There is no autoscaling — during a product launch last quarter, the API server maxed out and returned 503s for 2 hours while the team scrambled to spin up more instances manually.

Rollbacks mean manually reverting image tags and hoping the database migration was backward-compatible. Staging and production drift constantly because configs are edited in place. The team wants to move to Kubernetes but nobody has done it before, and the Kubernetes documentation reads like it was written for people who already know Kubernetes.

## The Solution

Using **kubernetes-helm** to write Kubernetes manifests and Helm charts, **docker-helper** to optimize container images, **cicd-pipeline** to automate builds and deploys with GitOps, and **security-audit** to harden the cluster, the entire stack goes from SSH-and-pray to automated, scalable, and reproducible.

## Step-by-Step Walkthrough

The migration happens in five stages: optimize the Docker images, write the Helm chart, set up the cluster, automate deployments with GitOps, and add monitoring and security. Each stage is independently valuable — even if the team stopped after step 2, they'd have reproducible deployments and consistent environments.

### Step 1: Containerize and Optimize All Services

The Docker images are the foundation, and right now they're massive:

```text
We have 6 services: API (Node.js), frontend (React/nginx), auth service (Go), worker (Python), PostgreSQL, and Redis. The Docker images are large (API is 1.2 GB, worker is 900 MB). Optimize all Dockerfiles with multi-stage builds and create a docker-compose.yaml for local development that mirrors the Kubernetes setup. Target image sizes under 200 MB each.
```

Multi-stage builds make the difference. The Node.js API drops from 1.2GB to 140MB by using an alpine builder stage that installs dependencies, compiles TypeScript, and copies only the production output to a slim runtime image. The Python worker goes from 900MB to 180MB with the same pattern — `pip install` in a build stage, copy site-packages to a slim base.

| Service | Before | After | Technique |
|---------|--------|-------|-----------|
| API (Node.js) | 1.2 GB | 140 MB | Alpine multi-stage, production-only deps |
| Frontend (React) | 800 MB | 25 MB | Build stage + nginx:alpine |
| Auth (Go) | 350 MB | 12 MB | Scratch base with static binary |
| Worker (Python) | 900 MB | 180 MB | Slim runtime, no build tools |

Every image gets a health check endpoint and runs as a non-root user. The Go auth service compiles to a static binary and runs on `scratch` — the smallest possible base image, with literally nothing except the binary. Total image size drops from 4.5GB to 800MB — deploy times shrink proportionally, and container startup times improve because there's less to load from the registry.

### Step 2: Write the Helm Chart

```text
Create a Helm chart for our entire platform. Each service should be a subchart or a configurable component in the main chart. Requirements:
- API: 3 replicas, HPA scaling 3-20 on CPU (70%), readiness/liveness probes
- Frontend: 2 replicas, nginx serving static files
- Auth: 2 replicas, handles JWT validation
- Worker: 2 replicas, processes background jobs from Redis queue
- PostgreSQL: StatefulSet with 50Gi persistent volume (or use cloud-managed)
- Redis: single replica for caching, no persistence needed
- Ingress: nginx-ingress with TLS via cert-manager
- Separate values files for dev, staging, and production

Include resource requests/limits, pod disruption budgets, network policies, and service accounts with minimal RBAC.
```

The Helm chart comes out with parameterized templates, helper functions for consistent labels and selectors, and three environment-specific values files. Dev uses minimal resources (1 replica each, small memory limits). Production uses HA configuration (multiple replicas, pod disruption budgets, anti-affinity rules).

The key insight: resource requests and limits are different per environment. Dev gets `requests: 128Mi / limits: 256Mi` so it runs on a laptop. Production gets `requests: 512Mi / limits: 1Gi` with HPA to scale based on actual load. The chart passes `helm lint` and `helm template` without errors.

### Step 3: Set Up the Cluster and Deploy

```text
We're using EKS (AWS). Set up the cluster with:
- 3 node groups: system (t3.medium), app (t3.large), worker (c5.xlarge spot)
- Taints on worker nodes so only worker pods schedule there
- Install nginx-ingress controller, cert-manager, external-secrets-operator
- Create namespaces: app-dev, app-staging, app-production with resource quotas
- Deploy our Helm chart to staging first

Walk me through the commands step by step.
```

The cluster setup follows a specific order: EKS cluster first (via `eksctl` with a cluster config YAML), then cluster add-ons (ingress, cert-manager, external-secrets), then namespaces with resource quotas and limit ranges, then the first deployment to staging.

Spot instances for the worker node group save 65% on compute — background jobs are tolerant of interruption, so spot is a natural fit. Taints ensure only worker pods land on worker nodes, keeping the app nodes clean for latency-sensitive API traffic.

Each step includes verification commands. The cluster isn't "done" until `kubectl get pods -A` shows everything running, cert-manager successfully issues a test certificate, and the staging deployment responds to health checks through the ingress.

One common mistake at this stage: deploying directly to production-like settings before validating in staging. The staging namespace gets resource quotas that cap total CPU and memory — so a misconfigured deployment can't consume the entire cluster — and limit ranges that set defaults for pods that don't specify resource requests. This catches configuration errors early, before they affect production.

### Step 4: Implement GitOps with ArgoCD

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

ArgoCD turns git into the source of truth. Push a change to the Helm chart, ArgoCD detects the diff and syncs the cluster to match. No more SSH, no more `kubectl apply` from laptops, no more "who deployed what and when?"

Three Application resources get created with different sync policies:
- **Dev:** auto-sync on every push to main, auto-prune orphaned resources
- **Staging:** auto-sync from release branches, requires passing health checks
- **Production:** manual sync only, requires platform team approval via RBAC

Slack notifications fire on every sync — success and failure. The team always knows when a deployment happened and whether it worked. No more "who deployed to production at 3 PM?" — the notification includes the git commit, the author, and the sync result.

### Step 5: Add Monitoring, Autoscaling, and Security

```text
Complete the production setup:
- Prometheus + Grafana for monitoring (install via kube-prometheus-stack)
- Dashboards for: pod CPU/memory, request latency, error rates, HPA status
- Alerts for: pod CrashLoopBackOff, high error rate, HPA at max replicas, node disk pressure, certificate expiry
- Configure zero-downtime rolling updates with preStop hooks and PDBs
- Set up KEDA for the worker to scale based on Redis queue length
- Run a security audit: pod security standards, network policies, RBAC review
```

The monitoring stack goes in via `kube-prometheus-stack` with custom Grafana dashboards covering all key metrics. Alerting rules catch the things that matter: CrashLoopBackOff (something is broken), HPA at max replicas (you're running out of headroom), and certificate expiry (TLS will break in 30 days).

Zero-downtime deploys use `preStop` hooks (`sleep 10` to drain connections) and PodDisruptionBudgets (`minAvailable: 1` so at least one pod is always serving). KEDA scales the worker based on Redis list length instead of CPU — a much better signal for queue-based workloads.

The security audit scans for common Kubernetes misconfigurations: containers running as root, missing network policies, overly permissive RBAC roles, and pods without security contexts. Each finding comes with a specific fix — not a vague recommendation but an actual manifest change. "Container runs as root" becomes "add `securityContext: { runAsNonRoot: true, runAsUser: 1000 }` to the pod spec" with the exact YAML.

This is the kind of hardening that teams skip when they're rushing to get to production and then never come back to. Having it built into the initial setup means the cluster starts secure instead of starting insecure and hoping someone remembers to fix it later.

## Real-World Example

A lead engineer at a 20-person SaaS startup runs 6 services on EC2 with docker-compose. Deployments require SSH access, there's no autoscaling, and last quarter's product launch caused a 2-hour outage from overloaded servers.

Docker image optimization drops total image size from 4.5GB to 800MB, cutting deploy times by 70%. The Helm chart codifies the entire stack — spinning up a new environment takes 5 minutes instead of a day of manual configuration. EKS with spot instances for workers saves 65% on compute costs compared to on-demand EC2.

ArgoCD automates deployments: git push triggers a staged rollout through dev, staging, and production. No more SSH, no more "who deployed this?" The HPA handles the next product launch smoothly — the API scales from 3 to 15 pods in 2 minutes, zero 503s, zero manual intervention.

After 2 months: deploy frequency increases from 2 per week to 5 per day, MTTR drops from 2 hours to 10 minutes, and the team hasn't SSH'd into a server once. The next product launch goes smoothly — the API auto-scales, the monitoring dashboard shows the load spike in real time, and the on-call engineer watches from Grafana instead of scrambling to manually provision servers.

The biggest cultural change isn't the tooling — it's that infrastructure becomes code. Every configuration change goes through a pull request, gets reviewed, and has a git history. "Who changed the production config?" has an answer in the git log instead of being a mystery.
