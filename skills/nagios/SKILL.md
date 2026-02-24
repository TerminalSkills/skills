---
name: nagios
description: >-
  Configure Nagios for infrastructure monitoring, service checks, host
  monitoring, and alert notifications. Use when a user needs to set up
  Nagios Core, write check commands, configure host and service definitions,
  manage notification contacts, or create custom monitoring plugins.
license: Apache-2.0
compatibility: "Nagios Core 4.4+, Nagios Plugins 2.4+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: ["nagios", "infrastructure-monitoring", "checks", "notifications", "plugins"]
---

# Nagios

## Overview

Set up Nagios Core for infrastructure and service monitoring with host definitions, check commands, notification contacts, and custom plugins. Covers configuration, common check setups, and plugin development.

## Instructions

### Task A: Install and Configure Nagios

```bash
# Install Nagios Core on Ubuntu
sudo apt-get update
sudo apt-get install -y nagios4 nagios-plugins nagios-nrpe-plugin
sudo systemctl enable nagios4
sudo systemctl start nagios4

# Set admin password for web UI
sudo htpasswd -c /etc/nagios4/htpasswd.users nagiosadmin
```

```cfg
# /etc/nagios4/nagios.cfg — Key configuration directives
cfg_dir=/etc/nagios4/conf.d
cfg_dir=/etc/nagios4/servers

log_file=/var/log/nagios4/nagios.log
command_file=/var/nagios4/rw/nagios.cmd
check_result_path=/var/nagios4/spool/checkresults

status_update_interval=10
check_external_commands=1
enable_notifications=1
execute_service_checks=1
```

### Task B: Define Hosts and Services

```cfg
# /etc/nagios4/servers/web-servers.cfg — Web server host definitions
define host {
    use                     linux-server
    host_name               web-01
    alias                   Web Server 01
    address                 192.168.1.10
    max_check_attempts      5
    check_period            24x7
    notification_interval   30
    notification_period     24x7
    contacts                platform-team
    hostgroups              web-servers
}

define host {
    use                     linux-server
    host_name               web-02
    alias                   Web Server 02
    address                 192.168.1.11
    max_check_attempts      5
    check_period            24x7
    notification_interval   30
    notification_period     24x7
    contacts                platform-team
    hostgroups              web-servers
}

define hostgroup {
    hostgroup_name  web-servers
    alias           Web Servers
    members         web-01,web-02
}
```

```cfg
# /etc/nagios4/servers/web-services.cfg — Service check definitions
define service {
    use                     generic-service
    hostgroup_name          web-servers
    service_description     HTTP
    check_command           check_http!-p 80 -e "200,301"
    max_check_attempts      3
    check_interval          2
    retry_interval          1
    notification_interval   15
    contacts                platform-team
}

define service {
    use                     generic-service
    hostgroup_name          web-servers
    service_description     HTTPS Certificate
    check_command           check_http!-S -p 443 -C 30
    check_interval          360
    notification_interval   60
    contacts                platform-team
}

define service {
    use                     generic-service
    hostgroup_name          web-servers
    service_description     Disk Usage
    check_command           check_nrpe!check_disk
    max_check_attempts      3
    check_interval          10
    contacts                platform-team
}

define service {
    use                     generic-service
    hostgroup_name          web-servers
    service_description     CPU Load
    check_command           check_nrpe!check_load
    check_interval          5
    contacts                platform-team
}

define service {
    use                     generic-service
    hostgroup_name          web-servers
    service_description     Memory Usage
    check_command           check_nrpe!check_mem
    check_interval          5
    contacts                platform-team
}
```

### Task C: Configure Commands and NRPE

```cfg
# /etc/nagios4/conf.d/commands.cfg — Custom check commands
define command {
    command_name    check_nrpe
    command_line    /usr/lib/nagios/plugins/check_nrpe -H $HOSTADDRESS$ -c $ARG1$ -t 30
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

```cfg
# /etc/nagios/nrpe.cfg — NRPE configuration on remote hosts
server_address=0.0.0.0
allowed_hosts=192.168.1.5
dont_blame_nrpe=0

command[check_disk]=/usr/lib/nagios/plugins/check_disk -w 20% -c 10% -p /
command[check_load]=/usr/lib/nagios/plugins/check_load -w 5,4,3 -c 10,8,6
command[check_mem]=/usr/lib/nagios/plugins/check_mem.pl -w 80 -c 90 -f
command[check_procs]=/usr/lib/nagios/plugins/check_procs -w 250 -c 400
command[check_swap]=/usr/lib/nagios/plugins/check_swap -w 20% -c 10%
```

### Task D: Notification Contacts

```cfg
# /etc/nagios4/conf.d/contacts.cfg — Contact and notification definitions
define contact {
    contact_name                    marta
    alias                           Marta (Platform Lead)
    email                           marta@example.com
    service_notification_period     24x7
    host_notification_period        24x7
    service_notification_options    w,u,c,r
    host_notification_options       d,u,r
    service_notification_commands   notify-service-by-email
    host_notification_commands      notify-host-by-email
}

define contactgroup {
    contactgroup_name       platform-team
    alias                   Platform Engineering Team
    members                 marta,tom,nina
}

define command {
    command_name    notify-service-by-slack
    command_line    /usr/local/bin/nagios-slack-notify.sh "$NOTIFICATIONTYPE$" "$SERVICEDESC$" "$HOSTALIAS$" "$SERVICESTATE$" "$SERVICEOUTPUT$"
}
```

### Task E: Custom Plugin

```bash
#!/bin/bash
# /usr/lib/nagios/plugins/check_api_health — Custom API health check plugin
# Usage: check_api_health -u <url> -w <warn_ms> -c <crit_ms>

URL=""
WARN=1000
CRIT=3000

while getopts "u:w:c:" opt; do
    case $opt in
        u) URL="$OPTARG" ;;
        w) WARN="$OPTARG" ;;
        c) CRIT="$OPTARG" ;;
    esac
done

START=$(date +%s%N)
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$URL")
END=$(date +%s%N)
DURATION=$(( (END - START) / 1000000 ))

if [ "$RESPONSE" != "200" ]; then
    echo "CRITICAL - HTTP $RESPONSE from $URL | response_time=${DURATION}ms"
    exit 2
elif [ "$DURATION" -gt "$CRIT" ]; then
    echo "CRITICAL - Response time ${DURATION}ms > ${CRIT}ms | response_time=${DURATION}ms"
    exit 2
elif [ "$DURATION" -gt "$WARN" ]; then
    echo "WARNING - Response time ${DURATION}ms > ${WARN}ms | response_time=${DURATION}ms"
    exit 1
else
    echo "OK - Response time ${DURATION}ms | response_time=${DURATION}ms"
    exit 0
fi
```

```bash
# Verify configuration before reloading
sudo nagios4 -v /etc/nagios4/nagios.cfg
sudo systemctl reload nagios4
```

## Best Practices

- Always run `nagios -v` to verify config before reloading to prevent outages
- Use NRPE for remote checks that need local access (disk, CPU, memory)
- Set `max_check_attempts` > 1 to avoid alerting on transient failures
- Use hostgroups and servicegroups to apply checks to multiple hosts at once
- Output performance data (`| metric=value`) from plugins for graphing integration
- Use `check_interval` and `retry_interval` to balance monitoring granularity with load
