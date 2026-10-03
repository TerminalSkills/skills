---
name: consul
description: >-
  HashiCorp Consul for service discovery, health checking, and service mesh.
  Use when the user needs to register services, perform health checks, store
  configuration in the KV store, or set up Connect for secure service-to-service
  communication.
license: Apache-2.0
compatibility: 'linux, macos, windows'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  repository: https://github.com/hashicorp/consul
  tags:
    - consul
    - service-discovery
    - service-mesh
    - hashicorp
    - infrastructure
---

# Consul

## Overview

Consul provides service discovery, health checking, KV storage, and service mesh capabilities. The current release line is 2.x (2.0.4 as of September 2026); the commands below work the same on 1.x. Since 2023 Consul is under the Business Source License, not an open-source one: check the terms before offering it as a hosted product. Never run a production agent with `-dev`, which keeps everything in memory with no ACLs or TLS.

## Instructions

### Installation

```bash
# Install Consul
wget -O- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt update && sudo apt install consul

# macOS alternative: brew tap hashicorp/tap && brew install hashicorp/tap/consul

# Start dev agent
consul agent -dev

# Check cluster members
consul members
```

### Server Configuration

```hcl
# consul-server.hcl — Production Consul server config
datacenter = "dc1"
data_dir   = "/opt/consul/data"
log_level  = "INFO"

server           = true
bootstrap_expect = 3

bind_addr   = "{{ GetPrivateInterfaces | include \"network\" \"10.0.0.0/8\" | attr \"address\" }}"
client_addr = "0.0.0.0"

ui_config { enabled = true }

connect { enabled = true }

ports {
  grpc     = 8502   # plaintext xDS for Envoy on the same host; disabled (-1) by default
  grpc_tls = 8503   # TLS xDS for proxies on other hosts
}

# generate with: consul keygen
encrypt = "pUqJrVyVRj5jsiYEkM/tFQYfWyJIv4s3XkvDwy7Cu5s="

acl {
  enabled                  = true
  default_policy           = "deny"
  enable_token_persistence = true
  tokens {
    # agent token: needs node "<name>" write + service_prefix "" read
    agent   = "0b4f3c1e-7a52-4d0e-9c1b-5d2f8e6a1b34"
    # default token for DNS and unauthenticated requests: read-only
    default = "6e1d9a20-3c4b-4f77-8a0e-2b9c7d51f0aa"
  }
}

tls {
  defaults {
    ca_file   = "/opt/consul/tls/ca.pem"
    cert_file = "/opt/consul/tls/server.pem"
    key_file  = "/opt/consul/tls/server-key.pem"
    verify_incoming = true
    verify_outgoing = true
  }
  internal_rpc {
    verify_server_hostname = true
  }
}

autopilot {
  cleanup_dead_servers = true
  last_contact_threshold = "200ms"
  server_stabilization_time = "10s"
}
```

### Service Registration

```jsonc
// services/web.json — Register web service with health check
{
  "service": {
    "name": "web",
    "port": 8080,
    "tags": ["production", "v2"],
    "meta": {
      "version": "2.0.0"
    },
    "check": {
      "http": "http://localhost:8080/health",
      "interval": "10s",
      "timeout": "5s",
      "deregister_critical_service_after": "30m"
    }
  }
}
```

```bash
consul services register services/web.json
consul services deregister -id=web

dig @127.0.0.1 -p 8600 web.service.consul SRV

curl http://localhost:8500/v1/health/service/web?passing=true

consul catalog services
consul catalog nodes
```

### KV Store

```bash
# Key-value operations
consul kv put config/app/db_host "orders-db.internal.shopfront.io"
consul kv put config/app/db_port "5432"

consul kv get config/app/db_host
consul kv get -recurse config/app/

consul kv export config/ > backup.json
consul kv import @backup.json

consul kv delete config/app/db_host
consul kv delete -recurse config/app/

consul watch -type=key -key=config/app/db_host /scripts/reload.sh
```

### Service Mesh (Connect)

```hcl
# connect-proxy.hcl — Service with sidecar proxy
service {
  name = "web"
  port = 8080

  connect {
    sidecar_service {
      proxy {
        upstreams {
          destination_name = "api"
          local_bind_port  = 9091
        }
        upstreams {
          destination_name = "database"
          local_bind_port  = 9092
        }
      }
    }
  }
}
```

Register the sidecar, then start Envoy next to the service (Envoy must be installed; the agent needs the gRPC port from the config above):

```bash
consul services register connect-proxy.hcl
consul connect envoy -sidecar-for web -token-file=/etc/consul.d/web.token
```

```hcl
# intentions.hcl — Service intentions for access control
Kind = "service-intentions"
Name = "api"
Sources = [
  {
    Name   = "web"
    Action = "allow"
  },
  {
    Name   = "*"
    Action = "deny"
  }
]
```

```bash
# Manage intentions
consul config write intentions.hcl
consul config read -kind service-intentions -name api
consul intention check web api
```

The `consul intention` subcommands (`create`, `list`, ...) are deprecated since 1.9 in favour of the `service-intentions` config entry shown above; `intention check` is still the quick way to test a pair.

### Prepared Queries

```bash
# Create prepared query for failover across datacenters
curl -X POST http://localhost:8500/v1/query \
  -H "X-Consul-Token: $CONSUL_HTTP_TOKEN" -d '{
  "Name": "web-query",
  "Service": {
    "Service": "web",
    "Tags": ["production"],
    "Failover": {
      "Datacenters": ["dc2", "dc3"]
    },
    "OnlyPassing": true
  }
}'
```

### ACL Configuration

```bash
# Bootstrap ACL system (once; save the SecretID, e.g. export CONSUL_HTTP_TOKEN)
consul acl bootstrap

# Create policy
consul acl policy create -name "app-read" \
  -rules='service_prefix "web" { policy = "read" } key_prefix "config/app" { policy = "read" }'

# Create token with policy
consul acl token create -description "App token" -policy-name "app-read"
```

### Common Commands

```bash
# Cluster management
consul join 10.0.1.10
consul leave
consul operator raft list-peers
consul operator autopilot state

# Snapshots for backup
consul snapshot save backup.snap
consul snapshot restore backup.snap

consul monitor -log-level=debug
```


## Examples

### Example 1: Register a web service and find it

**User request:** "Register my storefront API on port 8080 with a health check and look it up through DNS."

```bash
consul services register services/web.json
dig @127.0.0.1 -p 8600 web.service.consul SRV
curl -s "http://localhost:8500/v1/health/service/web?passing=true"
```

The SRV answer lists the node and port 8080 only while the `/health` check passes; a failing check removes the instance from the answer.

### Example 2: Lock down service-to-service traffic

**User request:** "Only the web service may call api in our mesh."

```bash
consul config write intentions.hcl
consul intention check web api     # Allowed
consul intention check cart api    # Denied
```

## Guidelines

- With `acl.default_policy = "deny"`, set `acl.tokens.agent` and `acl.tokens.default`; otherwise registration, anti-entropy and DNS fail with permission errors. Pass tokens through `CONSUL_HTTP_TOKEN` or `-token-file`, never inline in shell history.
- Do not bind `client_addr` to `0.0.0.0` without ACLs and TLS: the HTTP API then controls the cluster.
- Run 3 or 5 servers (`bootstrap_expect`), never an even count. Take `consul snapshot save` backups on a schedule and test restores.
- Back up gossip keys and rotate them with `consul keyring`.
- Use `deregister_critical_service_after` so dead instances do not linger.
- For simple discovery without a mesh, Consul can be overkill; use DNS or the platform's own discovery.
