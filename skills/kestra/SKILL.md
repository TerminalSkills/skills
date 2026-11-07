---
name: kestra
description: >-
  Kestra is an open-source workflow orchestrator where pipelines are declarative YAML flows with tasks, schedules, webhooks, retries and a web UI. Use when asked to "orchestrate a data pipeline with Kestra", "write a Kestra flow", "schedule a job with cron in Kestra", "run a Python script on a schedule", "trigger a flow from a webhook", or "deploy flows with kestractl".
license: Apache-2.0
compatibility: "Docker 24+ (to run the server), a Kestra 2.x server; kestractl CLI for remote management"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: "kestra, orchestration, workflow, yaml, data-pipelines"
  repository: https://github.com/kestra-io/kestra
---
# Kestra — Declarative workflow orchestration in YAML

## Overview
Kestra runs workflows ("flows") described in YAML. A flow has an `id`, a `namespace` (a dot-separated group such as `company.team`) and a list of `tasks`; each task has a `type` that names a plugin class, for example `io.kestra.plugin.core.log.Log`. Flows can also declare `inputs`, `variables`, `triggers` (schedule, webhook, flow, polling), `retry` and `errors` handlers. The server provides a UI, a REST API and a CLI (`kestractl`), and runs scripts in Docker or local processes through task runners.

The flows below follow the Kestra 2.0 documentation and plugin pages. Run `kestractl flows validate` on a flow before deploying it.

## Instructions

### Run a local server
```bash
docker run --pull=always --rm -it -p 127.0.0.1:8080:8080 --user=root \
  --name kestra \
  -v kestra_data:/app/storage \
  -v kestra_db:/app/data \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /tmp:/tmp \
  kestra/kestra:latest-slim server local
```
Open `http://localhost:8080`. The `-slim` image ships without plugins and installs each plugin the first time a flow needs it (this is on by default for `server local`); use `kestra/kestra:latest` to have them bundled. The command uses an embedded H2 database, which is for trying things out; production needs a real database (the docs show Postgres) and a Docker Compose or Kubernetes install. Mounting the Docker socket and running as root gives the container control of the host's Docker; drop `-v /var/run/docker.sock...` and `--user=root` if no flow needs the Docker task runner, and never expose port 8080 beyond localhost without authentication.

### Write a flow
Required keys are `id`, `namespace` and `tasks`.
```yaml
id: nightly_orders_report
namespace: company.analytics

description: Fetch order totals and log them.

inputs:
  - id: region
    type: STRING
    defaults: "emea"

tasks:
  - id: fetch_totals
    type: io.kestra.plugin.core.http.Request
    uri: "https://api.shop-internal.net/orders/summary?region={{ inputs.region }}"
    method: GET

  - id: log_status
    type: io.kestra.plugin.core.log.Log
    message: "Fetched summary for {{ inputs.region }} in flow {{ flow.id }}"

triggers:
  - id: nightly
    type: io.kestra.plugin.core.trigger.Schedule
    cron: "0 2 * * *"
    timezone: Europe/Berlin
```
Values inside `{{ }}` are Pebble expressions: `inputs.<id>`, `vars.<name>`, `outputs.<taskId>.<property>`, `flow.id`, `flow.namespace`, `taskrun.startDate`, and `secret('NAME')` for secrets.

### Verified task and trigger types
These `type` strings appear in the official docs and plugin pages:

| Purpose | `type` |
|---|---|
| Log a message | `io.kestra.plugin.core.log.Log` |
| Emit values as outputs | `io.kestra.plugin.core.output.OutputValues` |
| Fail on purpose | `io.kestra.plugin.core.execution.Fail` |
| HTTP call | `io.kestra.plugin.core.http.Request` (`uri`, `method`, `options.auth`) |
| Run a Python script | `io.kestra.plugin.scripts.python.Script` (`script`, `dependencies`) |
| Run shell commands | `io.kestra.plugin.scripts.shell.Commands` (`commands`) |
| Group tasks sequentially | `io.kestra.plugin.core.flow.Sequential` |
| Cron trigger | `io.kestra.plugin.core.trigger.Schedule` (`cron`, `timezone`, `when`) |
| Webhook trigger | `io.kestra.plugin.core.trigger.Webhook` (`key`, `fetchType`) |
| Slack alert | `io.kestra.plugin.slack.notifications.SlackIncomingWebhook` (`url`, `messageText`) |
| Process task runner | `io.kestra.plugin.core.runner.Process` |
| Docker task runner | `io.kestra.plugin.scripts.runner.docker.Docker` |

Look up any other task on `https://kestra.io/plugins` before using it: type names are long and a wrong one only fails at validation or run time. The Kestra 2.0 migration guide lists breaking changes (among them `ForEach` replaced by `Loop` and a redesign of trigger conditions), so do not copy 1.x snippets from old blog posts without checking them.

### Python, shell and retries
```yaml
id: refresh_customer_scores
namespace: company.analytics

tasks:
  - id: score
    type: io.kestra.plugin.scripts.python.Script
    dependencies:
      - requests
      - kestra
    script: |
      from kestra import Kestra
      import requests
      status = requests.get("https://status.shop-internal.net/health", timeout=10).status_code
      Kestra.outputs({"status": status})
    retry:
      type: constant
      interval: PT30S
      maxAttempts: 3
    timeout: PT10M

errors:
  - id: alert_team
    type: io.kestra.plugin.slack.notifications.SlackIncomingWebhook
    url: "{{ secret('SLACK_WEBHOOK') }}"
    messageText: "Flow {{ flow.namespace }}.{{ flow.id }} failed, execution {{ execution.id }}"
```
`maxAttempts` counts the first run, so 3 means two retries. Durations are ISO 8601 (`PT30S`, `PT10M`); weeks, months and years are not supported. The Python task runs in a container image (documented default `python:3.13-slim`) and installs `dependencies` before the script. `Kestra.outputs({...})` makes values available to later tasks as `{{ outputs.score.vars.status }}`.

### Trigger a flow
From a webhook, with a key stored as a secret:
```yaml
triggers:
  - id: on_push
    type: io.kestra.plugin.core.trigger.Webhook
    key: "{{ secret('WEBHOOK_KEY') }}"
```
The URL is `/api/v1/main/executions/webhook/{namespace}/{flowId}/{key}` (here `main` is the default tenant). Request bodies appear as `trigger.body` (`fetchType: FETCH`, default); use `STORE` for large bodies or `NONE` to ignore them. Webhook URLs are served without authentication even when basic auth is on, so the `key` is the only credential: use a long random secret and put a reverse proxy in front for anything exposed.

Manually, over the REST API (the documented path for a flow in namespace `company.analytics`):
```bash
curl -X POST "http://localhost:8080/api/v1/main/executions/company.analytics/nightly_orders_report" \
  -u "$KESTRA_USER:$KESTRA_PASSWORD" \
  -F region=apac
```
Inputs go as form fields. Omit `-u` only if basic authentication is disabled on your server.

### Manage flows with kestractl
`kestractl` is a separate CLI (releases and install instructions: `https://github.com/kestra-io/kestractl`). The default release targets Kestra 2.0; a 1.x server needs the 1.x release.
```bash
kestractl config add default http://localhost:8080 main --username "$KESTRA_USER" --password "$KESTRA_PASSWORD" --default
kestractl flows validate flows/nightly_orders_report.yaml
kestractl flows deploy ./flows --namespace company.analytics --override --fail-fast
kestractl executions run company.analytics nightly_orders_report --wait --output json
kestractl flows list company.analytics --output json
```
Credentials are stored in `~/.kestractl/config.yaml`. Check `kestractl flows --help` for the exact `validate` options, since flags can differ between releases. Many groups (`users`, `roles`, `secrets`, `apps`, `tenants`) need Kestra Enterprise.

## Examples

### Example 1: Hourly health check with alert
**Request:** "Every hour call our status endpoint and message Slack if it fails."

Create `flows/health_check.yaml`:
```yaml
id: health_check
namespace: company.platform
tasks:
  - id: ping
    type: io.kestra.plugin.core.http.Request
    uri: "https://status.shop-internal.net/health"
    method: GET
    retry:
      type: constant
      interval: PT1M
      maxAttempts: 3
errors:
  - id: notify
    type: io.kestra.plugin.slack.notifications.SlackIncomingWebhook
    url: "{{ secret('SLACK_WEBHOOK') }}"
    messageText: "Health check failed: {{ execution.id }}"
triggers:
  - id: hourly
    type: io.kestra.plugin.core.trigger.Schedule
    cron: "@hourly"
```
Deploy with `kestractl flows deploy flows --namespace company.platform --override`. Result: the flow appears under its namespace, a new execution starts every hour, and a failed ping is retried twice before the `errors` task posts to Slack.

### Example 2: Move a cron script into Kestra
**Request:** "Replace our `refresh_scores.py` cron job with something we can see and retry."

Put the logic in a `python.Script` task (as in the retry example above), add a `Schedule` trigger with `cron: "30 3 * * *"`, and commit the YAML to the repo. Run `kestractl executions run company.analytics refresh_customer_scores --wait --output json` once to confirm it succeeds. Result: each run has logs, outputs and a retry history in the UI instead of a mail from cron.

### Example 3: Start a pipeline from a deploy hook
**Request:** "Run the data refresh whenever CI finishes a release."

Add the `Webhook` trigger shown above, store `WEBHOOK_KEY` as a Kestra secret, and have CI call the webhook URL with `curl -X POST`. Result: each CI call creates an execution whose payload is in `trigger.body`.

## Guidelines
- Keep flows in Git and deploy them with `kestractl flows deploy` (or the Git sync features) rather than editing in the UI, so changes are reviewed.
- Use `secret('NAME')` for webhook keys, passwords and tokens; never inline them in YAML.
- Always set `timeout` and `retry` on tasks that call external systems; remember `maxAttempts` includes the first attempt.
- Check every plugin `type` against `https://kestra.io/plugins`; do not guess class names.
- Pin an image tag (for example the version you tested) in production instead of `latest`, and plan migrations using the migration guide when upgrading across major versions.
- Task scripts run in containers or processes with access to whatever you mount; do not give flows the Docker socket on a shared host.
- Not the right tool for sub-second event processing or application-internal job queues; use a message queue or library such as BullMQ for that.
- Bind local test servers to 127.0.0.1 and stop and remove the container (`docker rm -fv kestra`) when done.
