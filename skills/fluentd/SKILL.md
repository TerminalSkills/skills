---
name: fluentd
description: >-
  Configure Fluentd for unified log collection, routing, filtering, and
  forwarding across distributed systems. Use when a user needs to aggregate
  logs from multiple sources, transform log data with filters, route logs
  to different destinations, or set up Fluentd as a Kubernetes log collector.
license: Apache-2.0
compatibility: "Fluentd 1.20 (Ruby 3.4 in the official image); Docker or fluent-package 6; Kubernetes 1.28+ for the DaemonSet"
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/fluent/fluentd
  category: devops
  tags: ["fluentd", "logging", "log-routing", "kubernetes", "observability"]
---

# Fluentd

## Overview

Set up Fluentd as a unified logging layer to collect, filter, transform, and forward logs from applications, containers, and infrastructure to various backends. Covers configuration, plugins, Kubernetes DaemonSet deployment, and buffering strategies.

Current release: Fluentd 1.20.0 (2026-10-23). It is distributed as the `fluent/fluentd` Docker image (`v1.20-debian-1`; the image holds only core plugins), as the `fluent-package` OS packages (installs to `/opt/fluent`, plugins added with `fluent-gem install`), and as `fluent/fluentd-kubernetes-daemonset` images with Elasticsearch, S3, Kafka and other outputs preinstalled. Check a config before deploying it: `fluentd --dry-run -c fluent.conf`.

## Instructions

### Task 0: Run it and add plugins

```dockerfile
FROM fluent/fluentd:v1.20-debian-1
USER root
RUN fluent-gem install fluent-plugin-elasticsearch fluent-plugin-s3 --no-document
USER fluent
```

```bash
docker build -t shopkeep/fluentd:1.20 .
docker run --rm -v "$PWD/fluent.conf:/fluentd/etc/fluent.conf:ro" shopkeep/fluentd:1.20 --dry-run -c /fluentd/etc/fluent.conf
```

### Task A: Basic Fluentd Configuration

```xml
# fluent.conf — Collect application logs and forward to Elasticsearch
<source>
  @type tail
  path /var/log/app/*.log
  pos_file /var/log/fluentd/app.log.pos
  tag app.logs
  <parse>
    @type json
    time_key timestamp
    time_format %Y-%m-%dT%H:%M:%S.%NZ
  </parse>
</source>

<filter app.logs>
  @type grep
  <exclude>
    key level
    pattern /^debug$/
  </exclude>
</filter>

<match app.logs>
  @type elasticsearch
  host elasticsearch
  port 9200
  index_name fluentd-${tag}-%Y.%m.%d
  <buffer tag, time>
    @type file
    path /var/log/fluentd/buffer/es
    timekey 1h
    timekey_wait 10m
    flush_mode interval
    flush_interval 30s
    chunk_limit_size 8MB
    total_limit_size 2GB
    retry_max_interval 30
    overflow_action block
  </buffer>
</match>
```

`flush_interval` is ignored unless `flush_mode interval` is set: when the buffer has a `time` chunk key the default mode is `lazy` and chunks flush only after `timekey` plus `timekey_wait`. For nginx access logs use `<parse> @type nginx </parse>`. Add `read_from_head true` to a `tail` source when testing against an existing file; without it, only new lines are read.

### Task B: Multi-Output Routing

```xml
# fluent.conf — Route logs to different destinations based on tag
<match error.**>
  @type copy
  <store>
    @type elasticsearch
    host elasticsearch
    port 9200
    index_name errors-%Y.%m.%d
    <buffer tag, time>
      timekey 1d
      flush_mode interval
      flush_interval 10s
    </buffer>
  </store>
  <store>
    @type http
    endpoint http://alert-gateway.internal:8080/alerts
    <format>
      @type json
    </format>
    <buffer>
      flush_mode interval
      flush_interval 5s
    </buffer>
  </store>
</match>

<match audit.**>
  @type s3
  # credentials come from the instance/pod role or the standard AWS_* environment variables
  s3_bucket audit-logs-production
  s3_region us-east-1
  path logs/%Y/%m/%d/
  <buffer tag, time>
    @type file
    path /var/log/fluentd/buffer/s3
    timekey 3600
    timekey_wait 10m
  </buffer>
  <format>
    @type json
  </format>
</match>

```

The `http` store posts each record as JSON to your alert gateway (built in, checked against a local listener). The `fluent-plugin-slack` gem crashes on startup under the Ruby 3.4 used by current images (`undefined method 'unescape' for module URI`), so alerts go through `http` instead.

### Task C: Kubernetes DaemonSet Deployment

The `fluent/fluentd-kubernetes-daemonset` image already contains the Elasticsearch output, the Kubernetes metadata filter and the CRI parser. The metadata filter reads pod labels from the API server, so the DaemonSet needs RBAC.

```yaml
# fluentd-daemonset.yml — Fluentd DaemonSet for Kubernetes log collection
apiVersion: v1
kind: ServiceAccount
metadata:
  name: fluentd
  namespace: logging
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: fluentd
rules:
  - apiGroups: [""]
    resources: ["pods", "namespaces"]
    verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: fluentd
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: fluentd
subjects:
  - kind: ServiceAccount
    name: fluentd
    namespace: logging
---
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: fluentd
  namespace: logging
spec:
  selector:
    matchLabels:
      app: fluentd
  template:
    metadata:
      labels:
        app: fluentd
    spec:
      serviceAccountName: fluentd
      containers:
        - name: fluentd
          image: fluent/fluentd-kubernetes-daemonset:v1.20-debian-elasticsearch8-1
          env:
            - name: FLUENT_ELASTICSEARCH_HOST
              value: "elasticsearch.logging.svc.cluster.local"
            - name: FLUENT_ELASTICSEARCH_PORT
              value: "9200"
          resources:
            limits: {memory: 512Mi}
          volumeMounts:
            - name: varlog
              mountPath: /var/log
            - name: config
              mountPath: /fluentd/etc/fluent.conf
              subPath: fluent.conf
      volumes:
        - name: varlog
          hostPath:
            path: /var/log
        - name: config
          configMap:
            name: fluentd-config
```

Container logs live under `/var/log/containers` (symlinks into `/var/log/pods`), so mounting `/var/log` is enough on containerd and CRI-O nodes. Only nodes still using the Docker engine also need `/var/lib/docker/containers`. The two env vars are read by the ConfigMap below, not by the image, because the mounted file replaces the image's default config.

```yaml
# fluentd-configmap.yml — Kubernetes-aware Fluentd configuration
apiVersion: v1
kind: ConfigMap
metadata:
  name: fluentd-config
  namespace: logging
data:
  fluent.conf: |
    <source>
      @type tail
      path /var/log/containers/*.log
      exclude_path ["/var/log/containers/fluentd-*.log"]
      pos_file /var/log/fluentd-containers.log.pos
      tag kubernetes.*
      <parse>
        @type cri
      </parse>
    </source>

    <filter kubernetes.**>
      @type kubernetes_metadata
      @id filter_kube_metadata
    </filter>

    <filter kubernetes.**>
      @type grep
      <exclude>
        key $.kubernetes.namespace_name
        pattern /^(kube-system|logging)$/
      </exclude>
    </filter>

    <match kubernetes.**>
      @type elasticsearch
      host "#{ENV['FLUENT_ELASTICSEARCH_HOST']}"
      port "#{ENV['FLUENT_ELASTICSEARCH_PORT']}"
      index_name k8s-${$.kubernetes.namespace_name}-%Y.%m.%d
      <buffer tag, time, $.kubernetes.namespace_name>
        @type file
        path /var/log/fluentd/buffer
        timekey 1h
        flush_mode interval
        flush_interval 30s
      </buffer>
    </match>
```

The `index_name` placeholder only works when the same field is a buffer chunk key, as above (the Elasticsearch output config was accepted by `fluentd --dry-run`). In the cluster, check with `kubectl -n logging logs daemonset/fluentd` and look for `k8s-*` indices.

### Task D: Log Parsing and Transformation

```xml
# fluent.conf — Parse multiline Java stack traces
<source>
  @type tail
  path /var/log/app/java-app.log
  tag java.app
  <parse>
    @type multiline
    format_firstline /^\d{4}-\d{2}-\d{2}/
    format1 /^(?<time>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}) (?<level>\w+) \[(?<thread>[^\]]+)\] (?<class>[^ ]+) - (?<message>.*)/
    time_format %Y-%m-%d %H:%M:%S.%L
  </parse>
</source>
```

A message plus its stack-trace lines arrives as one event with the trace inside `message`. The `multiline` parser works on `tail` sources.

## Examples

### Example 1: "Ship my app's JSON logs to Elasticsearch, dropping debug lines"

Use Task A: a `tail` source with the `json` parser, a `grep` filter excluding `level` matching `debug`, and an `elasticsearch` match with a file buffer. Run `fluentd --dry-run -c fluent.conf` first; after starting, `curl -s localhost:9200/_cat/indices/fluentd-*` lists one index per tag and day.

### Example 2: "Collect every pod's logs in the cluster"

Apply the RBAC, ConfigMap and DaemonSet from Task C, then `kubectl -n logging rollout status daemonset/fluentd`. Logs appear in indices named `k8s-<namespace>-YYYY.MM.DD`, each record carrying `kubernetes.pod_name` and the pod labels.

## Guidelines

- Use file-based buffers in production to prevent log loss during restarts
- Set `overflow_action block` to apply backpressure instead of dropping logs
- In Kubernetes, consider Fluent Bit as the per-node forwarder and Fluentd as an aggregator (Fluent Bit `forward` output to Fluentd `forward` input)
- Fluentd 1.20 enables Ruby JIT by default (more memory per worker); `enable_jit false` in `<system>` turns it off
