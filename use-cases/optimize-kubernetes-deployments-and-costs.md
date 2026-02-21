---
title: "Optimize Kubernetes Deployments and Reduce Cluster Costs"
slug: optimize-kubernetes-deployments-and-costs
description: "Shrink container images, streamline Helm charts, and right-size Kubernetes resource requests to cut cluster costs by 40% without impacting reliability."
skills:
  - docker-optimizer
  - kubernetes-helm
  - k8s-cost-optimizer
category: devops
tags:
  - kubernetes
  - docker
  - helm
  - cost-optimization
  - containers
---

# Optimize Kubernetes Deployments and Reduce Cluster Costs

## The Problem

A platform team runs 35 microservices on a Kubernetes cluster with a $9,200/month AWS bill. Container images average 1.2 GB each, pulling times are slow, and rollbacks take 4 minutes because of image size. Helm charts were copy-pasted between services with no shared library chart, so updating a common pattern (like adding readiness probes) requires changing 35 files. Resource requests were set during initial deployment and never revisited -- most pods request 2x to 5x what they actually use.

## The Solution

Using the **docker-optimizer** skill to slim down container images with multi-stage builds and distroless bases, the **kubernetes-helm** skill to refactor charts into a shared library pattern, and the **k8s-cost-optimizer** skill to right-size resource requests based on actual usage metrics.

## Step-by-Step Walkthrough

### 1. Optimize container images

Reduce image sizes with multi-stage builds and minimal base images.

> Analyze our top 10 largest Docker images and optimize them. The Node.js API images are 1.4 GB, the Python ML service is 2.1 GB, and the Go services are 800 MB. Use multi-stage builds, distroless base images where possible, and .dockerignore improvements. Target under 200 MB for Node.js, under 500 MB for Python, and under 50 MB for Go.

The Node.js images drop from 1.4 GB to 145 MB by switching to a multi-stage build with `node:20-slim` for the build stage and `gcr.io/distroless/nodejs20` for runtime. The Go services shrink to 22 MB using `FROM scratch` with statically compiled binaries. Pull times drop from 45 seconds to 8 seconds.

### 2. Create a shared Helm library chart

Consolidate duplicated Helm templates into a reusable library.

> Our 35 services each have their own Helm chart with near-identical templates. Create a shared library chart that handles deployment, service, ingress, HPA, PDB, and service account. Each service should only need a values.yaml file with its specific config. Support common patterns like sidecar containers, init containers, and custom annotations.

The library chart replaces 35 nearly identical `deployment.yaml` templates with a single source of truth. Adding readiness probe configuration is now a one-line change in the library chart that propagates to all 35 services on their next deploy, instead of 35 separate pull requests.

### 3. Right-size resource requests from metrics

Analyze actual usage and generate corrected resource manifests.

> Connect to our production cluster and analyze CPU and memory usage for all 35 services over the last 30 days. Compare actual p95 usage against current requests. Generate patched values.yaml files for each service with right-sized requests using p95 plus 25% headroom. Show me the estimated monthly savings.

The analysis reveals that 28 of 35 services are over-provisioned by more than 50%. The payments service requests 4 CPU but peaks at 0.8 CPU. The notification worker requests 2 GB memory but never exceeds 256 MB. Total estimated savings from right-sizing: $3,400/month.

### 4. Implement resource quotas and cost guardrails

Prevent cost drift by enforcing resource budgets per namespace.

> Set up resource quotas for each namespace so teams cannot over-provision again. Create a LimitRange that sets sensible defaults (200m CPU, 256Mi memory) for pods that omit resource requests. Add a CI check that blocks Helm deploys where requests exceed 3x the p95 usage from the last 14 days.

The LimitRange catches new deployments that forget to set resources -- they get reasonable defaults instead of unlimited allocation. The CI check prevents the slow creep back to over-provisioning by requiring right-sized values in every new chart release.

## Real-World Example

Kai manages a 35-service Kubernetes platform at an e-commerce company. Over two sprints, the team optimizes Docker images (saving 40 seconds per deploy across the fleet), consolidates Helm charts into a library pattern (reducing template maintenance from hours to minutes), and right-sizes resources based on 30 days of production metrics. The cluster bill drops from $9,200 to $5,500 per month. Deploys are faster because images pull in 8 seconds instead of 45. The shared Helm library makes adding security context to all services a single PR instead of 35.
