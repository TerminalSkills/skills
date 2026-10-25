---
name: falco
description: >-
  Falco is the CNCF runtime security tool that watches Linux system calls and Kubernetes audit events and alerts on suspicious behavior in containers and hosts. Use when installing Falco with Helm, Docker or apt, writing or tuning custom detection rules (shell in container, sensitive file read, unexpected outbound connection, crypto miner), routing alerts to Slack or a SIEM with Falcosidekick, or fixing rule load errors.
license: Apache-2.0
compatibility: Linux kernel 5.8+ (usually) for the modern_ebpf driver (or a kernel module build); Kubernetes with Helm 3 for the chart
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  repository: https://github.com/falcosecurity/falco
  tags: "runtime-security, kubernetes, containers, threat-detection, ebpf"
---

# Falco — Runtime Threat Detection

## Overview

Falco taps the kernel (system calls through the `modern_ebpf` probe or a kernel module) and evaluates every event against YAML rules; a match becomes an alert on stdout, a file, HTTP or through Falcosidekick. It needs no change to the applications. This skill was checked against Falco 0.45.1 (October 2026), Helm chart `falcosecurity/falco` 9.2.x and Falcosidekick chart 0.14.x; rule files below were validated with `falco --validate` from the 0.45.1 image.

## Instructions

### Deployment on Kubernetes (Helm)

```bash
helm repo add falcosecurity https://falcosecurity.github.io/charts
helm repo update
helm install falco falcosecurity/falco \
  --namespace falco --create-namespace \
  --set driver.kind=modern_ebpf \
  --set tty=true \
  --set falcosidekick.enabled=true \
  --set falcosidekick.config.slack.webhookurl="${SLACK_WEBHOOK_URL}"
kubectl -n falco get pods -w
kubectl -n falco logs -l app.kubernetes.io/name=falco -c falco --tail=20
```

The chart runs Falco as a DaemonSet. `driver.kind` defaults to `auto`, which picks a driver for the node; `modern_ebpf` needs no kernel headers or compilation. Values are case-sensitive, and the Falcosidekick keys are all lower case (`webhookurl`, `routingkey`, `hostport`). The chart sets `json_output` for you when Falcosidekick is enabled.

### Docker (single host)

```bash
docker run --rm -it \
  --cap-drop all --cap-add sys_admin --cap-add sys_resource --cap-add sys_ptrace \
  -v /sys/kernel/tracing:/sys/kernel/tracing:ro \
  -v /var/run/docker.sock:/host/var/run/docker.sock \
  -v /proc:/host/proc:ro \
  -v /etc:/host/etc:ro \
  falcosecurity/falco:0.45.1
```

This is the least-privilege form from the Falco docs (modern eBPF). On hosts where tracefs lives at `/sys/kernel/debug/tracing`, change the source of the first mount. Pin the tag; `latest` changes under you. Official images are signed with cosign.

### Host package (Debian/Ubuntu)

```bash
curl -fsSL https://falco.org/repo/falcosecurity-packages.asc | \
  sudo gpg --dearmor -o /usr/share/keyrings/falco-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/falco-archive-keyring.gpg] https://download.falco.org/packages/deb stable main" | \
  sudo tee /etc/apt/sources.list.d/falcosecurity.list
sudo apt-get update -y
sudo FALCO_FRONTEND=noninteractive FALCO_DRIVER_CHOICE=modern_ebpf apt-get install -y falco
sudo systemctl status falco-modern-bpf
```

`FALCO_DRIVER_CHOICE` is `kmod` or `modern_ebpf`; with `modern_ebpf` no `dkms` or headers are needed. Config lives in `/etc/falco/falco.yaml`; put your overrides in `/etc/falco/config.d/`. Falco reloads rule and config files on change.

### Custom rules

Keep your rules in `falco_rules.local.yaml` (loaded after the shipped `falco_rules.yaml`, which falcoctl keeps updated). With Helm put them under `customRules:` in values. Macros such as `spawned_process`, `container`, `open_read` and `outbound` come from the default rules file, so a custom file only validates together with it.

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
    fd.name in (/etc/shadow, /root/.ssh/id_rsa,
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
    not fd.snet in (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16) and
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

# Detect a setuid bit being set (classic persistence / escalation step)
- rule: Setuid Bit Set in Container
  desc: A process inside a container set the setuid bit on a file
  condition: >
    evt.type in (chmod, fchmod, fchmodat) and
    container and evt.arg.mode contains "S_ISUID" and
    not proc.name in (apt, apt-get, dpkg)
  output: >
    Setuid bit set (user=%user.name container=%container.name file=%evt.arg.filename
     mode=%evt.arg.mode command=%proc.cmdline)
  priority: CRITICAL
  tags: [users, mitre_privilege_escalation]

# Lists referenced by rules
- list: allowed_outbound_images
  items: [nginx, envoyproxy/envoy, haproxy]

# Quiet a default rule for a known-good parent process
- rule: Terminal shell in container
  condition: and not proc.pname = healthcheck.sh
  override:
    condition: append
```

Validate before deploying; a bad condition stops Falco from starting:

```bash
docker run --rm -v "$PWD/falco_rules.local.yaml:/etc/falco/falco_rules.local.yaml:ro" \
  falcosecurity/falco:0.45.1 \
  falco --validate /etc/falco/falco_rules.yaml --validate /etc/falco/falco_rules.local.yaml
```

A good file ends with `/etc/falco/falco_rules.local.yaml: Ok`. Field names that look plausible but do not exist (`proc.uid`) or CIDR tests with `fd.sip` fail here; list valid fields with `falco --list=syscall`. To change a shipped rule use `override` with `condition: append` as in the last block, not a copy of the rule.

### Falcosidekick (alert routing)

```yaml
# values.yaml: helm upgrade falco falcosecurity/falco -n falco -f values.yaml
falcosidekick:
  enabled: true
  config:
    slack:
      webhookurl: "" # pass with --set falcosidekick.config.slack.webhookurl="$SLACK_WEBHOOK_URL"
      minimumpriority: "warning"
    pagerduty:
      routingkey: "" # pass with --set falcosidekick.config.pagerduty.routingkey="$PAGERDUTY_ROUTING_KEY"
      minimumpriority: "critical"
    elasticsearch:
      hostport: "https://es.logging.internal:9200"
      index: "falco"
      minimumpriority: "warning"
```

Prefer `--set` from an environment variable or an existing Secret over committing webhook URLs and keys in values files. Any non-empty output key enables that output.

## Examples

### Example 1: Alert when someone opens a shell in a production pod

**User request:** "I want a Slack message whenever someone execs into a pod in the payments namespace."

Install with the Helm command above, then trigger and check:

```console
$ kubectl exec -n payments deploy/checkout -it -- sh
$ kubectl -n falco logs -l app.kubernetes.io/name=falco -c falco --tail=5
18:41:07.512: Notice A shell was spawned in a container with an attached terminal | evt_type=execve user=root user_uid=0 user_loginuid=-1 process=sh parent=runc command=sh terminal=34816 container_id=... container_name=checkout ...
```

The default rule "Terminal shell in container" fires; the custom "Shell Spawned in Container" adds non-interactive cases. Slack receives the same event through Falcosidekick.

### Example 2: Falco crash-loops after adding a rule

**User request:** "Falco pods are in CrashLoopBackOff since I added our rules."

```console
$ kubectl -n falco logs ds/falco -c falco | grep -A6 "Invalid"
LOAD_ERR_COMPILE_CONDITION (Error compiling condition): unrecognized IPv4 address 10.0.0.0/8
```

The condition used `fd.sip in (10.0.0.0/8)`; `fd.sip` takes single addresses, `fd.snet` takes networks. Change the field, run the `--validate` command, then `helm upgrade`. Pods recover once the file validates.

## Guidelines

- Start with the shipped rules, add custom ones after, and keep a rules file under version control with the `--validate` step in CI.
- Prefer allowlists: define expected images and parent processes in lists and flag everything else.
- Expect noise at first; tune with `override`/`append` and lists, and watch the rate for a week before paging anyone.
- Use `modern_ebpf` on current kernels; fall back to `kmod` only for old kernels. The container needs privileges (or the capabilities above) to load the probe, so run it in its own namespace with restricted access.
- Falco detects; it does not block. Pair it with admission control (Kyverno, OPA Gatekeeper) and with Falco Talon or your own response automation if you need action.
- Set `minimumpriority` per Falcosidekick output so critical alerts page and warnings only log.
