---
name: falco
description: Expert guidance for Falco, the CNCF runtime security tool that detects anomalous behavior in containers and Kubernetes clusters using system call monitoring. Helps developers set up Falco for detecting shell spawns in containers, unexpected network connections, file access violations, and privilege escalation — all in real-time with zero application changes.
license: Apache-2.0
compatibility: No special requirements
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
  - runtime-security
  - kubernetes
  - containers
  - threat-detection
  - ebpf
---

# Falco — Runtime Threat Detection


## Overview


Falco, the CNCF runtime security tool that detects anomalous behavior in containers and Kubernetes clusters using system call monitoring. Helps developers set up Falco for detecting shell spawns in containers, unexpected network connections, file access violations, and privilege escalation — all in real-time with zero application changes.


## Instructions

### Deployment

```bash
# Helm install on Kubernetes
helm repo add falcosecurity https://falcosecurity.github.io/charts
helm install falco falcosecurity/falco \
  --namespace falco --create-namespace \
  --set driver.kind=modern_ebpf \
  --set falcosidekick.enabled=true \
  --set falcosidekick.config.slack.webhookurl="${SLACK_WEBHOOK}"

# Docker (single host)
docker run --rm -i -t \
  --privileged \
  -v /var/run/docker.sock:/host/var/run/docker.sock \
  -v /proc:/host/proc:ro \
  falcosecurity/falco:latest
```

### Custom Rules

```yaml
# falco_rules.local.yaml — Custom detection rules

# Detect shell spawned inside a container
- rule: Shell Spawned in Container
  desc: A shell (bash, sh, zsh) was started inside a container
  condition: >
    spawned_process and container and
    proc.name in (bash, sh, zsh, ash, dash) and
    not proc.pname in (cron, supervisord, entrypoint.sh)
  output: >
    Shell spawned in container
    (user=%user.name container=%container.name image=%container.image.repository
     shell=%proc.name parent=%proc.pname cmdline=%proc.cmdline)
  priority: WARNING
  tags: [container, shell, mitre_execution]

# Detect sensitive file access
- rule: Read Sensitive File
  desc: A process read a sensitive file (passwords, keys, tokens)
  condition: >
    open_read and container and
    fd.name in (/etc/shadow, /etc/passwd, /root/.ssh/id_rsa,
                /var/run/secrets/kubernetes.io/serviceaccount/token)
  output: >
    Sensitive file read (user=%user.name file=%fd.name container=%container.name
     image=%container.image.repository command=%proc.cmdline)
  priority: ERROR
  tags: [filesystem, mitre_credential_access]

# Detect outbound connection to unexpected destinations
- rule: Unexpected Outbound Connection
  desc: Container making outbound connection to non-allowlisted IP
  condition: >
    outbound and container and
    not fd.sip in (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16) and
    not fd.sport in (53, 443, 80) and
    not container.image.repository in (allowed_outbound_images)
  output: >
    Unexpected outbound connection
    (container=%container.name image=%container.image.repository
     connection=%fd.name user=%user.name command=%proc.cmdline)
  priority: WARNING
  tags: [network, mitre_exfiltration]

# Detect crypto mining
- rule: Crypto Mining Detected
  desc: Process connecting to known mining pool or running mining binary
  condition: >
    spawned_process and container and
    (proc.name in (xmrig, minerd, cpuminer, ethminer) or
     proc.cmdline contains "stratum+tcp://" or
     proc.cmdline contains "pool.minexmr")
  output: >
    Crypto mining activity detected
    (container=%container.name image=%container.image.repository
     command=%proc.cmdline user=%user.name)
  priority: CRITICAL
  tags: [crypto, mitre_resource_hijacking]

# Detect privilege escalation
- rule: Privilege Escalation via setuid
  desc: Process changed to root via setuid binary
  condition: >
    spawned_process and container and
    user.uid != 0 and proc.uid = 0 and
    not proc.name in (sudo, su, ping)
  output: >
    Privilege escalation detected
    (user=%user.name container=%container.name command=%proc.cmdline)
  priority: CRITICAL
  tags: [users, mitre_privilege_escalation]

# Lists referenced by rules
- list: allowed_outbound_images
  items: [nginx, envoyproxy/envoy, haproxy]
```

### Falcosidekick Integration

```yaml
# Falcosidekick routes Falco alerts to 50+ outputs
# values.yaml for Helm
falcosidekick:
  enabled: true
  config:
    slack:
      webhookurl: "https://hooks.slack.com/services/xxx"
      minimumpriority: "warning"
      messageformat: |
        *{{ .Priority }}* — {{ .Rule }}
        {{ .Output }}
        Container: {{ index .OutputFields "container.name" }}
        Image: {{ index .OutputFields "container.image.repository" }}
    
    pagerduty:
      routingKey: "xxx"
      minimumpriority: "critical"
    
    # Forward to SIEM
    elasticsearch:
      hostPort: "https://es.example.com:9200"
      index: "falco-alerts"
      minimumpriority: "warning"
```

## Installation

```bash
# Helm (Kubernetes — recommended)
helm repo add falcosecurity https://falcosecurity.github.io/charts
helm install falco falcosecurity/falco -n falco --create-namespace

# Linux package
curl -fsSL https://falco.org/repo/falcosecurity-packages.asc | gpg --dearmor -o /usr/share/keyrings/falco-archive-keyring.gpg
apt-get install falco
```


## Examples


### Example 1: Setting up Falco for a microservices project

**User request:**

```
I have a Node.js API and a React frontend running in Docker. Set up Falco for monitoring/deployment.
```

The agent creates the necessary configuration files based on patterns like `# Helm install on Kubernetes`, sets up the integration with the existing Docker setup, configures appropriate defaults for a Node.js + React stack, and provides verification commands to confirm everything is working.

### Example 2: Troubleshooting custom rules issues

**User request:**

```
Falco is showing errors in our custom rules. Here are the logs: [error output]
```

The agent analyzes the error output, identifies the root cause by cross-referencing with common Falco issues, applies the fix (updating configuration, adjusting resource limits, or correcting syntax), and verifies the resolution with appropriate health checks.


## Guidelines

1. **eBPF driver** — Use `modern_ebpf` driver for best performance and compatibility; no kernel module compilation needed
2. **Start with default rules** — Falco ships with 100+ rules; enable them first, then add custom rules for your environment
3. **Allowlists over blocklists** — Define what's expected (allowed images, allowed processes); flag everything else as anomalous
4. **Falcosidekick for routing** — Route alerts to Slack, PagerDuty, SIEM; Falcosidekick supports 50+ outputs
5. **Priority levels** — Use CRITICAL for active attacks, ERROR for policy violations, WARNING for suspicious activity
6. **MITRE ATT&CK tags** — Tag rules with MITRE tactics; helps incident response teams understand the attack stage
7. **Tune for noise** — Expect noise initially; add exceptions for known-good processes (health checks, init scripts)
8. **Combine with admission control** — Falco detects at runtime; pair with OPA/Kyverno for preventive controls at deploy time
