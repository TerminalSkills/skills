---
name: jenkins-pipelines
description: >-
  Jenkins is an open-source automation server that runs CI/CD pipelines defined
  as code in a Jenkinsfile. Use when the user wants to write or fix a
  Jenkinsfile (declarative or scripted), set up multibranch pipelines, run
  stages in Docker or Kubernetes agents, create shared libraries, bind
  credentials and secrets, run stages in parallel, gate a deployment behind an
  approval, validate a Jenkinsfile with the linter, or troubleshoot build
  failures. Trigger words: jenkins, jenkinsfile, jenkins pipeline, jenkins
  agent, jenkins shared library, jenkins docker, jenkins kubernetes,
  multibranch pipeline, jenkins credentials, jenkins groovy.
license: Apache-2.0
compatibility: "Jenkins LTS 2.555.1 or newer (controller and agents run on Java 21 or 25) with the Pipeline plugin suite; other plugins as noted per step."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  repository: https://github.com/jenkinsci/jenkins
  tags: ["jenkins", "ci-cd", "pipelines", "automation"]
---

# Jenkins Pipelines

## Overview

Creates and manages Jenkins CI/CD pipelines using both Declarative and Scripted syntax. Covers Jenkinsfile authoring, multibranch pipelines, shared libraries, Docker and Kubernetes agents, credential management, parallel execution, artifact handling, notifications, and production-grade pipeline patterns. Checked against Jenkins LTS 2.580.1.

## Instructions

### 1. Declarative Pipeline

Steps outside the Pipeline suite come from plugins: `agent { docker }` and `docker.build` (Docker Pipeline), `timestamps()` (Timestamper), `cleanWs()` (Workspace Cleanup), `slackSend` (Slack Notification), `junit` (JUnit).

```groovy
pipeline {
    agent none   // each stage picks its agent; no executor is held while waiting for approval
    options {
        timeout(time: 30, unit: 'MINUTES')   // also aborts a pending approval
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '20'))
        timestamps()
    }
    environment {
        APP_NAME = 'api-server'
        REGISTRY = 'registry.northwind.dev'
        IMAGE = "${REGISTRY}/${APP_NAME}"
    }
    stages {
        stage('Verify') {
            agent { docker { image 'node:24-alpine' } }
            environment { npm_config_cache = "${WORKSPACE}/.npm" }   // Jenkins runs the container as the agent's uid, which has no writable home
            stages {
                stage('Install') { steps { sh 'npm ci' } }
                stage('Lint & Test') {
                    parallel {
                        stage('Lint') { steps { sh 'npm run lint' } }
                        stage('Unit Tests') {
                            steps { sh 'npm test -- --coverage' }
                            post { always { junit 'reports/junit.xml' } }
                        }
                        stage('Security') { steps { sh 'npm audit --audit-level=high' } }
                    }
                }
            }
        }
        stage('Build Image') {
            agent { label 'docker' }   // agent with the Docker CLI and daemon access
            steps {
                script {
                    def tag = env.GIT_COMMIT.take(8)
                    docker.build("${IMAGE}:${tag}")
                    docker.withRegistry("https://${REGISTRY}", 'registry-credentials') {
                        docker.image("${IMAGE}:${tag}").push()
                        if (env.BRANCH_NAME == 'main') docker.image("${IMAGE}:${tag}").push('latest')
                    }
                }
            }
            post { cleanup { cleanWs() } }
        }
        stage('Deploy Staging') {
            when { branch 'main'; beforeAgent true }
            agent { label 'docker' }
            steps {
                withCredentials([file(credentialsId: 'kubeconfig-staging', variable: 'KUBECONFIG')]) {
                    sh "helm upgrade --install ${APP_NAME} ./charts/${APP_NAME} -n staging --set image.tag=${GIT_COMMIT.take(8)} --wait"
                }
            }
        }
        stage('Deploy Production') {
            when { branch 'main'; beforeInput true }   // without beforeInput, every branch would prompt
            input { message 'Deploy to production?'; ok 'Deploy'; submitter 'admin,platform-team' }
            agent { label 'docker' }
            steps {
                withCredentials([file(credentialsId: 'kubeconfig-prod', variable: 'KUBECONFIG')]) {
                    sh "helm upgrade --install ${APP_NAME} ./charts/${APP_NAME} -n production --set image.tag=${GIT_COMMIT.take(8)} --wait --timeout 10m"
                }
            }
        }
    }
    post {
        success { slackSend(channel: '#deployments', color: 'good', message: "Deployed: ${env.BUILD_URL}") }
        failure { slackSend(channel: '#deployments', color: 'danger', message: "Failed: ${env.BUILD_URL}") }
    }
}
```

### 2. Multibranch Pipeline

`when { branch }` and `changeRequest()` only match in multibranch jobs. GitHub Branch Source already reports each build as a commit status on the branch or pull request; `withChecks` (GitHub Checks plugin, needs GitHub App credentials) adds a named check. The older `githubNotify` step is no longer recommended by its own maintainers.

```groovy
stage('Deploy') {
    when { anyOf { branch 'main'; branch pattern: 'release/.*', comparator: 'REGEXP' } }
    steps { sh './scripts/deploy.sh' }
}
stage('PR Checks') {
    when { changeRequest target: 'main' }
    steps {
        withChecks('Unit Tests') {
            sh 'npm test'
            junit 'reports/junit.xml'
        }
    }
}
```

### 3. Shared Libraries

A library repository holds global steps in `vars/` (one file per step, e.g. `buildDockerImage.groovy`, `deployToK8s.groovy`, `notifySlack.groovy`), classes in `src/` and non-Groovy files in `resources/`.

**vars/buildDockerImage.groovy:**
```groovy
def call(Map config) {
    def tag = config.tag ?: env.GIT_COMMIT.take(8)
    def registry = config.registry ?: 'registry.northwind.dev'
    def image = "${registry}/${config.name}:${tag}"
    stage('Build Image') {
        docker.build(image, "-f ${config.dockerfile ?: 'Dockerfile'} .")
        docker.withRegistry("https://${registry}", config.credentialsId ?: 'registry-creds') {
            docker.image(image).push()
            if (env.BRANCH_NAME == 'main') docker.image(image).push('latest')
        }
    }
    return image
}
```

**Usage** (register the library under Manage Jenkins → System as a Global Trusted or Untrusted Pipeline Library; pin a tag or branch after `@`):
```groovy
@Library('company-pipeline-lib@v1.4.0') _
pipeline {
    agent any
    stages {
        stage('Build') {
            steps { script { def image = buildDockerImage(name: 'api-server') } }
        }
    }
    post { always { notifySlack() } }
}
```

### 4. Kubernetes Agents

Requires the Kubernetes plugin and a configured cloud. Containers that should wait for steps need a long-running command such as `sleep`.

```groovy
pipeline {
    agent {
        kubernetes {
            yaml '''
apiVersion: v1
kind: Pod
spec:
  containers:
    - name: node
      image: node:24-alpine
      command: ['sleep', '99d']
    - name: docker
      image: docker:29-dind
      securityContext: { privileged: true }
    - name: helm
      image: alpine/helm:4.3.0
      command: ['sleep', '99d']
'''
            defaultContainer 'node'
        }
    }
    stages {
        stage('Build') { steps { sh 'npm ci && npm run build' } }
        stage('Docker') { steps { container('docker') { sh 'docker build -t api-server .' } } }
        stage('Deploy') { steps { container('helm') { sh 'helm upgrade --install api-server ./charts/api-server' } } }
    }
}
```

### 5. Credentials Management

Use single-quoted `sh` strings so the shell, not Groovy, expands the secret.

```groovy
// Username/password
withCredentials([usernamePassword(credentialsId: 'db-creds', usernameVariable: 'DB_USER', passwordVariable: 'DB_PASS')]) {
    sh 'PGPASSWORD=$DB_PASS psql -U $DB_USER -h db.internal.northwind.dev -c "select 1"'
}
// Secret text
withCredentials([string(credentialsId: 'api-key', variable: 'API_KEY')]) {
    sh 'curl -H "Authorization: Bearer $API_KEY" https://api.northwind.dev/v1/deployments'
}
// SSH key
withCredentials([sshUserPrivateKey(credentialsId: 'deploy-key', keyFileVariable: 'SSH_KEY', usernameVariable: 'SSH_USER')]) {
    sh 'ssh -i $SSH_KEY $SSH_USER@deploy.northwind.dev "./deploy.sh"'
}
// File, e.g. a kubeconfig: see the deploy stages in section 1
```

### 6. Pipeline Patterns

Retry with a timeout, roll back on failure, and move files between agents with stash/unstash (meant for small files):

```groovy
stage('Build') {
    steps { sh 'npm run build'; stash includes: 'dist/**', name: 'build-artifacts' }
}
stage('Deploy') {
    agent { label 'deploy-node' }
    steps {
        unstash 'build-artifacts'
        retry(3) { timeout(time: 5, unit: 'MINUTES') { sh './deploy.sh dist/' } }
    }
    post { failure { sh './rollback.sh' } }
}
```

## Examples

### Example 1: Monorepo — build only what changed

**Request:** "Our monorepo has api, web and worker services plus a shared library. Build only the services whose files changed, and all of them when libs/shared changes."

```groovy
pipeline {
    agent any
    stages {
        stage('Services') {
            parallel {
                stage('api') {
                    when { anyOf { changeset 'services/api/**'; changeset 'libs/shared/**' } }
                    steps { sh 'make -C services/api build test' }
                }
                stage('web') {
                    when { anyOf { changeset 'services/web/**'; changeset 'libs/shared/**' } }
                    steps { sh 'make -C services/web build test' }
                }
                // 'worker' follows the same pattern
            }
        }
    }
}
```

**Result:** a commit touching only `services/api/` runs `api`; the console shows `Stage "web" skipped due to when conditional`. The first build of a job or branch has an empty changelog (`Warning, empty changelog. Probably because this is the first build.`), so every `changeset` stage is skipped — trigger a full build for new branches.

### Example 2: Validate a Jenkinsfile without running a build

**Request:** "Check my Jenkinsfile for syntax errors before I push."

```bash
# JENKINS_AUTH holds "username:api_token" (the token is created on your user's Security page)
curl -s -X POST --user "$JENKINS_AUTH" -F "jenkinsfile=<Jenkinsfile" \
  "$JENKINS_URL/pipeline-model-converter/validate"
```

**Result:** `Jenkinsfile successfully validated.`, or the errors with line and column:

```text
Errors encountered validating Jenkinsfile:
WorkflowScript: 21: Missing required parameter: "description" @ line 21, column 19.
           success { githubNotify(status: 'SUCCESS') }
                     ^
```

The linter checks Declarative structure and the required parameters of known steps. It does not flag unknown step names, and a Scripted Pipeline is rejected with "did not contain the 'pipeline' step".

## Guidelines

- Use Declarative syntax unless you need complex Groovy logic
- Always set `timeout` and `disableConcurrentBuilds` in options
- Clean workspaces with `cleanWs()` in a stage-level `post`; with `agent none` a pipeline-level `post` has no workspace
- Keep Jenkinsfiles in the repository, not configured in Jenkins UI
- Use shared libraries for common patterns — avoid copy-pasting; pin the library version. Anyone who can push to a trusted library's repository gets unlimited access to Jenkins, so protect that repository
- Use `withCredentials` — never hardcode secrets, and never put a secret in a double-quoted Groovy string: it is interpolated before the shell runs and leaks into process listings
- Prefer Docker or Kubernetes agents over permanent agents; a privileged `docker:dind` container can take over its Kubernetes node, so keep it off shared clusters
- Use `when` conditions to skip unnecessary stages on branches/PRs; add `beforeAgent true` or `beforeInput true` so skipped stages neither allocate an agent nor ask for approval
- Put `input` on a stage without a held agent (`agent none` at the top) so a pending approval does not block an executor
- Archive test reports with `junit` step for trend tracking
- Set up Jenkins Configuration as Code (JCasC) — no manual UI configuration
- Controllers and agents need Java 21 or 25 since LTS 2.555.1; upgrade the JVM before upgrading from an older LTS. Blue Ocean is deprecated — do not build new workflows around it
