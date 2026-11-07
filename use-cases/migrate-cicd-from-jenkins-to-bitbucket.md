---
title: "Migrate CI/CD Pipelines from Jenkins to Bitbucket Pipelines"
slug: migrate-cicd-from-jenkins-to-bitbucket
description: "Move a fragile Jenkins server with 40+ jobs to Bitbucket Pipelines for zero-maintenance CI/CD with pipeline-as-code and built-in deployment environments."
skills:
  - jenkins-pipelines
  - bitbucket
  - cicd-pipeline
category: devops
tags:
  - cicd
  - jenkins
  - bitbucket
  - migration
  - pipelines
---

# Migrate CI/CD Pipelines from Jenkins to Bitbucket Pipelines

## The Problem

A 30-person engineering team runs CI/CD on a self-hosted Jenkins server with 42 pipeline jobs, 15 plugins, and a configuration that one senior engineer set up three years ago. The server crashes monthly under load, plugin updates break builds unpredictably, and the Groovy Jenkinsfiles are 200+ lines of imperative scripting that nobody wants to touch. New team members wait days to understand the build system. The Jenkins server itself needs OS updates, disk cleanup, and security patches -- maintenance work that falls on a single person.

## The Solution

Using the **jenkins-pipelines** skill to audit and document existing Jenkins jobs, the **bitbucket** skill to set up Bitbucket Pipelines with repository-level configuration, and the **cicd-pipeline** skill to design a modern pipeline-as-code workflow with parallel steps, caching, and deployment environments.

## Step-by-Step Walkthrough

### 1. Audit existing Jenkins pipelines

Document all 42 Jenkins jobs and identify patterns, dependencies, and custom scripts.

> Analyze our Jenkins server and document every pipeline job. For each job, extract: trigger conditions, environment variables, build steps, post-build actions, and downstream dependencies. Group them by type (build, test, deploy, scheduled) and flag any jobs that haven't run in 90+ days.

The audit reveals 42 jobs, but only 28 are active. Eight jobs haven't triggered in over six months. Six are cron-based maintenance tasks. The remaining 28 break down into 12 build-and-test pipelines, 10 deployment pipelines, and 6 scheduled tasks.

### 2. Design the Bitbucket Pipelines structure

Create a standardized bitbucket-pipelines.yml template for each project type.

> Convert our 28 active Jenkins jobs to Bitbucket Pipelines. Create three pipeline templates: one for Node.js services (build, lint, test, deploy), one for Python services (build, test, security scan, deploy), and one for infrastructure repos (terraform validate, plan, apply). Use parallel steps where possible, set up caching for node_modules and pip, and configure deployment environments (dev, staging, production) with manual approval gates for production.

The Node.js service template covers the most common pattern across the team's repositories:

```yaml
# bitbucket-pipelines.yml — Node.js service template
image: node:24
definitions:
  caches:
    npm: ~/.npm   # custom cache; npm ci deletes node_modules, so cache npm's download folder
  steps:
    - step: &build
        name: Build
        caches: [npm]
        script: [npm ci, npm run build]
        artifacts: [dist/**]
    - step: &test
        name: Test
        caches: [npm]
        script: [npm ci, npm run lint, npm run test -- --coverage]
pipelines:
  branches:
    main:
      - parallel:
          - step: *build
          - step: *test
      - step:
          name: Deploy Staging
          deployment: staging
          script:
            # uses the SSH key and known_hosts configured under Repository settings > Pipelines > SSH keys
            - pipe: atlassian/ssh-run:0.8.1
              variables: { SSH_USER: deploy, SERVER: staging.example.com,
                COMMAND: "cd /app && ./deploy.sh $BITBUCKET_COMMIT" }
      - step:
          name: Deploy Production
          deployment: production
          trigger: manual
          script:
            - pipe: atlassian/ssh-run:0.8.1
              variables: { SSH_USER: deploy, SERVER: prod.example.com,
                COMMAND: "cd /app && ./deploy.sh $BITBUCKET_COMMIT" }
```

The template is far shorter than a 200-line Jenkinsfile. Artifacts from the parallel `build` step are passed on to the later deploy steps, and the deploy steps run only if everything before them passed. In Bitbucket the `deployment:` name must match an environment configured under Repository settings > Pipelines > Deployments, and a manual `trigger` is only allowed on a step after the first one.

### 3. Migrate pipelines incrementally

Move projects one at a time, running Jenkins and Bitbucket in parallel during transition.

> Start the migration with our lowest-risk service (the internal docs site). Run both Jenkins and Bitbucket Pipelines in parallel for one week to verify identical behavior. Compare build times, test results, and deployment outcomes. Once validated, disable the Jenkins job and move to the next service. Give me a migration schedule for all 28 jobs over 4 weeks.

The parallel-run approach catches two discrepancies in the first week: a Jenkins plugin that silently fixed file permissions, and an environment variable that Jenkins injected globally but Bitbucket needs explicitly. Both are fixed before migrating critical services.

### 4. Decommission Jenkins and clean up

Shut down the Jenkins server and archive its configuration for reference.

> Archive each Jenkins job's `config.xml` (available at `<jenkins-url>/job/<name>/config.xml`) for reference. Migrate the 6 scheduled maintenance tasks to Bitbucket Pipelines schedules: define each as a `custom` pipeline in `bitbucket-pipelines.yml`, then create the schedule under Pipelines > Schedules > New schedule (hourly, daily or weekly). Verify all 28 pipelines are running successfully on Bitbucket, then decommission the Jenkins server.

Once the Jenkins server is gone, so are its hosting bill and its OS and plugin upkeep. Bitbucket Pipelines is billed in build minutes on the workspace plan, so check the included minutes against the team's volume before the cutover.

## Real-World Example

Derek inherits a Jenkins server that crashes every month and has a 200-line Groovy pipeline nobody understands. Over four weeks, he migrates all 28 active jobs to Bitbucket Pipelines using standardized YAML templates. Parallel steps and caching shorten the pipeline, and the team no longer maintains a CI server. When a new engineer joins, she submits her first pipeline change on day two -- a simple YAML edit instead of navigating Jenkins's plugin-heavy UI.

## Related Skills

- **jenkins-pipelines** — read the existing Jenkinsfiles (stages, credentials, parallel blocks, approval gates) so each one maps to a Bitbucket step.
- **bitbucket** — write `bitbucket-pipelines.yml`, deployment environments, secured variables and the API calls that trigger and monitor pipelines.
- **cicd-pipeline** — design the shared pipeline shape: parallel build/test, caching, staged deploys with a manual production gate.
