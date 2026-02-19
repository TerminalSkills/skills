---
name: zabbix
description: >-
  Configure Zabbix for enterprise infrastructure monitoring with templates,
  triggers, discovery rules, and dashboards. Use when a user needs to set up
  Zabbix server, configure host monitoring, create custom templates, define
  trigger expressions, or automate host discovery and registration.
license: Apache-2.0
compatibility: "Zabbix 6.4+, Zabbix Agent 2"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: monitoring
  tags: ["zabbix", "enterprise-monitoring", "templates", "triggers", "discovery"]
---

# Zabbix

## Overview

Set up Zabbix for enterprise monitoring with host configuration, templates, triggers, low-level discovery, and API automation.

## Instructions

### Task A: Deploy Zabbix Server

```yaml
# docker-compose.yml — Zabbix with PostgreSQL and web frontend
services:
  zabbix-server:
    image: zabbix/zabbix-server-pgsql:6.4-ubuntu-latest
    environment:
      - DB_SERVER_HOST=postgres
      - POSTGRES_USER=zabbix
      - POSTGRES_PASSWORD=zabbix_password
      - POSTGRES_DB=zabbix
    ports:
      - "10051:10051"
    depends_on:
      - postgres

  zabbix-web:
    image: zabbix/zabbix-web-nginx-pgsql:6.4-ubuntu-latest
    environment:
      - DB_SERVER_HOST=postgres
      - POSTGRES_USER=zabbix
      - POSTGRES_PASSWORD=zabbix_password
      - ZBX_SERVER_HOST=zabbix-server
      - PHP_TZ=America/New_York
    ports:
      - "8080:8080"

  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=zabbix
      - POSTGRES_PASSWORD=zabbix_password
      - POSTGRES_DB=zabbix
    volumes:
      - pg_data:/var/lib/postgresql/data

volumes:
  pg_data:
```

### Task B: Configure Zabbix Agent 2

```ini
# /etc/zabbix/zabbix_agent2.conf — Agent 2 configuration
Server=192.168.1.5
ServerActive=192.168.1.5
Hostname=web-01.production
HostMetadata=linux:web:production:ubuntu
ListenPort=10050
Timeout=10
```

### Task C: Create Templates via API

```bash
# Authenticate and get token
AUTH_TOKEN=$(curl -s "http://localhost:8080/api_jsonrpc.php" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"user.login","params":{"username":"Admin","password":"zabbix"},"id":1}' | jq -r '.result')
```

```bash
# Create a custom template
curl -s "http://localhost:8080/api_jsonrpc.php" \
  -H "Content-Type: application/json" \
  -d "{
    \"jsonrpc\": \"2.0\",
    \"method\": \"template.create\",
    \"params\": {
      \"host\": \"Custom Web Application\",
      \"groups\": [{ \"groupid\": \"1\" }],
      \"description\": \"Monitors web app health, response times, and error rates\"
    },
    \"auth\": \"${AUTH_TOKEN}\",
    \"id\": 2
  }"
```

### Task D: Define Triggers

```bash
# Create trigger expressions
curl -s "http://localhost:8080/api_jsonrpc.php" \
  -H "Content-Type: application/json" \
  -d "{
    \"jsonrpc\": \"2.0\",
    \"method\": \"trigger.create\",
    \"params\": [
      {
        \"description\": \"High CPU usage on {HOST.NAME}\",
        \"expression\": \"avg(/Custom Web Application/system.cpu.util,5m)>85\",
        \"recovery_expression\": \"avg(/Custom Web Application/system.cpu.util,5m)<70\",
        \"priority\": 4,
        \"tags\": [{ \"tag\": \"scope\", \"value\": \"performance\" }]
      },
      {
        \"description\": \"Disk space critically low on {HOST.NAME}\",
        \"expression\": \"last(/Custom Web Application/vfs.fs.size[/,pfree])<10\",
        \"priority\": 5,
        \"tags\": [{ \"tag\": \"scope\", \"value\": \"capacity\" }]
      }
    ],
    \"auth\": \"${AUTH_TOKEN}\",
    \"id\": 3
  }"
```

### Task E: Low-Level Discovery

```bash
# Create a discovery rule for Docker containers
curl -s "http://localhost:8080/api_jsonrpc.php" \
  -H "Content-Type: application/json" \
  -d "{
    \"jsonrpc\": \"2.0\",
    \"method\": \"discoveryrule.create\",
    \"params\": {
      \"name\": \"Docker container discovery\",
      \"key_\": \"docker.containers.discovery[true]\",
      \"hostid\": \"TEMPLATE_ID\",
      \"type\": 0,
      \"delay\": \"5m\",
      \"lifetime\": \"7d\"
    },
    \"auth\": \"${AUTH_TOKEN}\",
    \"id\": 4
  }"
```

### Task F: Auto-Registration

```bash
# Configure auto-registration action
curl -s "http://localhost:8080/api_jsonrpc.php" \
  -H "Content-Type: application/json" \
  -d "{
    \"jsonrpc\": \"2.0\",
    \"method\": \"action.create\",
    \"params\": {
      \"name\": \"Auto-register Linux web servers\",
      \"eventsource\": 2,
      \"filter\": {
        \"evaltype\": 0,
        \"conditions\": [{ \"conditiontype\": 24, \"value\": \"linux:web:production\" }]
      },
      \"operations\": [
        { \"operationtype\": 2 },
        { \"operationtype\": 4, \"opgroup\": [{ \"groupid\": \"WEB_GROUP_ID\" }] },
        { \"operationtype\": 6, \"optemplate\": [{ \"templateid\": \"TEMPLATE_ID\" }] }
      ]
    },
    \"auth\": \"${AUTH_TOKEN}\",
    \"id\": 5
  }"
```

## Best Practices

- Use Zabbix Agent 2 (Go-based) for better plugin support
- Leverage templates for standardized monitoring across host groups
- Use `HostMetadata` for automatic registration and template linking
- Set recovery expressions on triggers to prevent flapping
- Use low-level discovery for dynamic infrastructure (containers, disks)
- Tag triggers for organized alerting and dashboard filtering
