---
name: zabbix
description: >-
  Zabbix is an open-source platform for enterprise infrastructure monitoring,
  configured here with templates, triggers, discovery rules, and the JSON-RPC
  API. Use when a user needs to set up Zabbix server, configure host
  monitoring, create custom templates, define trigger expressions, or automate
  host discovery and registration.
license: Apache-2.0
compatibility: "Zabbix 7.0 LTS and 7.4 (server, frontend, Agent 2). Docker Compose for the server; curl and jq for the API calls."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  tags: ["zabbix", "enterprise-monitoring", "templates", "triggers", "discovery"]
  repository: https://github.com/zabbix/zabbix
---

# Zabbix

## Overview

Set up Zabbix for enterprise monitoring with host configuration, templates, trigger expressions, low-level discovery, and API automation. Covers server deployment, Agent 2 setup, and host auto-registration. The API calls below were run against Zabbix 7.0.31 and 7.4.15; 6.4 and 7.2 are past end of support.

## Instructions

### Task A: Deploy Zabbix Server

```yaml
# docker-compose.yml — Zabbix server with PostgreSQL and web frontend
services:
  zabbix-server:
    image: zabbix/zabbix-server-pgsql:7.0-ubuntu-latest
    environment:
      - DB_SERVER_HOST=postgres
      - POSTGRES_USER=zabbix
      - POSTGRES_PASSWORD=${ZABBIX_DB_PASSWORD:?set ZABBIX_DB_PASSWORD}
      - POSTGRES_DB=zabbix
      - ZBX_CACHESIZE=128M
      - ZBX_HISTORYCACHESIZE=64M
      - ZBX_TRENDCACHESIZE=32M
    ports:
      - "10051:10051"
    depends_on:
      - postgres

  zabbix-web:
    image: zabbix/zabbix-web-nginx-pgsql:7.0-ubuntu-latest
    environment:
      - DB_SERVER_HOST=postgres
      - POSTGRES_USER=zabbix
      - POSTGRES_PASSWORD=${ZABBIX_DB_PASSWORD:?set ZABBIX_DB_PASSWORD}
      - POSTGRES_DB=zabbix
      - ZBX_SERVER_HOST=zabbix-server
      - PHP_TZ=America/New_York
    ports:
      - "8080:8080"
    depends_on:
      - postgres
      - zabbix-server

  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=zabbix
      - POSTGRES_PASSWORD=${ZABBIX_DB_PASSWORD:?set ZABBIX_DB_PASSWORD}
      - POSTGRES_DB=zabbix
    volumes:
      - pg_data:/var/lib/postgresql/data
volumes:
  pg_data:
```

```bash
export ZABBIX_DB_PASSWORD="$(openssl rand -base64 24)"   # keep it in your secrets store
docker compose up -d
```

The server creates the database schema on first start; the frontend answers on port 8080 after about a minute. The initial login is `Admin` / `zabbix` — change it before the port is reachable from anywhere else. Use `7.4-ubuntu-latest` for the current standard release; server and frontend tags must match.

### Task B: Install and Configure Zabbix Agent 2

```bash
# Debian 13 and Ubuntu 26.04 ship Agent 2 7.0 in their own repositories
sudo apt-get update
sudo apt-get install -y zabbix-agent2
```

On older distributions, or to get the PostgreSQL, MongoDB and MSSQL plugin packages (`zabbix-agent2-plugin-postgresql` and so on), add the official repository with the commands that https://www.zabbix.com/download generates for your OS. Containers can use the `zabbix/zabbix-agent2:7.0-ubuntu-latest` image, configured through `ZBX_HOSTNAME`, `ZBX_SERVER_HOST` and `ZBX_METADATA`.

```ini
# /etc/zabbix/zabbix_agent2.conf — Agent 2 configuration
Server=192.168.1.5
ServerActive=192.168.1.5
Hostname=web-01.production
HostMetadata=linux:web:production:ubuntu
ListenPort=10050
Timeout=10
Plugins.SystemRun.LogRemoteCommands=1
```

```bash
# Named PostgreSQL session in its own file (root-owned, readable by the zabbix group); the password comes from the environment
sudo install -m 640 -o root -g zabbix /dev/null /etc/zabbix/zabbix_agent2.d/plugins.d/pg-appdb.conf
sudo tee /etc/zabbix/zabbix_agent2.d/plugins.d/pg-appdb.conf >/dev/null <<EOF
Plugins.PostgreSQL.Sessions.appdb.Uri=tcp://localhost:5432
Plugins.PostgreSQL.Sessions.appdb.User=zbx_monitor
Plugins.PostgreSQL.Sessions.appdb.Password=${ZBX_PG_MONITOR_PASSWORD}
EOF
sudo zabbix_agent2 -T                      # validate the configuration
sudo systemctl restart zabbix-agent2
zabbix_agent2 -t 'vfs.fs.size[/,pfree]'    # test one item key locally
```

### Task C: Create Custom Templates via API

```bash
export ZABBIX_URL="http://localhost:8080/api_jsonrpc.php"

# Session token from user.login. For automation, export an API token (Users → API tokens) instead.
export ZABBIX_TOKEN=$(curl -s "$ZABBIX_URL" \
  -H "Content-Type: application/json-rpc" \
  -d "$(jq -n --arg u "$ZABBIX_USER" --arg p "$ZABBIX_PASSWORD" \
        '{jsonrpc: "2.0", method: "user.login", params: {username: $u, password: $p}, id: 1}')" \
  | jq -r '.result')

# Helper for every call below: zbx <method> '<params as JSON>'
zbx() {
  curl -s "$ZABBIX_URL" \
    -H "Content-Type: application/json-rpc" \
    -H "Authorization: Bearer $ZABBIX_TOKEN" \
    -d "$(jq -n --arg m "$1" --argjson p "$2" '{jsonrpc: "2.0", method: $m, params: $p, id: 1}')"
}
```

```bash
# Create a custom template in an existing template group
TPL_GROUP_ID=$(zbx templategroup.get '{ "output": ["groupid"], "filter": { "name": ["Templates/Applications"] } }' \
  | jq -r '.result[0].groupid')
TEMPLATE_ID=$(zbx template.create '{
  "host": "Custom Web Application",
  "groups": [{ "groupid": "'"$TPL_GROUP_ID"'" }],
  "description": "Monitors web application health, response times, and error rates",
  "macros": [{ "macro": "{$APP.URL}", "value": "https://shop.corp.internal/healthz" }]
}' | jq -r '.result.templateids[0]')
```

```bash
# Create items (metrics) on the template; {$APP.URL} can be overridden per host
zbx item.create '[
  { "name": "HTTP response time", "key_": "web.page.perf[{$APP.URL}]", "hostid": "'"$TEMPLATE_ID"'",
    "type": 0, "value_type": 0, "delay": "60s", "units": "s" },
  {
    "name": "HTTP status code", "key_": "web.page.get[{$APP.URL}]", "hostid": "'"$TEMPLATE_ID"'",
    "type": 0, "value_type": 3, "delay": "60s",
    "preprocessing": [
      { "type": 5, "params": "HTTP/[0-9.]+ ([0-9]+)\n\\1", "error_handler": 0, "error_handler_params": "" }
    ]
  },
  { "name": "CPU utilization", "key_": "system.cpu.util", "hostid": "'"$TEMPLATE_ID"'",
    "type": 0, "value_type": 0, "delay": "60s", "units": "%" },
  { "name": "Free disk space on /", "key_": "vfs.fs.size[/,pfree]", "hostid": "'"$TEMPLATE_ID"'",
    "type": 0, "value_type": 0, "delay": "5m", "units": "%" }
]'
```

`type` 0 is a passive agent check (7 = active, 18 = dependent, 19 = HTTP agent); `value_type` 0 is float, 3 unsigned integer, 4 text. Preprocessing `type` is a number (5 = regular expression, 12 = JSONPath) and `error_handler` is mandatory.

### Task D: Define Triggers

```bash
# Trigger expressions reference items that already exist on the template
zbx trigger.create '[
  {
    "description": "High CPU usage on {HOST.NAME}",
    "expression": "avg(/Custom Web Application/system.cpu.util,5m)>85",
    "recovery_mode": 1,
    "recovery_expression": "avg(/Custom Web Application/system.cpu.util,5m)<70",
    "priority": 4,
    "manual_close": 1,
    "tags": [{ "tag": "scope", "value": "performance" }, { "tag": "service", "value": "web" }]
  },
  {
    "description": "Disk space critically low on {HOST.NAME}",
    "expression": "last(/Custom Web Application/vfs.fs.size[/,pfree])<10",
    "priority": 5,
    "tags": [{ "tag": "scope", "value": "capacity" }]
  },
  {
    "description": "HTTP response time too high on {HOST.NAME}",
    "expression": "avg(/Custom Web Application/web.page.perf[{$APP.URL}],5m)>3",
    "priority": 3,
    "tags": [{ "tag": "scope", "value": "availability" }]
  }
]'
```

### Task E: Low-Level Discovery

```bash
# Discovery rule for running Docker containers (Agent 2 Docker plugin)
RULE_ID=$(zbx discoveryrule.create '{
  "name": "Docker container discovery",
  "key_": "docker.containers.discovery[false]",
  "hostid": "'"$TEMPLATE_ID"'",
  "type": 0, "delay": "5m", "lifetime": "7d"
}' | jq -r '.result.itemids[0]')
# Master item prototype: one JSON document of statistics per discovered container
STATS_ID=$(zbx itemprototype.create '{
  "name": "Container {#NAME}: Get stats",
  "key_": "docker.container_stats[\"{#NAME}\"]",
  "hostid": "'"$TEMPLATE_ID"'",
  "ruleid": "'"$RULE_ID"'",
  "type": 0, "value_type": 4, "delay": "1m", "history": "0"
}' | jq -r '.result.itemids[0]')
# Dependent prototype: extract one number from the master item with JSONPath
zbx itemprototype.create '{
  "name": "Container {#NAME}: CPU percent usage",
  "key_": "docker.container_stats.cpu_pct_usage[\"{#NAME}\"]",
  "hostid": "'"$TEMPLATE_ID"'",
  "ruleid": "'"$RULE_ID"'",
  "type": 18, "master_itemid": "'"$STATS_ID"'",
  "value_type": 0, "units": "%",
  "preprocessing": [
    { "type": 12, "params": "$.cpu_stats.cpu_usage.percent_usage", "error_handler": 0, "error_handler_params": "" }
  ]
}'
```

### Task F: Auto-Registration

```bash
# Hosts whose HostMetadata contains the string are created, grouped and linked to the template
WEB_GROUP_ID=$(zbx hostgroup.create '{ "name": "Web servers" }' | jq -r '.result.groupids[0]')
zbx action.create '{
  "name": "Auto-register Linux web servers",
  "eventsource": 2,
  "filter": {
    "evaltype": 0,
    "conditions": [{ "conditiontype": 24, "operator": 2, "value": "linux:web:production" }]
  },
  "operations": [
    { "operationtype": 2 },
    { "operationtype": 4, "opgroup": [{ "groupid": "'"$WEB_GROUP_ID"'" }] },
    { "operationtype": 6, "optemplate": [{ "templateid": "'"$TEMPLATE_ID"'" }] }
  ]
}'
```

## Examples

### Example 1: New web servers register themselves

User request: "Every web server we provision should show up in Zabbix with our template, without anyone clicking through the UI."

Run Tasks C, D and F once, then start Agent 2 on the new machine with the Task B configuration (`ServerActive` pointing at the server, `HostMetadata=linux:web:production:ubuntu`). Within a minute:

```bash
zbx host.get '{ "output": ["host"], "filter": { "host": "web-01.production" },
  "selectHostGroups": ["name"], "selectParentTemplates": ["name"] }' | jq -c '.result'
```

```json
[{"hostid":"10684","host":"web-01.production","parentTemplates":[{"name":"Custom Web Application"}],"hostgroups":[{"name":"Discovered hosts"},{"name":"Web servers"}]}]
```

### Example 2: An item shows "Not supported"

User request: "The HTTP response time item is red in Zabbix — what is wrong with the key?"

Test the key on the monitored host; the agent prints the value or the reason:

```bash
zabbix_agent2 -t 'web.page.perf[https://www.zabbix.com,,,443]'
zabbix_agent2 -t 'web.page.perf[https://www.zabbix.com]'
```

```text
web.page.perf[https://www.zabbix.com,,,443]   [m|ZBX_NOTSUPPORTED] [Too many parameters.]
web.page.perf[https://www.zabbix.com]         [s|0.275790]
```

The key takes `host,path,port` — three parameters at most — and the host may be a full URL. Fix the key on the template with `item.update`.

## Guidelines

- Send the token in the `Authorization: Bearer` header. The `auth` property in the request body is deprecated in 7.0 and rejected by 7.4.
- Prefer API tokens with their own user and role over `user.login` with the Admin account; never leave the `Admin` / `zabbix` default login in place.
- An agent must not be newer than the server: a 7.4 agent does not work with a 7.0 server, while older agents keep working after a server upgrade. Proxies must match the server's major version.
- Use Zabbix Agent 2 (Go-based) over legacy Agent for better plugin support and performance
- Link the official templates first ("Linux by Zabbix agent", "Docker by Zabbix agent 2", "PostgreSQL by Zabbix agent 2") and write custom ones only for what they do not cover.
- The Docker plugin needs read access to `/var/run/docker.sock` — add the `zabbix` user to the `docker` group. `docker.container_info` returns JSON (`short` or `full`); per-container numbers come from `docker.container_stats` through dependent items.
- Use `HostMetadata` in agent config for automatic registration and template linking; treat it as untrusted input and add encryption (PSK or certificates) when agents register over the internet.
- A trigger with `recovery_expression` needs `recovery_mode: 1`; recovery thresholds prevent flapping between OK and PROBLEM states
- Put host-specific values in user macros such as `{$APP.URL}` so one template serves every host
- Tag triggers and hosts for organized alerting and dashboard filtering
