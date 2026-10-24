---
name: nagios
description: >-
  Nagios Core is a self-hosted monitoring system that runs check plugins
  against hosts and services and sends alerts when their state changes. Use it
  when the user asks to install Nagios Core, define hosts and services, write
  check commands or custom plugins, monitor remote servers with NRPE, or set
  up notification contacts.
license: Apache-2.0
compatibility: "Nagios Core 4.4+ (Ubuntu 24.04 packages nagios4 4.4.6; upstream 4.5.x), Monitoring Plugins 2.3+"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  repository: https://github.com/NagiosEnterprises/nagioscore
  tags: ["nagios", "infrastructure-monitoring", "checks", "notifications", "plugins"]
---

# Nagios

## Overview

Nagios Core schedules check plugins (small programs that print one status line and exit 0 OK, 1 WARNING, 2 CRITICAL or 3 UNKNOWN) and notifies contacts when a host or service changes state. Everything is configured through object definitions: hosts, services, commands, contacts, time periods and templates. This skill follows the Debian/Ubuntu packages (`nagios4`, paths under `/etc/nagios4`). Upstream's latest Core is 4.5.x, which is built from source; the object syntax shown here is the same.

## Instructions

### Task A: Install

```bash
sudo apt-get update
sudo apt-get install -y nagios4 monitoring-plugins nagios-nrpe-plugin apache2-utils
sudo systemctl enable --now nagios4
# The web UI is served by Apache; Debian restricts it to private addresses and
# uses Digest auth for cmd.cgi, with realm "Nagios4"
sudo htdigest -c /etc/nagios4/htdigest.users Nagios4 nagiosadmin
```

The plugin package is `monitoring-plugins` (the old `nagios-plugins` name is gone). Plugins live in `/usr/lib/nagios/plugins/`. The packaged `/etc/nagios4/nagios.cfg` already loads `cfg_dir=/etc/nagios4/conf.d`, the sample templates in `/etc/nagios4/objects/` (`generic-host`, `linux-server`, `generic-service`, `generic-contact`) and `/etc/nagios-plugins/config/*.cfg`, so put your files in `/etc/nagios4/conf.d/` and leave the rest of `nagios.cfg` alone. After editing `nagios.cfg`, always verify it:

```bash
sudo nagios4 -v /etc/nagios4/nagios.cfg
```

### Task B: Hosts and services

The packaged templates assign `contact_groups admins`. If you have no such group, set `contact_groups` on every host and service (below) or the verification fails with `Contactgroup 'admins' is not defined anywhere`.

```cfg
# /etc/nagios4/conf.d/web-servers.cfg
define host {
    use                     linux-server
    host_name               web-01
    alias                   Web Server 01
    address                 10.20.0.10
    hostgroups              web-servers
    contact_groups          platform-team
}

define host {
    use                     linux-server
    host_name               web-02
    alias                   Web Server 02
    address                 10.20.0.11
    hostgroups              web-servers
    contact_groups          platform-team
}

define hostgroup {
    hostgroup_name  web-servers
    alias           Web Servers
}

define service {
    use                     generic-service
    hostgroup_name          web-servers
    service_description     HTTP
    check_command           check_http_status!80!200,301
    contact_groups          platform-team
}

define service {
    use                     generic-service
    hostgroup_name          web-servers
    service_description     HTTPS Certificate
    check_command           check_cert_expiry!443!30
    check_interval          360
    notification_interval   360
    contact_groups          platform-team
}

define service {
    use                     generic-service
    hostgroup_name          web-servers
    service_description     Disk Usage
    check_command           check_nrpe!check_disk
    contact_groups          platform-team
}
```

Members of a hostgroup are declared on each host with `hostgroups` (do not repeat them in a `members` line). `linux-server` uses the `check-host-alive` host check, which is defined in the plugin templates under `/etc/nagios-plugins/config/`; if `nagios4 -v` says it is not defined, define it with `check_ping`. The `30` argument (`-C 30`) makes `check_http` go CRITICAL when the certificate expires in under 30 days. Intervals are in minutes (`interval_length=60` seconds by default). A notification interval shorter than the check interval triggers a warning, hence the equal values.

### Task C: Commands and NRPE

`check_http` and `check_nrpe` commands ship with the packages, so do not define commands with those names again (duplicate names are a config error). The packaged `check_http` wraps `$ARG1$` in single quotes, so it passes several options as one argument and fails (`Invalid port number`); give each option its own `$ARGn$` in your own commands under new names:

```cfg
# /etc/nagios4/conf.d/commands.cfg
define command {
    command_name    check_http_status
    command_line    /usr/lib/nagios/plugins/check_http -H $HOSTADDRESS$ -p $ARG1$ -e $ARG2$
}

define command {
    command_name    check_cert_expiry
    command_line    /usr/lib/nagios/plugins/check_http -H $HOSTADDRESS$ -S -p $ARG1$ -C $ARG2$
}

define command {
    command_name    check_http_content
    command_line    /usr/lib/nagios/plugins/check_http -H $HOSTADDRESS$ -p $ARG1$ -u $ARG2$ -s "$ARG3$"
}

define command {
    command_name    check_postgres
    command_line    /usr/lib/nagios/plugins/check_pgsql -H $HOSTADDRESS$ -d $ARG1$ -l $ARG2$
}
```

On each monitored host install the NRPE daemon and the plugins, then declare the checks the server may run:

```bash
sudo apt-get install -y nagios-nrpe-server monitoring-plugins-basic
```

```cfg
# /etc/nagios/nrpe_local.cfg (included by nrpe.cfg)
# bind to the private address instead of every interface; allow only the Nagios server
server_address=10.20.0.10
allowed_hosts=10.20.0.5
# keep dont_blame_nrpe=0 so the server cannot pass arguments to commands

command[check_disk]=/usr/lib/nagios/plugins/check_disk -w 20% -c 10% -p /
command[check_load]=/usr/lib/nagios/plugins/check_load -r -w 5,4,3 -c 10,8,6
command[check_procs]=/usr/lib/nagios/plugins/check_procs -w 250 -c 400
command[check_swap]=/usr/lib/nagios/plugins/check_swap -w 20% -c 10%
```

Restart with `sudo systemctl restart nagios-nrpe-server` and open TCP 5666 only to the Nagios server. Test from the Nagios server: `/usr/lib/nagios/plugins/check_nrpe -H 10.20.0.10 -c check_load`. There is no stock memory plugin in `monitoring-plugins`; add a third-party `check_mem` script yourself or use `check_swap`.

### Task D: Contacts

```cfg
# /etc/nagios4/conf.d/contacts.cfg
define contact {
    use         generic-contact
    contact_name  marta
    alias       Marta (Platform Lead)
    email       marta@brightcart.io
}

define contactgroup {
    contactgroup_name  platform-team
    alias              Platform Engineering Team
    members            marta
}
```

`use generic-contact` brings the notification periods, options and the `notify-service-by-email` / `notify-host-by-email` commands defined in `/etc/nagios4/objects/`; a contact without it is missing required directives. Email needs a working local MTA (`mail` command). For chat, add your own `notify-service-by-slack` command whose script reads its webhook URL from a root-only file, and list it in `service_notification_commands`.

### Task E: Custom plugin

```bash
#!/bin/bash
# /usr/lib/nagios/plugins/check_api_health: HTTP status and latency check
# Usage: check_api_health -u URL [-w warn_ms] [-c crit_ms]

URL=""
WARN=1000
CRIT=3000

while getopts "u:w:c:" opt; do
    case $opt in
        u) URL="$OPTARG" ;;
        w) WARN="$OPTARG" ;;
        c) CRIT="$OPTARG" ;;
        *) echo "UNKNOWN - usage: $0 -u URL [-w ms] [-c ms]"; exit 3 ;;
    esac
done
[ -z "$URL" ] && { echo "UNKNOWN - missing -u URL"; exit 3; }

START=$(date +%s%N)
CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$URL")
DURATION=$(( ($(date +%s%N) - START) / 1000000 ))
PERF="| response_time=${DURATION}ms;${WARN};${CRIT};0"

if [ "$CODE" != "200" ]; then
    echo "CRITICAL - HTTP $CODE from $URL $PERF"; exit 2
elif [ "$DURATION" -gt "$CRIT" ]; then
    echo "CRITICAL - response time ${DURATION}ms > ${CRIT}ms $PERF"; exit 2
elif [ "$DURATION" -gt "$WARN" ]; then
    echo "WARNING - response time ${DURATION}ms > ${WARN}ms $PERF"; exit 1
fi
echo "OK - response time ${DURATION}ms $PERF"; exit 0
```

Save it as `/usr/lib/nagios/plugins/check_api_health` (`chmod 755`), then define a command for it:

```cfg
define command {
    command_name    check_api_health
    command_line    /usr/lib/nagios/plugins/check_api_health -u $ARG1$ -w $ARG2$ -c $ARG3$
}
```

Apply changes with `sudo nagios4 -v /etc/nagios4/nagios.cfg && sudo systemctl reload nagios4`.

## Examples

### Example 1: "Monitor my two web servers over HTTP and TLS expiry"

Request: "Alert the platform team if either web server stops answering or its certificate expires within 30 days."
Steps: create `web-servers.cfg` (Task B), the `check_http_status` and `check_cert_expiry` commands (Task C) and the `platform-team` contact group (Task D), run `sudo nagios4 -v /etc/nagios4/nagios.cfg`, then reload. Result: the verification ends with `Total Errors: 0`, and the web UI lists `HTTP` and `HTTPS Certificate` for web-01 and web-02 within a few minutes.

### Example 2: "Alert when the orders API gets slow"

Request: "Warn at 800 ms and go critical at 2 seconds on the orders API health endpoint."
Steps: install the plugin from Task E, add the `check_api_health` command, and a service with `check_command check_api_health!http://127.0.0.1:8080/health!800!2000`. Running the plugin by hand prints `OK - response time 212ms | response_time=212ms;800;2000;0` and exits 0; at 900 ms it prints `WARNING - response time 900ms > 800ms ...` and exits 1.

## Guidelines

- Run `nagios4 -v` before every reload, so a typo never takes monitoring down.
- Keep `max_check_attempts` above 1 (the templates use 3 for services) so a single failed check does not page anyone.
- Plugins print performance data after `|` (`label=valueUOM;warn;crit;min;max`) for graphing add-ons.
- Never pass user-controlled text into command lines through `$ARGn$` without quoting; do not enable NRPE arguments (`dont_blame_nrpe=1`) on hosts reachable by others.
- Expose the web UI only on private networks or behind HTTPS and real authentication.
- Nagios Core has no built-in long-term metrics or dashboards-as-code; if you need those, look at Prometheus or Zabbix instead.
