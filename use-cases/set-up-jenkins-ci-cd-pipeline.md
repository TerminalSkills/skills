---
title: "Set Up a Jenkins CI/CD Pipeline for Multi-Service Deployments"
slug: set-up-jenkins-ci-cd-pipeline
description: "Build a production Jenkins pipeline with shared libraries, Docker agents, parallel testing, Kubernetes deployment, and automated rollbacks across multiple services."
skills: [jenkins-pipelines, docker-helper, kubernetes-helm]
category: devops
tags: [jenkins, ci-cd, pipeline, deployment, automation, devops]
---

# Set Up a Jenkins CI/CD Pipeline for Multi-Service Deployments

## The Problem

A 30-person engineering team runs Jenkins with 15 jobs configured through the UI. Every job is a snowflake — different build scripts, inconsistent test stages, no shared logic. Pipeline changes require clicking through the Jenkins web UI, and nobody knows which job does what without reading the messy shell scripts in each build step. Builds run on a single overloaded Jenkins controller (no agents), causing a 45-minute queue during morning pushes. There are no automated deployments — someone runs a deploy script manually after a passing build. Three times last quarter, a broken build was deployed to production because someone skipped the test step.

## The Solution

Use `jenkins-pipelines` to migrate all jobs to Jenkinsfiles with shared libraries, `docker-helper` to containerize build environments for reproducibility, and `kubernetes-helm` to automate deployments from the pipeline.

```bash
npx terminal-skills install jenkins-pipelines docker-helper kubernetes-helm
```

## Step-by-Step Walkthrough

### 1. Migrate from UI jobs to Jenkinsfiles

```
We have 15 Jenkins jobs configured in the UI for 5 services (API, frontend,
auth, worker, shared-lib). Each service has build, test, and deploy steps
but they're all slightly different. Audit all 15 jobs and create a
standardized Jenkinsfile for each service. Use Declarative Pipeline syntax.

Common stages: checkout → install → lint → test (parallel: unit + integration)
→ build Docker image → push to ECR → deploy to staging → deploy to production
(with manual approval). Post: Slack notification, test report archiving,
workspace cleanup.
```

The agent audits all 15 jobs, identifies the common patterns and per-service differences, and generates 5 Jenkinsfiles that follow a consistent structure. Each Jenkinsfile has identical stage names but service-specific build commands, parallel test execution, Docker image building with commit SHA tags, and environment-specific deploy stages with proper gating.

### 2. Build a shared library for common pipeline logic

```
Extract the common pipeline logic into a Jenkins Shared Library:
- buildDockerImage(name, dockerfile, registry): builds, tags with git SHA, pushes
- runTests(type: 'node'|'python'|'go'): installs deps and runs tests per language
- deployToK8s(service, environment, imageTag): helm upgrade with proper values
- notifySlack(channel, status): success/failure notification with build details
- securityScan(type: 'npm'|'trivy'): runs npm audit or Trivy image scan

The library should be versioned in git. Jenkinsfiles should be 20-30 lines
max, calling library functions for all the heavy lifting.
```

The agent creates a shared library repo with `vars/` global functions and `src/` helper classes, each function handling error cases and providing sensible defaults. The resulting Jenkinsfiles are reduced to ~25 lines each: import library, define agent, call `runTests()`, `buildDockerImage()`, `deployToK8s()`.

### 3. Set up dynamic Kubernetes agents

```
Our Jenkins controller is overloaded running builds directly. Set up
Kubernetes-based agents that spin up per-build and die after:
- Node.js pod template: node:20 + docker-in-docker for building images
- Python pod template: python:3.11 + pip cache volume
- Go pod template: golang:1.22 + module cache volume
- Shared npm/pip cache across builds using PVC

Configure the Jenkins Kubernetes plugin, create pod templates, and update
all Jenkinsfiles to use the appropriate agent for each service.
```

The agent configures the Kubernetes cloud in Jenkins via JCasC, creates three pod templates with tool containers and shared cache PVCs, adds resource requests/limits to prevent noisy neighbors, and updates all Jenkinsfiles with `agent { kubernetes { yamlFile 'jenkins/pod-template.yaml' } }`. Build queue time drops from 45 minutes to under 2 minutes.

### 4. Add quality gates and automated rollbacks

```
Add quality gates to the pipeline:
1. Code coverage must be >80% or the build fails
2. Trivy image scan: no critical/high CVEs
3. Lint must pass with zero warnings
4. Integration tests run against a temporary namespace with test database
5. Performance test: API response time must be <200ms p95

For deployments: if the health check fails after deploy to staging or
production, automatically rollback to the previous Helm release.
Add a /rollback slash command in Jenkins for manual rollbacks.
```

The agent adds quality gate stages with thresholds, a dynamic namespace creation stage for integration tests (namespace deleted in post-always), a k6 performance test with pass/fail criteria, automatic rollback via `helm rollback` in the rescue block, and a parameterized "Rollback" pipeline job that accepts service name and revision number.

### 5. Set up Jenkins Configuration as Code and disaster recovery

```
Our Jenkins config exists only in the UI — if the server dies, we lose
everything. Set up:
1. Jenkins Configuration as Code (JCasC) covering: security, agents,
   credentials (from Kubernetes secrets), shared library config, and all
   global settings
2. Job DSL or seed jobs that auto-create multibranch pipelines for every
   repo in our GitHub org
3. Automated backup of Jenkins home to S3 (daily)
4. Document the full disaster recovery procedure: how to restore Jenkins
   from scratch in under 30 minutes
```

The agent creates a complete JCasC YAML covering all Jenkins configuration, a seed job using Job DSL that scans the GitHub org and creates multibranch pipeline jobs automatically, a backup CronJob that snapshots the Jenkins PVC to S3, and a recovery runbook with exact commands to deploy Jenkins from Helm, restore the PVC snapshot, and verify all jobs are back.

## Real-World Example

A team lead at a 30-person company manages 15 snowflake Jenkins jobs configured through the UI. Morning build queues take 45 minutes, deploy is manual, and broken builds reach production 3 times per quarter.

1. She migrates all jobs to Jenkinsfiles with a shared library — pipeline changes now go through code review
2. Kubernetes agents eliminate the build queue — 15 parallel builds run in under 2 minutes
3. Quality gates block a release with a critical CVE that would have reached production
4. Automatic rollback catches a bad deploy in staging — the previous version is restored in 30 seconds
5. After 3 months: build queue eliminated, zero bad deploys to production, pipeline changes are peer-reviewed, and Jenkins can be fully restored from scratch in 20 minutes

## Related Skills

- [jenkins-pipelines](../skills/jenkins-pipelines/) — Writes Jenkinsfiles, shared libraries, and configures Jenkins as Code
- [docker-helper](../skills/docker-helper/) — Creates containerized build environments for reproducible builds
- [kubernetes-helm](../skills/kubernetes-helm/) — Manages Kubernetes deployments triggered from Jenkins pipelines
