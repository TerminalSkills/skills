---
title: "Set Up Canary Deployments with Automated Rollback Using AI"
slug: set-up-canary-deployments-with-automated-rollback
description: "Configure canary deployment pipelines that gradually roll out changes and automatically roll back on error spikes."
skills: [cicd-pipeline, coding-agent]
category: devops
tags: [canary-deployment, rollback, ci-cd, reliability]
---

# Set Up Canary Deployments with Automated Rollback Using AI

## The Problem

Tomas runs DevOps at a 20-person fintech startup. They deploy straight to production with a basic blue-green setup, and about every other week a deploy causes a spike in 5xx errors. It takes 15-30 minutes for someone to notice, then another 10 minutes to roll back manually. During the last incident, a bad deploy ran for 25 minutes before anyone realized the error rate had tripled -- 40% of active users hit payment processing errors. For a fintech app that handles payments, 25 minutes of elevated errors means failed transactions, confused customers, and support tickets that take days to resolve.

The team knows they need gradual rollouts with automatic rollback. But between researching service mesh traffic splitting, configuring health checks with the right Prometheus queries, writing rollback triggers that do not false-alarm on normal traffic noise, and wiring it all into the CI pipeline, nobody has the bandwidth to set it up from scratch. The irony is that every bad deploy makes the team more cautious, which slows down releases, which means bigger batches of changes per deploy, which makes each deploy riskier.

## The Solution

Use [Argo Rollouts](https://argo-rollouts.readthedocs.io/): a Kubernetes controller whose `Rollout` resource replaces the `Deployment`, shifts traffic in steps, and runs Prometheus queries (an `AnalysisTemplate`) in the background. A failed analysis aborts the rollout and sends traffic back to the stable version without anyone being paged. Exact percentages such as 5% need a traffic router; this page uses the Kubernetes Gateway API plugin, which works with any Gateway API implementation. Without a router the controller only approximates the weight by pod counts (5% of 10 pods is rounded to 1 pod, i.e. 10%). The [coding-agent](/skills/coding-agent) skill drafts the manifests and the [cicd-pipeline](/skills/cicd-pipeline) skill wires the release job into GitLab CI.

## Step-by-Step Walkthrough

### Step 1: Describe the strategy to the coding agent

```text
Set up canary deployments for our Node.js API on Kubernetes with Argo Rollouts and the Gateway API plugin. Traffic: 5% for 5 minutes, 25% for 10 minutes, then 100%. Abort automatically if the canary's 5xx rate exceeds 1% or its p99 latency exceeds 500 ms. Metrics come from Prometheus. Generate the Rollout, the two Services, the HTTPRoute, the AnalysisTemplate and a GitLab CI release job.
```

Check what comes back against the documentation: agents routinely invent fields. The sections below are the verified shape.

### Step 2: Install the controller and the traffic plugin

Pin versions, and check the CLI binary against the checksum file published with the release.

```bash
kubectl create namespace argo-rollouts
kubectl apply -n argo-rollouts -f https://github.com/argoproj/argo-rollouts/releases/download/v1.10.1/install.yaml

curl -sLO https://github.com/argoproj/argo-rollouts/releases/download/v1.10.1/kubectl-argo-rollouts-linux-amd64
curl -sLO https://github.com/argoproj/argo-rollouts/releases/download/v1.10.1/argo-rollouts-checksums.txt
sha256sum --ignore-missing -c argo-rollouts-checksums.txt
sudo install kubectl-argo-rollouts-linux-amd64 /usr/local/bin/kubectl-argo-rollouts
```

Register the Gateway API plugin (the ConfigMap must have exactly this name and namespace), give the controller permission to edit routes, and restart it:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: argo-rollouts-config
  namespace: argo-rollouts
data:
  trafficRouterPlugins: |-
    - name: "argoproj-labs/gatewayAPI"
      location: "https://github.com/argoproj-labs/rollouts-plugin-trafficrouter-gatewayapi/releases/download/v0.17.0/gatewayapi-plugin-linux-amd64"
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: argo-rollouts-gateway-api-plugin
rules:
  - apiGroups: [""]
    resources: ["services"]
    verbs: ["get"]
  - apiGroups: ["gateway.networking.k8s.io"]
    resources: ["httproutes"]
    verbs: ["get", "list", "update", "patch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: argo-rollouts-gateway-api-plugin
roleRef: { apiGroup: rbac.authorization.k8s.io, kind: ClusterRole, name: argo-rollouts-gateway-api-plugin }
subjects:
  - { kind: ServiceAccount, name: argo-rollouts, namespace: argo-rollouts }
```

```bash
kubectl rollout restart deployment -n argo-rollouts argo-rollouts
kubectl logs -n argo-rollouts deploy/argo-rollouts | grep -i plugin   # expect "Download complete"
```

### Step 3: Health queries as an AnalysisTemplate

Both queries are limited to the canary pods through the pod-template hash, which the Rollout passes in. Without that filter the stable version's good numbers dilute a bad canary. Argo Rollouts labels every pod with `rollouts-pod-template-hash`, but Prometheus only attaches it to your series if the scrape job copies it. With `kubernetes_sd_configs` (role `pod`) add this relabeling; Prometheus exposes pod labels as `__meta_kubernetes_pod_label_<name>` with invalid characters turned into `_` ([relabeling docs](https://prometheus.io/docs/prometheus/latest/configuration/configuration/#kubernetes_sd_config)):

```yaml
relabel_configs:
  - source_labels: [__meta_kubernetes_pod_label_rollouts_pod_template_hash]
    target_label: rollouts_pod_template_hash
```

(With the Prometheus Operator, list `rollouts-pod-template-hash` under `podTargetLabels` in the PodMonitor or ServiceMonitor instead.) Your app must export `http_requests_total{status}` and `http_request_duration_seconds_bucket`.

`failureLimit: 1` means the analysis fails on the second failed measurement, so one noisy sample does not abort a release. Failures are counted in total, not only consecutively.

```yaml
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: canary-health
spec:
  args:
    - name: canary-hash
      valueFrom:
        podTemplateHashValue: Latest
  metrics:
    - name: error-rate
      interval: 60s
      failureLimit: 1
      successCondition: len(result) > 0 && result[0] < 0.01
      provider:
        prometheus:
          address: http://prometheus.monitoring.svc:9090
          query: |
            sum(rate(http_requests_total{app="api",rollouts_pod_template_hash="{{args.canary-hash}}",status=~"5.."}[2m]))
            /
            sum(rate(http_requests_total{app="api",rollouts_pod_template_hash="{{args.canary-hash}}"}[2m]))
    - name: p99-latency
      interval: 60s
      failureLimit: 1
      successCondition: len(result) > 0 && result[0] < 0.5
      provider:
        prometheus:
          address: http://prometheus.monitoring.svc:9090
          query: |
            histogram_quantile(0.99,
              sum by (le) (rate(http_request_duration_seconds_bucket{app="api",rollouts_pod_template_hash="{{args.canary-hash}}"}[2m])))
```

The `len(result) > 0` guard makes an empty result (no canary traffic, or a label mismatch) count as a failed measurement instead of a pass, as described in the [analysis docs](https://argo-rollouts.readthedocs.io/en/stable/features/analysis/).

### Step 4: The Rollout

Replace the `Deployment` with this `Rollout`. The two Services select the same pods; the controller adds the hash selector to each. The HTTPRoute lists both as backends and the plugin edits their weights.

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: api
spec:
  replicas: 10
  revisionHistoryLimit: 2
  selector:
    matchLabels: { app: api }
  strategy:
    canary:
      stableService: api-stable
      canaryService: api-canary
      trafficRouting:
        plugins:
          argoproj-labs/gatewayAPI:
            httpRoute: api-route
      analysis:
        templates:
          - templateName: canary-health
      steps:
        - setWeight: 5
        - pause: { duration: 5m }
        - setWeight: 25
        - pause: { duration: 10m }
        # after the last step the controller promotes to 100%
  template:
    metadata:
      labels: { app: api }
    spec:
      containers:
        - name: api
          image: registry.example.com/api:2.4.0
          ports: [{ name: http, containerPort: 3000 }]
          resources:   # same as the old Deployment: latency numbers are only valid with identical limits
            requests: { cpu: 250m, memory: 256Mi }
            limits: { memory: 512Mi }
---
apiVersion: v1
kind: Service
metadata: { name: api-stable }
spec:
  selector: { app: api }
  ports: [{ port: 80, targetPort: http, name: http }]
---
apiVersion: v1
kind: Service
metadata: { name: api-canary }
spec:
  selector: { app: api }
  ports: [{ port: 80, targetPort: http, name: http }]
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata: { name: api-route }
spec:
  parentRefs: [{ name: public-gateway }]
  rules:
    - backendRefs:
        - { name: api-stable, kind: Service, port: 80 }
        - { name: api-canary, kind: Service, port: 80 }
```

Because `analysis` sits directly under `canary`, it starts with the first step and runs in the background until the rollout ends or fails. To skip the first minutes of warm-up, add `startingStep: 1`.

### Step 5: Release from CI

The pipeline only changes the image and waits for the controller's verdict. `status` exits non-zero when the rollout is aborted, so a rolled-back release fails the job.

```yaml
# .gitlab-ci.yml
deploy:
  stage: deploy
  image: { name: registry.example.com/ci/kubectl-argo-rollouts:1.10.1, entrypoint: [""] }  # image you build with kubectl and the plugin
  environment: production
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
  script:
    - kubectl argo rollouts set image api api=$CI_REGISTRY_IMAGE:$CI_COMMIT_SHA
    - kubectl argo rollouts status api --timeout 30m
```

### Step 6: Dry run, notifications, history

First dry run: deploy the stable image again with a changed environment variable (so the template hash changes) and watch it:

```bash
kubectl argo rollouts get rollout api --watch
```

Confirm in the output that an `AnalysisRun` appears and its measurements are numbers, not errors. Then provoke a failure on purpose, for instance a canary image that returns 500 on every request, and check the rollout turns `Degraded` and weight returns to 0. Run `kubectl argo rollouts abort api` for a manual stop. A dry run like this is where label mismatches show up, such as a scrape config without the hash label.

For Slack, configure the Argo Rollouts notification engine and subscribe the Rollout with annotations such as `notifications.argoproj.io/subscribe.on-rollout-aborted.slack: deploys`. The built-in triggers include `on-rollout-aborted`, `on-rollout-completed`, `on-rollout-paused` and `on-rollout-step-completed`. To review past failures, run `kubectl get analysisrun` (failed runs keep the measured values in `status`) or chart `rollout_info` and the controller metrics in Grafana.

## Real-World Example

On the first real release, the new version's p99 latency at the 5% step is 720 ms against the 500 ms limit. Two measurements later the analysis fails, the rollout aborts and the canary receives no traffic. Instead of the last incident, where 40% of active users hit payment errors for 25 minutes, a small share of requests was slow for a few minutes. Tomas finds a missing database index from the `AnalysisRun` details, the developer fixes it, and the next release passes both steps. The numbers here are the example team's own; your thresholds should come from your service's normal p99 and error rate.

## Related Skills

- [cicd-pipeline](/skills/cicd-pipeline) - the GitLab CI release job
- [coding-agent](/skills/coding-agent) - drafts the manifests; review them against the docs
