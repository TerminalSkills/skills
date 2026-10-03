---
name: nomad
description: >-
  HashiCorp Nomad is a workload orchestrator that schedules containers, VMs and standalone binaries across a cluster using HCL job files. Use when writing Nomad job specifications, running nomad job run and plan, configuring canary deployments, batch and periodic jobs, system jobs, autoscaling, Consul service registration, or Vault secrets in templates.
license: Apache-2.0
compatibility: 'Linux, macOS, Windows; Nomad 1.10+ (checked on 2.0.7); Docker for the docker driver'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  repository: https://github.com/hashicorp/nomad
  tags:
    - nomad
    - orchestrator
    - hashicorp
    - containers
    - scheduling
---

# Nomad

## Overview

Nomad ([hashicorp/nomad](https://github.com/hashicorp/nomad)) is a single-binary scheduler with servers (Raft consensus) and clients that run tasks through drivers (docker, exec, raw_exec, java, qemu). Jobs are HCL files with types `service`, `batch`, `system` and `sysbatch`. Checked against Nomad 2.0.7 (17 September 2026); job and agent files below pass `nomad job validate` and `nomad config validate` on that version. Note that the source license is BUSL 1.1 for 1.7 and later (not open source in the OSI sense; free for most self-hosted use).

Changes that break older tutorials: since 1.10 Vault and Consul integration use workload identity only (the old token-based agent settings are gone); `periodic.cron` is replaced by `crons`; `server.retry_join` and `start_join` directly inside `server` are deprecated in favour of the `server_join` block (removal in 2.1); system jobs support deployments since 2.0.

## Instructions

### Install and try

```bash
wget -O - https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt update && sudo apt install nomad
# macOS / Linuxbrew: brew tap hashicorp/tap && brew install hashicorp/tap/nomad

sudo nomad agent -dev            # throwaway single-node server+client, UI on http://127.0.0.1:4646
nomad status && nomad node status
```

Run the dev agent as root on Linux so the client can fingerprint drivers and cgroups. It is for experiments only: no ACLs, no TLS, data in memory.

### Server configuration

```hcl
# /etc/nomad.d/server.hcl
datacenter = "dc1"
data_dir   = "/opt/nomad/data"

server {
  enabled          = true
  bootstrap_expect = 3
  server_join {
    retry_join = ["10.0.1.10", "10.0.1.11", "10.0.1.12"]
  }
}

acl { enabled = true }

tls {
  http      = true
  rpc       = true
  ca_file   = "/opt/nomad/tls/nomad-agent-ca.pem"
  cert_file = "/opt/nomad/tls/dc1-server-nomad.pem"
  key_file  = "/opt/nomad/tls/dc1-server-nomad-key.pem"
}

consul { address = "127.0.0.1:8500" }

vault {
  enabled = true
  default_identity {      # servers sign a workload-identity JWT for each task
    aud = ["vault.io"]
    ttl = "1h"
  }
}

telemetry { prometheus_metrics = true }
```

Check it with `nomad config validate server.hcl`. Create certificates with `nomad tls ca create` and `nomad tls cert create -server`, and bootstrap ACLs once with `nomad acl bootstrap`. Clients also need a `vault` block with `address` (and the Vault side needs a JWT auth backend named `jwt-nomad` by default) and a `client { enabled = true }` block.

### Service job with canary, autoscaling and Vault secrets

```hcl
# jobs/web.nomad.hcl
variable "image_tag" {
  type    = string
  default = "1.4.2"
}

job "web" {
  datacenters = ["dc1"]
  type        = "service"

  update {
    max_parallel     = 1
    min_healthy_time = "30s"
    healthy_deadline = "5m"
    auto_revert      = true
    canary           = 1
  }

  group "web" {
    count = 3

    network {
      port "http" { to = 8080 }
    }

    service {
      name     = "web"
      port     = "http"
      provider = "consul"
      check {
        type     = "http"
        path     = "/health"
        interval = "10s"
        timeout  = "3s"
      }
    }

    scaling {                    # group level; read by the Nomad Autoscaler agent, not by Nomad itself
      enabled = true
      min     = 2
      max     = 10
      policy {
        evaluation_interval = "30s"
        cooldown            = "2m"
        check "cpu_usage" {
          source = "prometheus"
          query  = "avg(nomad_client_allocs_cpu_total_percent{task='app'})"
          strategy "target-value" { target = 70 }
        }
      }
    }

    task "app" {
      driver = "docker"
      config {
        image = "registry.northwind.io/web:${var.image_tag}"
        ports = ["http"]
      }
      env {
        PORT        = "${NOMAD_PORT_http}"
        ENVIRONMENT = "production"
      }
      vault { role = "web-app" }          # token comes from workload identity (JWT login)
      template {
        data        = <<-EOF
          {{ with secret "secret/data/web/config" }}
          DB_PASSWORD={{ .Data.data.db_pass }}
          {{ end }}
        EOF
        destination = "secrets/env.txt"
        env         = true
      }
      resources {
        cpu    = 500      # MHz
        memory = 256      # MB
      }
    }
  }
}
```

A `scaling` block inside a task needs a label (Dynamic Application Sizing); horizontal scaling lives in the group and takes none. Neither is allowed in `system` jobs. Pass variables with `nomad job run -var image_tag=1.4.3 jobs/web.nomad.hcl`.

### Periodic batch job

```hcl
# jobs/backup.nomad.hcl
job "db-backup" {
  datacenters = ["dc1"]
  type        = "batch"

  periodic {
    crons            = ["0 2 * * *"]
    prohibit_overlap = true
    time_zone        = "UTC"
  }

  group "backup" {
    task "dump" {
      driver = "docker"
      config {
        image   = "postgres:17"
        command = "/bin/sh"
        args    = ["-c", "pg_dump -h $DB_HOST -U $DB_USER $DB_NAME | gzip > /alloc/data/backup.sql.gz"]
      }
      vault { role = "db-backup" }
      template {
        data        = <<-EOF
          {{ with secret "database/creds/backup" }}
          DB_USER={{ .Data.username }}
          PGPASSWORD={{ .Data.password }}
          {{ end }}
          DB_HOST=db.northwind.io
          DB_NAME=production
        EOF
        destination = "secrets/env"
        env         = true
      }
      resources {
        cpu    = 1000
        memory = 512
      }
    }
  }
}
```

### System job (one allocation per client)

```hcl
# jobs/node-exporter.nomad.hcl
job "node-exporter" {
  datacenters = ["dc1"]
  type        = "system"

  group "exporter" {
    network {
      port "metrics" { static = 9100 }
    }
    task "node-exporter" {
      driver = "docker"
      config {
        image        = "prom/node-exporter:v1.9.1"
        ports        = ["metrics"]
        network_mode = "host"
        pid_mode     = "host"
        volumes      = ["/:/host:ro,rslave"]
        args         = ["--path.rootfs=/host"]
      }
      resources {
        cpu    = 100
        memory = 64
      }
    }
  }
}
```

The Docker driver refuses `pid_mode = "host"` and host volume mounts unless the client enables them (`plugin "docker" { config { allow_privileged ... volumes { enabled = true } } }`); review those settings before running this job.

### Everyday commands

```bash
nomad job validate jobs/web.nomad.hcl
nomad job plan jobs/web.nomad.hcl           # dry run; prints the -check-index to pass to run
nomad job run jobs/web.nomad.hcl
nomad job status web
nomad job promote web                       # promote healthy canaries (or nomad deployment promote <id>)
nomad job revert web 3                      # back to version 3
nomad job scale web web 5                   # job, group, count
nomad job stop -purge web
nomad deployment list && nomad deployment fail 8f3c1a2e
nomad alloc status 5d2f0b7a && nomad alloc logs -f 5d2f0b7a app
nomad alloc exec 5d2f0b7a /bin/sh
nomad server members && nomad operator raft list-peers
nomad node drain -enable -yes 3b9c7e41       # -disable to bring it back
```

## Examples

### Example 1: "Deploy v1.4.3 safely with one canary"

```bash
nomad job plan -var image_tag=1.4.3 jobs/web.nomad.hcl
nomad job run  -var image_tag=1.4.3 jobs/web.nomad.hcl
nomad job status web          # shows 1 canary placed, deployment "running"
nomad job promote web         # after checking the canary's logs and health
```

Result: one new allocation starts next to the three old ones; promote rolls the other three one at a time, and `auto_revert` rolls back if health checks fail.

### Example 2: "Run a nightly backup and check the last run"

```bash
nomad job run jobs/backup.nomad.hcl
nomad job status db-backup          # lists the periodic launches db-backup/periodic-...
nomad job periodic force db-backup  # trigger one now
```

## Guidelines

- Always `nomad job plan` before `run` in production; use the printed check index to avoid racing another edit.
- Pin image tags; `latest` makes deployments unrepeatable.
- Run 3 or 5 servers, never 2 or 4; keep Raft data on durable disk and back it up with `nomad operator snapshot save`.
- Enable ACLs and TLS before exposing port 4646; never run `-dev` agents on shared networks.
- `datacenters` defaults to `["*"]`; list datacenters explicitly to keep jobs where you expect.
- `cpu` is MHz and `memory` is MB; jobs exceeding client capacity stay pending with a placement failure shown in `nomad job status`.
- Secrets belong in Vault templates, not in `env` blocks in the job file.
- Nomad does not autoscale by itself: the `scaling` block only works with the Nomad Autoscaler running.
