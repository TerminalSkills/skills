---
title: "Centralize Logs with the ELK Stack for a Distributed System"
slug: centralize-logs-with-elk-stack
description: "Build centralized logging with Elasticsearch, Logstash, and Kibana, using Fluentd as the collection layer, for a distributed microservices system."
skills: [elasticsearch-search, logstash, kibana, fluentd]
category: devops
tags: [logging, elk, elasticsearch, logstash, kibana, fluentd, centralized-logging]
---

# Centralize Logs with the ELK Stack for a Distributed System

## The Problem

Tom manages 30 microservices spread across a Kubernetes cluster. When something breaks, developers SSH into individual pods and grep through container logs to find the error. A single user request touches five or six services, and correlating logs across them means opening multiple terminal windows and manually matching timestamps. Last week a checkout failure took three hours to debug because the root cause was a malformed message in the notification service — the last place anyone looked.

Tom needs every log in one place, searchable by service name, request ID, timestamp, or error message. He needs dashboards that show error trends and the ability to trace a single request across all services through correlated log entries.

## The Solution

Run Elasticsearch and Kibana with the Elastic Cloud on Kubernetes (ECK) operator, Fluentd as a DaemonSet on every node to collect container logs, and Logstash to parse and enrich them before indexing into a data stream.

```bash
npx terminal-skills install elasticsearch-search logstash kibana fluentd
```

## Step-by-Step Walkthrough

### 1. Deploy Elasticsearch and Kibana with ECK

A hand-written StatefulSet with security enabled needs transport TLS certificates for a multi-node cluster. The ECK operator generates certificates, the `elastic` user password and the node configuration. Tom installs it, then declares a three-node starter cluster. Storage must cover daily volume x retention x (1 + replicas): 100Gi per node here holds about 5 GB of logs per day over the 30-day retention below, so raise it for more.

```bash
kubectl create -f https://download.elastic.co/downloads/eck/3.5.0/crds.yaml
kubectl apply -f https://download.elastic.co/downloads/eck/3.5.0/operator.yaml
kubectl create namespace logging
```

```yaml
# elastic.yml
apiVersion: elasticsearch.k8s.elastic.co/v1
kind: Elasticsearch
metadata:
  name: logs
  namespace: logging
spec:
  version: 9.5.5
  nodeSets:
    - name: default
      count: 3
      volumeClaimTemplates:
        - metadata:
            name: elasticsearch-data
          spec:
            accessModes: ["ReadWriteOnce"]
            resources:
              requests:
                storage: 100Gi
      podTemplate:
        spec:
          containers:
            - name: elasticsearch
              resources:
                requests: { memory: 4Gi, cpu: "1" }
                limits: { memory: 4Gi }
---
apiVersion: kibana.k8s.elastic.co/v1
kind: Kibana
metadata:
  name: logs
  namespace: logging
spec:
  version: 9.5.5
  count: 1
  elasticsearchRef:
    name: logs
```

ECK serves Elasticsearch over HTTPS at `https://logs-es-http.logging.svc:9200`. The `elastic` password lives in the `logs-es-elastic-user` secret and the CA certificate in `logs-es-http-certs-public`. Tom copies both into secrets Logstash can mount:

```bash
kubectl -n logging create secret generic logstash-es \
  --from-literal=ES_PASSWORD="$(kubectl -n logging get secret logs-es-elastic-user -o jsonpath='{.data.elastic}' | base64 -d)" \
  --from-literal=ca.crt="$(kubectl -n logging get secret logs-es-http-certs-public -o jsonpath='{.data.ca\.crt}' | base64 -d)"
```

Next, a lifecycle policy and an index template. Logs go to a **data stream** named `logs-k8s-prod`. Do not write to plain indices named `logs-<service>-<date>`: Elasticsearch ships a built-in template for `logs-*-*` that expects data streams, so those writes are rejected or land in the wrong place.

```bash
kubectl -n logging port-forward svc/logs-es-http 9200:9200 &   # stop it later with: kill %1
PW=$(kubectl -n logging get secret logs-es-elastic-user -o jsonpath='{.data.elastic}' | base64 -d)
kubectl -n logging get secret logs-es-http-certs-public -o jsonpath='{.data.ca\.crt}' | base64 -d > ca.crt

curl -s --resolve logs-es-http.logging.svc:9200:127.0.0.1 --cacert ca.crt -u "elastic:$PW" -X PUT "https://logs-es-http.logging.svc:9200/_ilm/policy/logs-k8s-policy" \
  -H "Content-Type: application/json" -d '{
    "policy": { "phases": {
      "hot":    { "actions": { "rollover": { "max_age": "1d", "max_primary_shard_size": "50gb" } } },
      "warm":   { "min_age": "7d", "actions": { "forcemerge": { "max_num_segments": 1 } } },
      "delete": { "min_age": "30d", "actions": { "delete": {} } }
    } }
  }'

curl -s --resolve logs-es-http.logging.svc:9200:127.0.0.1 --cacert ca.crt -u "elastic:$PW" -X PUT "https://logs-es-http.logging.svc:9200/_index_template/logs-k8s" \
  -H "Content-Type: application/json" -d '{
    "index_patterns": ["logs-k8s-*"],
    "data_stream": {},
    "priority": 500,
    "template": { "settings": { "index.lifecycle.name": "logs-k8s-policy" } }
  }'
```

The policy rolls over daily, compacts after 7 days, and deletes after 30.

### 2. Deploy Fluentd as a Log Collector

The official `fluent/fluentd-kubernetes-daemonset` image already contains the CRI parser and the Kubernetes metadata filter. Fluentd tails the container log files, adds pod, namespace and label metadata, drops system namespaces, and sends batches to Logstash over HTTP (`out_http` is built into Fluentd 1.7+).

```yaml
apiVersion: v1
kind: ServiceAccount
metadata: { name: fluentd, namespace: logging }
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata: { name: fluentd }
rules:
  - apiGroups: [""]
    resources: ["pods", "namespaces"]
    verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata: { name: fluentd }
roleRef: { apiGroup: rbac.authorization.k8s.io, kind: ClusterRole, name: fluentd }
subjects: [{ kind: ServiceAccount, name: fluentd, namespace: logging }]
---
apiVersion: v1
kind: ConfigMap
metadata: { name: fluentd-config, namespace: logging }
data:
  fluent.conf: |
    <source>
      @type tail
      path /var/log/containers/*.log
      pos_file /var/log/fluentd-containers.log.pos
      tag kubernetes.*
      <parse>
        @type cri
      </parse>
    </source>

    <filter kubernetes.**>
      @type kubernetes_metadata
    </filter>

    <filter kubernetes.**>
      @type grep
      <exclude>
        key $.kubernetes.namespace_name
        pattern /^(kube-system|logging)$/
      </exclude>
    </filter>

    <match kubernetes.**>
      @type http
      endpoint http://logstash.logging.svc.cluster.local:8080/
      json_array true
      <format>
        @type json
      </format>
      <buffer>
        @type file
        path /var/log/fluentd/buffer
        flush_interval 10s
        chunk_limit_size 8MB
        retry_max_interval 30
      </buffer>
    </match>
---
apiVersion: apps/v1
kind: DaemonSet
metadata: { name: fluentd, namespace: logging }
spec:
  selector:
    matchLabels: { app: fluentd }
  template:
    metadata:
      labels: { app: fluentd }
    spec:
      serviceAccountName: fluentd
      containers:
        - name: fluentd
          image: fluent/fluentd-kubernetes-daemonset:v1.19-debian-forward-1
          volumeMounts:
            - { name: config, mountPath: /fluentd/etc/fluent.conf, subPath: fluent.conf }
            - { name: varlog, mountPath: /var/log }
      volumes:
        - name: config
          configMap: { name: fluentd-config }
        - name: varlog
          hostPath: { path: /var/log }
```

The CRI parser puts the log line in the `message` field. Kubernetes metadata (pod name, namespace, container, labels) is attached to every record, so Tom never has to guess which pod produced a line.

### 3. Configure Logstash for Log Parsing

Logstash listens for Fluentd's HTTP batches (the `http` input decodes `application/json` arrays into one event per entry), parses JSON or Spring-style text, and writes to the data stream. Some services emit structured JSON, others unstructured text that needs Grok.

```ruby
input {
  http {
    host => "0.0.0.0"       # inside the pod; the Service below is ClusterIP only
    port => 8080
  }
}

filter {
  if [kubernetes][labels][app] {
    mutate { add_field => { "service" => "%{[kubernetes][labels][app]}" } }
  }

  if [message] =~ /^\{/ {
    json { source => "message" target => "app" }
    if [app][level]      { mutate { add_field => { "level" => "%{[app][level]}" } } }
    if [app][request_id] { mutate { add_field => { "request_id" => "%{[app][request_id]}" } } }
  } else {
    grok {
      match => { "message" => "^%{TIMESTAMP_ISO8601:log_time} %{LOGLEVEL:level} \[%{DATA:thread}\] %{DATA:logger} - %{GREEDYDATA:log_message}" }
      tag_on_failure => ["_unstructured"]
    }
  }

  if [level] { mutate { lowercase => ["level"] } }

  date { match => ["time", "ISO8601"] }
}

output {
  elasticsearch {
    hosts => ["https://logs-es-http.logging.svc:9200"]
    user => "elastic"
    password => "${ES_PASSWORD}"
    ssl_enabled => true
    ssl_certificate_authorities => ["/etc/logstash/certs/ca.crt"]
    data_stream => true
    data_stream_type => "logs"
    data_stream_dataset => "k8s"
    data_stream_namespace => "prod"     # writes to logs-k8s-prod
  }
}
```

Run it as a Deployment using the `docker.elastic.co/logstash/logstash:9.5.5` image: mount the pipeline file in `/usr/share/logstash/pipeline/`, mount the `logstash-es` secret's `ca.crt` at `/etc/logstash/certs/`, expose `ES_PASSWORD` from the same secret as an environment variable, and put a ClusterIP Service named `logstash` on port 8080 in front of it.

The key field is `request_id`. Tom's services already pass a correlation ID through HTTP headers and log it, so in Kibana he can filter by `request_id: "abc-123"` and see every line from every service that handled that request.

### 4. Set Up Kibana Dashboards

Tom opens Kibana (`kubectl -n logging port-forward svc/logs-kb-http 5601:5601`, then `https://localhost:5601`, login `elastic`) and creates a data view for the stream. Via the API (Kibana has its own CA secret):

```bash
kubectl -n logging get secret logs-kb-http-certs-public -o jsonpath='{.data.ca\.crt}' | base64 -d > kb-ca.crt
curl -s --resolve logs-kb-http.logging.svc:5601:127.0.0.1 --cacert kb-ca.crt -u "elastic:$PW" \
  -X POST "https://logs-kb-http.logging.svc:5601/api/data_views/data_view" \
  -H "kbn-xsrf: true" -H "Content-Type: application/json" \
  -d '{ "data_view": { "title": "logs-k8s-*", "name": "All Service Logs", "timeFieldName": "@timestamp" } }'
```

The main operations dashboard has these panels:

- **Error count by service**: bar chart of which services have the most errors in the last hour
- **Log volume over time**: line chart split by service to spot spikes
- **Top error messages**: table of the most frequent messages (and, for services that log duration, a P95 line)

The team bookmarks common KQL queries:

```text
# All errors for one request
request_id: "req-abc-123" and level: "error"

# Checkout flow errors
service: ("api-gateway" or "order-service" or "payment-service") and level: "error"
```

### 5. Set Up Log-Based Alerts

In Kibana, go to Stack Management, then Rules, then Create rule, and choose **Elasticsearch query**. Use the `logs-k8s-*` data view, the KQL `level: "error"`, a 5-minute window, and the condition "count is above 100". Check every minute and attach a Slack connector (created under Connectors). Because rule definitions change between Kibana releases, build it in the UI and export it rather than hand-writing the API payload.

## The Result

The next time a checkout issue occurs, Tom's team opens Kibana, searches for the customer's request ID, and sees the full journey: the API gateway received the request, the order service processed it, but the payment service logged a connection timeout to the external provider. What used to take hours of log grepping becomes a few minutes of searching, error-spike alerts catch problems before customers report them, and the operations dashboard gives the team a live view of system health at peak traffic.

## Related Skills

- [elasticsearch-search](/skills/elasticsearch-search): index templates, data streams, and queries
- [logstash](/skills/logstash): pipeline inputs, filters, and outputs
- [kibana](/skills/kibana): data views, dashboards, and alerting rules
- [fluentd](/skills/fluentd): log collection and forwarding on every node
