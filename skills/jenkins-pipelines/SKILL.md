---
name: jenkins-pipelines
description: >-
  Builds and manages Jenkins CI/CD pipelines. Use when the user wants to
  write Jenkinsfiles, configure declarative or scripted pipelines, set up
  multibranch pipelines, manage Jenkins agents and nodes, configure shared
  libraries, integrate with Docker/Kubernetes/cloud providers, set up
  webhooks and triggers, manage credentials and secrets, or troubleshoot
  build failures. Trigger words: jenkins, jenkinsfile, jenkins pipeline,
  jenkins agent, jenkins node, jenkins shared library, jenkins docker,
  jenkins kubernetes, multibranch pipeline, jenkins credentials, jenkins
  webhook, jenkins groovy, jenkins blue ocean, jenkins job dsl.
license: Apache-2.0
compatibility: "Jenkins 2.400+ with Pipeline plugin. Java 11+ or 17+ for Jenkins controller."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: ["jenkins", "ci-cd", "pipelines", "automation"]
---

# Jenkins Pipelines

## Overview

Creates and manages Jenkins CI/CD pipelines using both Declarative and Scripted syntax. Covers Jenkinsfile authoring, multibranch pipelines, shared libraries, Docker and Kubernetes agents, credential management, parallel execution, artifact handling, notifications, and production-grade pipeline patterns.

## Instructions

### 1. Declarative Pipeline

```groovy
pipeline {
    agent {
        docker {
            image 'node:20-alpine'
            args '-v $HOME/.npm:/root/.npm'
        }
    }
    options {
        timeout(time: 30, unit: 'MINUTES')
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '20'))
        timestamps()
    }
    environment {
        APP_NAME = 'api-server'
        REGISTRY = 'registry.example.com'
        IMAGE = "${REGISTRY}/${APP_NAME}"
    }
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
        stage('Build Image') {
            steps {
                script {
                    def tag = env.GIT_COMMIT.take(8)
                    docker.build("${IMAGE}:${tag}")
                    docker.withRegistry("https://${REGISTRY}", 'registry-credentials') {
                        docker.image("${IMAGE}:${tag}").push()
                        docker.image("${IMAGE}:${tag}").push('latest')
                    }
                }
            }
        }
        stage('Deploy Staging') {
            when { branch 'main' }
            steps {
                withCredentials([file(credentialsId: 'kubeconfig-staging', variable: 'KUBECONFIG')]) {
                    sh "helm upgrade --install ${APP_NAME} ./charts/${APP_NAME} -n staging --set image.tag=${GIT_COMMIT.take(8)} --wait"
                }
            }
        }
        stage('Deploy Production') {
            when { branch 'main' }
            input { message 'Deploy to production?'; ok 'Deploy'; submitter 'admin,platform-team' }
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
        always { cleanWs() }
    }
}
```

### 2. Multibranch Pipeline

```groovy
// Branch-specific behavior
stage('Deploy') {
    when {
        anyOf {
            branch 'main'
            branch pattern: 'release/.*', comparator: 'REGEXP'
        }
    }
    steps { /* deploy */ }
}
stage('PR Checks') {
    when { changeRequest() }
    steps {
        githubNotify(status: 'PENDING', description: 'Running checks')
        sh 'npm test'
    }
    post {
        success { githubNotify(status: 'SUCCESS') }
        failure { githubNotify(status: 'FAILURE') }
    }
}
```

### 3. Shared Libraries

```
vars/
├── buildDockerImage.groovy
├── deployToK8s.groovy
└── notifySlack.groovy
```

**vars/buildDockerImage.groovy:**
```groovy
def call(Map config) {
    def tag = config.tag ?: env.GIT_COMMIT.take(8)
    def registry = config.registry ?: 'registry.example.com'
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

**Usage:**
```groovy
@Library('company-pipeline-lib') _
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
      image: node:20-alpine
      command: ['sleep', '99d']
    - name: docker
      image: docker:24-dind
      securityContext: { privileged: true }
    - name: helm
      image: alpine/helm:3.14
      command: ['sleep', '99d']
'''
            defaultContainer 'node'
        }
    }
    stages {
        stage('Build') { steps { sh 'npm ci && npm run build' } }
        stage('Docker') { steps { container('docker') { sh 'docker build -t myapp .' } } }
        stage('Deploy') { steps { container('helm') { sh 'helm upgrade --install myapp ./charts/myapp' } } }
    }
}
```

### 5. Credentials Management

```groovy
// Username/password
withCredentials([usernamePassword(credentialsId: 'db-creds', usernameVariable: 'DB_USER', passwordVariable: 'DB_PASS')]) {
    sh 'psql -U $DB_USER -h db.example.com'
}

// Secret text
withCredentials([string(credentialsId: 'api-key', variable: 'API_KEY')]) {
    sh 'curl -H "Authorization: Bearer $API_KEY" https://api.example.com'
}

// SSH key
withCredentials([sshUserPrivateKey(credentialsId: 'deploy-key', keyFileVariable: 'SSH_KEY', usernameVariable: 'SSH_USER')]) {
    sh 'ssh -i $SSH_KEY $SSH_USER@server.example.com "deploy.sh"'
}

// File (kubeconfig)
withCredentials([file(credentialsId: 'kubeconfig', variable: 'KUBECONFIG')]) {
    sh 'kubectl get pods'
}
```

### 6. Pipeline Patterns

**Retry and error handling:**
```groovy
stage('Deploy') {
    steps {
        retry(3) { timeout(time: 5, unit: 'MINUTES') { sh 'deploy.sh' } }
    }
    post { failure { sh 'rollback.sh' } }
}
```

**Stash/unstash artifacts:**
```groovy
stage('Build') {
    steps { sh 'npm run build'; stash includes: 'dist/**', name: 'build-artifacts' }
}
stage('Deploy') {
    agent { label 'deploy-node' }
    steps { unstash 'build-artifacts'; sh 'deploy.sh dist/' }
}
```

## Examples

### Example 1: Monorepo Pipeline

**Input:** "Monorepo with 4 services (api, web, worker, shared-lib). Build only changed services. If shared-lib changes, rebuild all dependents. Deploy changed services independently."

**Output:** Jenkinsfile with `git diff` changeset detection, parallel build stages per changed service, dependency graph for shared-lib, independent Helm deploys with separate image tags, and shared library for common steps.

### Example 2: Jenkins on Kubernetes with Auto-Scaling

**Input:** "Jenkins on EKS. Controller as StatefulSet with persistent storage. Ephemeral pod agents with 3 templates: node (JS), python (ML), docker (image builds)."

**Output:** Helm deployment of Jenkins controller with PVC, JCasC configuring Kubernetes cloud with 3 pod templates and resource limits, shared PVC for npm/Maven cache, RBAC ServiceAccount for pod creation.

## Guidelines

- Use Declarative syntax unless you need complex Groovy logic
- Always set `timeout` and `disableConcurrentBuilds` in options
- Use `cleanWs()` in post-always to prevent disk space issues
- Keep Jenkinsfiles in the repository, not configured in Jenkins UI
- Use shared libraries for common patterns — avoid copy-pasting
- Use `withCredentials` — never hardcode secrets
- Prefer Docker or Kubernetes agents over permanent agents
- Use `when` conditions to skip unnecessary stages on branches/PRs
- Archive test reports with `junit` step for trend tracking
- Set up Jenkins Configuration as Code (JCasC) — no manual UI configuration
