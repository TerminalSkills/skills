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

### 1. Declarative Pipeline (Recommended)

```groovy
pipeline {
    agent {
        docker {
            image 'node:20-alpine'
            args '-v $HOME/.npm:/root/.npm'  // Cache npm
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
        stage('Install') {
            steps {
                sh 'npm ci'
            }
        }

        stage('Lint & Test') {
            parallel {
                stage('Lint') {
                    steps {
                        sh 'npm run lint'
                    }
                }
                stage('Unit Tests') {
                    steps {
                        sh 'npm test -- --coverage'
                    }
                    post {
                        always {
                            junit 'reports/junit.xml'
                            publishHTML([
                                reportDir: 'coverage/lcov-report',
                                reportFiles: 'index.html',
                                reportName: 'Coverage Report'
                            ])
                        }
                    }
                }
                stage('Security Scan') {
                    steps {
                        sh 'npm audit --audit-level=high'
                    }
                }
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

        stage('Deploy to Staging') {
            when {
                branch 'main'
            }
            steps {
                withCredentials([
                    file(credentialsId: 'kubeconfig-staging', variable: 'KUBECONFIG')
                ]) {
                    sh """
                        helm upgrade --install ${APP_NAME} ./charts/${APP_NAME} \
                            -n staging \
                            -f charts/${APP_NAME}/values-staging.yaml \
                            --set image.tag=${GIT_COMMIT.take(8)} \
                            --wait --timeout 5m
                    """
                }
            }
        }

        stage('Deploy to Production') {
            when {
                branch 'main'
            }
            input {
                message 'Deploy to production?'
                ok 'Deploy'
                submitter 'admin,platform-team'
            }
            steps {
                withCredentials([
                    file(credentialsId: 'kubeconfig-prod', variable: 'KUBECONFIG')
                ]) {
                    sh """
                        helm upgrade --install ${APP_NAME} ./charts/${APP_NAME} \
                            -n production \
                            -f charts/${APP_NAME}/values-prod.yaml \
                            --set image.tag=${GIT_COMMIT.take(8)} \
                            --wait --timeout 10m
                    """
                }
            }
        }
    }

    post {
        success {
            slackSend(
                channel: '#deployments',
                color: 'good',
                message: "✅ ${APP_NAME} deployed: ${env.BUILD_URL}"
            )
        }
        failure {
            slackSend(
                channel: '#deployments',
                color: 'danger',
                message: "❌ ${APP_NAME} failed: ${env.BUILD_URL}"
            )
        }
        always {
            cleanWs()
        }
    }
}
```

### 2. Multibranch Pipeline

Configure in Jenkins UI or via Job DSL:

```groovy
// Job DSL for automated setup
multibranchPipelineJob('api-server') {
    branchSources {
        github {
            id('api-server')
            repoOwner('company')
            repository('api-server')
            scanCredentialsId('github-token')
        }
    }
    orphanedItemStrategy {
        discardOldItems {
            numToKeep(10)
        }
    }
    triggers {
        periodicFolderTrigger {
            interval('5')  // Scan every 5 minutes
        }
    }
    factory {
        workflowBranchProjectFactory {
            scriptPath('Jenkinsfile')
        }
    }
}
```

**Branch-specific behavior in Jenkinsfile:**
```groovy
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
    when {
        changeRequest()
    }
    steps {
        // Post status back to GitHub
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

Reuse pipeline logic across projects:

```
vars/
├── buildDockerImage.groovy
├── deployToK8s.groovy
├── notifySlack.groovy
└── runTests.groovy
src/
└── com/company/pipeline/
    └── Config.groovy
resources/
└── templates/
    └── deployment.yaml
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
            if (env.BRANCH_NAME == 'main') {
                docker.image(image).push('latest')
            }
        }
    }
    return image
}
```

**Usage in Jenkinsfile:**
```groovy
@Library('company-pipeline-lib') _

pipeline {
    agent any
    stages {
        stage('Test') {
            steps { runTests(type: 'node') }
        }
        stage('Build') {
            steps {
                script {
                    def image = buildDockerImage(name: 'api-server')
                    deployToK8s(image: image, env: 'staging')
                }
            }
        }
    }
    post {
        always { notifySlack() }
    }
}
```

### 4. Kubernetes Agents (Dynamic)

Scale Jenkins with ephemeral Kubernetes pods:

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
      resources:
        requests:
          cpu: '500m'
          memory: '512Mi'
    - name: docker
      image: docker:24-dind
      securityContext:
        privileged: true
      env:
        - name: DOCKER_TLS_CERTDIR
          value: ""
    - name: helm
      image: alpine/helm:3.14
      command: ['sleep', '99d']
'''
            defaultContainer 'node'
        }
    }

    stages {
        stage('Build') {
            steps {
                sh 'npm ci && npm run build'
            }
        }
        stage('Docker Build') {
            steps {
                container('docker') {
                    sh 'docker build -t myapp:latest .'
                }
            }
        }
        stage('Deploy') {
            steps {
                container('helm') {
                    sh 'helm upgrade --install myapp ./charts/myapp'
                }
            }
        }
    }
}
```

### 5. Credentials Management

```groovy
// Username/password
withCredentials([
    usernamePassword(
        credentialsId: 'db-creds',
        usernameVariable: 'DB_USER',
        passwordVariable: 'DB_PASS'
    )
]) {
    sh 'psql -U $DB_USER -h db.example.com'
}

// Secret text
withCredentials([string(credentialsId: 'api-key', variable: 'API_KEY')]) {
    sh 'curl -H "Authorization: Bearer $API_KEY" https://api.example.com'
}

// SSH key
withCredentials([sshUserPrivateKey(
    credentialsId: 'deploy-key',
    keyFileVariable: 'SSH_KEY',
    usernameVariable: 'SSH_USER'
)]) {
    sh 'ssh -i $SSH_KEY $SSH_USER@server.example.com "deploy.sh"'
}

// File (kubeconfig, service account key)
withCredentials([file(credentialsId: 'kubeconfig', variable: 'KUBECONFIG')]) {
    sh 'kubectl get pods'
}
```

### 6. Pipeline Patterns

**Matrix builds (test across versions):**
```groovy
stage('Test Matrix') {
    matrix {
        axes {
            axis {
                name 'NODE_VERSION'
                values '18', '20', '22'
            }
            axis {
                name 'OS'
                values 'linux', 'windows'
            }
        }
        excludes {
            exclude {
                axis { name 'NODE_VERSION'; values '18' }
                axis { name 'OS'; values 'windows' }
            }
        }
        stages {
            stage('Test') {
                agent { docker { image "node:${NODE_VERSION}" } }
                steps { sh 'npm test' }
            }
        }
    }
}
```

**Retry and error handling:**
```groovy
stage('Deploy') {
    steps {
        retry(3) {
            timeout(time: 5, unit: 'MINUTES') {
                sh 'deploy.sh'
            }
        }
    }
    post {
        failure {
            sh 'rollback.sh'
        }
    }
}
```

**Stash/unstash artifacts between stages:**
```groovy
stage('Build') {
    steps {
        sh 'npm run build'
        stash includes: 'dist/**', name: 'build-artifacts'
    }
}
stage('Deploy') {
    agent { label 'deploy-node' }
    steps {
        unstash 'build-artifacts'
        sh 'deploy.sh dist/'
    }
}
```

### 7. Jenkins Configuration as Code (JCasC)

```yaml
# jenkins.yaml
jenkins:
  systemMessage: "Managed by Configuration as Code"
  numExecutors: 0  # Controller runs no builds
  securityRealm:
    local:
      allowsSignup: false
  authorizationStrategy:
    roleBased:
      roles:
        global:
          - name: admin
            permissions: ["Overall/Administer"]
            entries:
              - user: admin
          - name: developer
            permissions: ["Job/Build", "Job/Read", "Job/Cancel"]
            entries:
              - group: developers

  clouds:
    - kubernetes:
        name: k8s
        namespace: jenkins
        jenkinsUrl: http://jenkins:8080
        containerCapStr: "20"
        templates:
          - name: default
            label: default
            containers:
              - name: jnlp
                image: jenkins/inbound-agent:latest
                resourceRequestCpu: "250m"
                resourceRequestMemory: "256Mi"

unclassified:
  slackNotifier:
    teamDomain: company
    tokenCredentialId: slack-token
```

## Examples

### Example 1: Monorepo Pipeline

**Input:** "We have a monorepo with 4 services (api, web, worker, shared-lib). Build only the services that changed in the commit. Run shared-lib tests if any service depends on it. Deploy changed services independently."

**Output:** Jenkinsfile with:
- `changeset` detection using `git diff` to identify modified directories
- Parallel build stages for each changed service
- Dependency graph: if `shared-lib` changes, all dependent services rebuild
- Independent Helm deploys per service with separate image tags
- Shared library for common build/test/deploy steps

### Example 2: Jenkins on Kubernetes with Auto-Scaling

**Input:** "Set up Jenkins on our EKS cluster. The controller should run as a StatefulSet with persistent storage. Agents should be ephemeral Kubernetes pods that spin up per build and die after. Configure 3 pod templates: node (for JS builds), python (for ML builds), and docker (for image builds)."

**Output:**
- Helm chart deployment of Jenkins controller with PVC
- JCasC configuring Kubernetes cloud with 3 pod templates
- Each template with appropriate resource limits and tool containers
- Shared PVC for Maven/npm cache across builds
- RBAC ServiceAccount for Jenkins to create pods in the agents namespace

## Guidelines

- Use Declarative syntax unless you need complex Groovy logic — it is easier to read and maintain
- Always set `timeout` and `disableConcurrentBuilds` in options
- Use `cleanWs()` in post-always to prevent disk space issues
- Keep Jenkinsfiles in the repository (not configured in Jenkins UI)
- Use shared libraries for common patterns — avoid copy-pasting between projects
- Pin plugin versions — uncontrolled updates break pipelines
- Use `withCredentials` — never hardcode secrets or echo them in logs
- Prefer Docker or Kubernetes agents over permanent agents — cleaner, reproducible
- Add `timestamps()` option for debugging build timing
- Use `when` conditions to skip unnecessary stages on branches/PRs
- Archive test reports with `junit` step for trend tracking
- Set up Jenkins Configuration as Code (JCasC) — no manual UI configuration
- Back up Jenkins home directory (or use a Helm chart with PVC snapshots)
- Use Blue Ocean UI for better pipeline visualization
