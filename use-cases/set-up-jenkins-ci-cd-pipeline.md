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

A 30-person engineering team runs Jenkins with 15 jobs configured through the UI. Every job is a snowflake: different build scripts, inconsistent test stages, no shared logic. Pipeline changes mean clicking through the Jenkins web UI, and nobody knows which job does what without reading the shell scripts buried in each build step.

Builds run on a single overloaded Jenkins controller with no agents, which means a long queue every morning when everyone pushes at once. There are no automated deployments: someone runs a deploy script by hand after a passing build. Three times last quarter, a broken build reached production because someone skipped the test step.

The worst part: if the Jenkins server dies, all 15 jobs disappear. Nothing is in code.

## The Solution

Use **jenkins-pipelines** to migrate all jobs to Jenkinsfiles with a shared library, **docker-helper** to containerize build environments and the service images, and **kubernetes-helm** to deploy from the pipeline and roll back. The examples target a current Jenkins LTS (controller and agents on Java 21 or 25) with the Pipeline, Docker Pipeline, Kubernetes, Job DSL and Configuration as Code plugins, and Helm 3.18+ or Helm 4.

## Step-by-Step Walkthrough

### Step 1: Migrate from UI Jobs to Jenkinsfiles

```text
We have 15 Jenkins jobs configured in the UI for 5 services (API, frontend,
auth, worker, shared-lib). Each service has build, test, and deploy steps
but they're all slightly different. Audit all 15 jobs and create a
standardized Jenkinsfile for each service. Use Declarative Pipeline syntax.

Common stages: checkout -> install -> lint -> test (parallel: unit + integration)
-> build Docker image -> push to our registry -> deploy to staging -> deploy to
production (with manual approval). Post: Slack notification, test report
archiving, workspace cleanup.
```

The audit shows a familiar pattern: 15 jobs that are 80% identical and 20% snowflake. The resulting Jenkinsfiles standardize the structure: identical stage names, parallel test execution, images tagged with the commit SHA, and deploy stages gated by branch. Per-service differences (Node vs Python build commands, different test runners) shrink to a few lines each. Have the agent lint every Jenkinsfile before committing, using the declarative linter the controller exposes:

```bash
# JENKINS_AUTH holds "username:api_token"
curl -s -X POST --user "$JENKINS_AUTH" -F "jenkinsfile=<Jenkinsfile" \
  "$JENKINS_URL/pipeline-model-converter/validate"
```

### Step 2: Build a Shared Library for Common Pipeline Logic

```text
Extract the common pipeline logic into a Jenkins Shared Library:
- buildDockerImage(name, dockerfile, registry): builds, tags with git SHA, pushes
- runTests(type: 'node'|'python'|'go'): installs deps and runs tests per language
- deployToK8s(service, environment, imageTag): helm upgrade, rollback on failure
- notifySlack(channel, status): success/failure notification with build details
Version the library in git; Jenkinsfiles should pin a release tag and stay
under 30 lines, calling library functions for the heavy lifting.
```

Each service ships a multi-stage Dockerfile (builder stage with dev dependencies, slim runtime stage running as a non-root user), which is what `buildDockerImage` builds; the docker-helper skill covers that part. The library repository gets a `vars/` directory (one file per global step) and, if needed, `src/` for helper classes. Register it under Manage Jenkins, System, as a Global Trusted Pipeline Library, and pin Jenkinsfiles to a tag. Anyone who can push to a trusted library repository can run code on the controller, so protect that repository with required reviews. Two steps from the library:

```groovy
// vars/buildDockerImage.groovy
def call(Map config) {
    def tag = config.tag ?: env.GIT_COMMIT.take(8)
    def registry = config.registry ?: 'registry.northwind.dev'
    def image = "${registry}/${config.name}:${tag}"
    stage('Build Image') {
        docker.build(image, "-f ${config.dockerfile ?: 'Dockerfile'} .")
        docker.withRegistry("https://${registry}", config.credentialsId ?: 'registry-creds') {
            docker.image(image).push()
        }
    }
    return image
}
```

```groovy
// vars/deployToK8s.groovy
def call(Map c) {   // service, environment, imageTag, kubeconfigId
    stage("Deploy ${c.environment}") {
        withCredentials([file(credentialsId: c.kubeconfigId, variable: 'KUBECONFIG')]) {
            // Single quotes: the shell expands the variables, Groovy never sees the kubeconfig path
            withEnv(["SVC=${c.service}", "ENV_NS=${c.environment}", "TAG=${c.imageTag}"]) {
                sh '''
                  helm upgrade --install "$SVC" "./charts/$SVC" -n "$ENV_NS" \
                    --set image.tag="$TAG" --wait --timeout 5m || {
                      echo "Deploy failed, rolling back"
                      helm rollback "$SVC" -n "$ENV_NS" --wait || true
                      exit 1
                    }
                '''
            }
        }
    }
}
```

`helm rollback` without a revision returns to the previous release. (Helm 3 also offers `helm upgrade --atomic`, renamed `--rollback-on-failure` in Helm 4; the explicit form above works on both.) The Jenkinsfiles shrink from 200+ lines of duplicated shell to about 25:

```groovy
// Jenkinsfile: API service
@Library('pipeline-lib@v1.4.0') _

pipeline {
  agent none
  options { timeout(time: 30, unit: 'MINUTES'); disableConcurrentBuilds() }
  stages {
    stage('Test') {
      agent { kubernetes { yamlFile 'jenkins/pod-template.yaml'; defaultContainer 'node' } }
      steps { runTests('node') }
    }
    stage('Image') {
      agent { kubernetes { yamlFile 'jenkins/pod-template.yaml'; defaultContainer 'docker' } }
      steps { script { env.IMAGE = buildDockerImage(name: 'api') } }
    }
    stage('Deploy Staging') {
      when { branch 'main'; beforeAgent true }
      agent { kubernetes { yamlFile 'jenkins/pod-template.yaml'; defaultContainer 'helm' } }
      steps { deployToK8s(service: 'api', environment: 'staging', imageTag: env.GIT_COMMIT.take(8), kubeconfigId: 'kubeconfig-staging') }
    }
    stage('Approve Production') {
      when { branch 'main'; beforeInput true }
      input { message 'Deploy to production?'; ok 'Deploy'; submitter 'platform-team' }
      steps { echo 'Approved' }   // no agent here: waiting for a human holds no executor
    }
    stage('Deploy Production') {
      when { branch 'main'; beforeAgent true }
      agent { kubernetes { yamlFile 'jenkins/pod-template.yaml'; defaultContainer 'helm' } }
      steps { deployToK8s(service: 'api', environment: 'production', imageTag: env.GIT_COMMIT.take(8), kubeconfigId: 'kubeconfig-prod') }
    }
  }
  post { always { notifySlack('#deploys', currentBuild.currentResult) } }
}
```

`agent none` at the top plus an agent-less approval stage means a pending approval holds no executor, and `beforeInput true` stops feature branches from asking for approval.

### Step 3: Set Up Dynamic Kubernetes Agents

```text
Our Jenkins controller is overloaded running builds directly. Set up
Kubernetes-based agents that spin up per build and die after. Pod templates
for Node.js, Python and Go services, a helm container for deploys, and a
shared dependency cache. Use the Jenkins Kubernetes plugin and update all
Jenkinsfiles to pick the right pod template.
```

The agent runs one pod per build, with a container per tool. Containers that should wait for `sh` steps need a long-running command such as `sleep`. Pin current images (Node 24, Python 3.13, Go 1.27 are examples; match your runtime versions):

```yaml
# jenkins/pod-template.yaml
apiVersion: v1
kind: Pod
spec:
  containers:
    - name: node
      image: node:24-alpine
      command: ['sleep', '99d']
      resources: { requests: { cpu: 500m, memory: 1Gi }, limits: { memory: 2Gi } }
    - name: docker
      image: docker:29-dind
      securityContext: { privileged: true }   # dind needs it: run on a dedicated build node pool
    - name: helm
      image: alpine/helm:4.3.1
      command: ['sleep', '99d']
```

Resource requests and limits keep one runaway build from starving the others. The `docker:dind` container is privileged, so it can take over its node: keep these pods off shared clusters, or build images with a rootless builder instead. Per-language pods (`python:3.13-slim`, `golang:1.27`) follow the same shape, each with its own template file.

### Step 4: Add Quality Gates and Automated Rollbacks

```text
Add quality gates to the pipeline:
1. Test coverage must be at least 80% or the build fails
2. Trivy image scan: fail on CRITICAL vulnerabilities that have a fix
3. Lint must pass with zero warnings
4. Integration tests run against a temporary namespace with a test database
5. k6 smoke test against staging: p95 under 200ms
Add a parameterized "Rollback" job that takes a service name and a Helm
revision for manual rollbacks.
```

Each gate is a stage whose command exits non-zero when the threshold is missed, which is all Jenkins needs to stop the pipeline:

```groovy
stage('Image Scan') {
  steps { sh 'trivy image --exit-code 1 --severity CRITICAL --ignore-unfixed "$IMAGE"' }
}
stage('Perf Gate') {
  steps { sh 'k6 run -e BASE_URL="https://staging.northwind.dev" perf/smoke.js' }
}
```

`--exit-code 1` is required, because Trivy exits 0 by default even with findings. In the k6 script, `thresholds: { http_req_duration: ['p(95)<200'] }` makes `k6 run` exit with code 99 when the p95 is above 200 ms (checked against a local test server). Coverage thresholds belong to the test runner: `jest --coverage --coverageThreshold='{"global":{"lines":80}}'` or `pytest --cov=app --cov-fail-under=80`. Integration tests create a namespace named after the build number (`kubectl create namespace it-$BUILD_NUMBER`) and delete it in `post { always }`.

The automatic rollback is the `deployToK8s` function from Step 2: when `helm upgrade --wait` fails its readiness checks, the release goes back to the previous revision. The manual "Rollback" job runs `helm history "$SERVICE" -n "$NS"` to list revisions and `helm rollback "$SERVICE" "$REVISION" -n "$NS" --wait` for the chosen one.

### Step 5: Jenkins Configuration as Code and Disaster Recovery

```text
Our Jenkins config exists only in the UI. Set up:
1. Jenkins Configuration as Code (JCasC) for security, agents, credentials
   (from Kubernetes secrets) and global settings
2. Job DSL seed jobs that create a multibranch pipeline for each service repo
3. A daily backup of the Jenkins home volume to object storage
4. A written disaster recovery runbook: restore Jenkins from scratch
```

Install Jenkins from the official Helm chart and keep its values in git (`helm repo add jenkins https://charts.jenkins.io`, then `helm install jenkins jenkins/jenkins -f values.yaml`). The chart installs the JCasC plugin and takes the configuration under `controller.JCasC.configScripts`. Kubernetes secrets are exposed to JCasC as `${secret-name-key}` variables through `controller.additionalExistingSecrets`, so no token appears in the YAML:

```yaml
# values.yaml (excerpt)
controller:
  additionalPlugins: [job-dsl, github-branch-source, docker-workflow, slack]
  additionalExistingSecrets:
    - name: github-credentials
      keyName: token
  JCasC:
    configScripts:
      credentials: |
        credentials:
          system:
            domainCredentials:
              - credentials:
                  - string:
                      id: github
                      scope: GLOBAL
                      description: GitHub token for branch scanning
                      secret: ${github-credentials-token}
      seed-jobs: |
        jobs:
          - script: >
              multibranchPipelineJob('api') {
                branchSources {
                  github {
                    id('api-github')   // constant and unique, required
                    scanCredentialsId('github')
                    repoOwner('northwind')
                    repository('api')
                  }
                }
                orphanedItemStrategy { discardOldItems { numToKeep(5) } }
                triggers { periodicFolderTrigger { interval('5') } }
              }
```

To capture an existing controller, use Manage Jenkins, Configuration as Code, View Configuration, and move the YAML into the chart values. Add one `multibranchPipelineJob` per service, or an `organizationFolder` to discover every repository with a `Jenkinsfile`.

Back up the Jenkins home volume daily (a Kubernetes `VolumeSnapshot` or a CronJob that copies it to object storage), and keep the runbook next to the chart: install the chart, restore the volume, confirm the jobs and credentials are back. Because the configuration and jobs live in git, a restore only has to bring back build history and the controller's own keys.

## Real-World Example

Maya leads engineering at a 30-person company. She inherits 15 snowflake Jenkins jobs, a single overloaded controller with long morning queues, manual deploys, and broken builds reaching production three times last quarter.

She migrates the jobs to Jenkinsfiles backed by a pinned shared library, so pipeline changes go through code review like any other change. Kubernetes agents replace the single controller: builds run in parallel on ephemeral pods instead of queueing behind each other. The Trivy gate blocks a release carrying a critical CVE, and a failed readiness check after a staging deploy rolls the release back automatically. Because the controller is described by Helm values and JCasC in git, rebuilding it is a reinstall plus a volume restore rather than a week of clicking through the UI.

## Related Skills

- [jenkins-pipelines](/skills/jenkins-pipelines) - Jenkinsfile syntax, shared libraries, Docker and Kubernetes agents, credentials
- [docker-helper](/skills/docker-helper) - Dockerfiles and image builds for the service images and build environments
- [kubernetes-helm](/skills/kubernetes-helm) - Helm releases, upgrades and rollbacks used for the deploy stages
