---
name: nomad
description: >-
  HashiCorp Nomad workload orchestrator for deploying containers, VMs, and
  standalone applications. Use when the user needs to write job specifications,
  manage deployments, configure scaling, or run batch and service workloads
  across a cluster.
license: Apache-2.0
compatibility:
  - linux
  - macos
  - windows
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
    - nomad
    - orchestrator
    - hashicorp
    - containers
    - scheduling
---

# Nomad

Nomad is a flexible workload orchestrator that deploys containers, legacy apps, and batch jobs.

## Installation

```bash
# Install Nomad
wget -O- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt update && sudo apt install nomad

# Start dev agent
nomad agent -dev

# Check status
nomad status
nomad node status
```

## Server Configuration

```hcl
# nomad-server.hcl — Production server configuration
datacenter = "dc1"
data_dir   = "/opt/nomad/data"

server {
  enabled          = true
  bootstrap_expect = 3

  server_join {
    retry_join = ["10.0.1.10", "10.0.1.11", "10.0.1.12"]
  }
}

tls {
  http = true
  rpc  = true
  ca_file   = "/opt/nomad/tls/ca.pem"
  cert_file = "/opt/nomad/tls/server.pem"
  key_file  = "/opt/nomad/tls/server-key.pem"
}

consul {
  address = "127.0.0.1:8500"
}

vault {
  enabled = true
  address = "https://vault.example.com:8200"
}

telemetry {
  prometheus_metrics = true
}
```

## Service Job

```hcl
# jobs/web.nomad.hcl — Web application service job
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
      name = "web"
      port = "http"
      provider = "consul"

      tags = ["urlprefix-/"]

      check {
        type     = "http"
        path     = "/health"
        interval = "10s"
        timeout  = "3s"
      }
    }

    task "app" {
      driver = "docker"

      config {
        image = "myregistry.com/web:${var.version}"
        ports = ["http"]
      }

      env {
        PORT        = "${NOMAD_PORT_http}"
        DB_HOST     = "db.example.com"
        ENVIRONMENT = "production"
      }

      template {
        data = <<-EOF
          {{ with secret "secret/data/myapp/config" }}
          DB_PASSWORD={{ .Data.data.db_pass }}
          API_KEY={{ .Data.data.api_key }}
          {{ end }}
        EOF
        destination = "secrets/env.txt"
        env         = true
      }

      resources {
        cpu    = 500
        memory = 256
      }

      scaling {
        min     = 2
        max     = 10
        enabled = true

        policy {
          evaluation_interval = "30s"
          cooldown            = "2m"

          check "cpu_usage" {
            source = "prometheus"
            query  = "avg(nomad_client_allocs_cpu_total_percent{task='app'})"

            strategy "target-value" {
              target = 70
            }
          }
        }
      }
    }
  }
}
```

## Batch Job

```hcl
# jobs/backup.nomad.hcl — Periodic database backup job
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
        image   = "postgres:15"
        command = "/bin/sh"
        args    = ["-c", "pg_dump -h $DB_HOST -U $DB_USER $DB_NAME | gzip > /alloc/data/backup.sql.gz"]
      }

      template {
        data = <<-EOF
          {{ with secret "database/creds/backup" }}
          DB_USER={{ .Data.username }}
          DB_PASSWORD={{ .Data.password }}
          {{ end }}
          DB_HOST=db.example.com
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

## System Job

```hcl
# jobs/monitoring.nomad.hcl — Node exporter on all clients
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
        image        = "prom/node-exporter:latest"
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

## Common Commands

```bash
# Job lifecycle
nomad job run web.nomad.hcl
nomad job plan web.nomad.hcl
nomad job stop web
nomad job status web
nomad job history web

# Deployment management
nomad deployment list
nomad deployment status <deployment-id>
nomad deployment promote <deployment-id>
nomad deployment fail <deployment-id>

# Allocation inspection
nomad alloc status <alloc-id>
nomad alloc logs <alloc-id>
nomad alloc exec <alloc-id> /bin/sh

# Scaling
nomad job scale web web 5

# Cluster management
nomad server members
nomad node status
nomad node drain -enable <node-id>
```
