---
title: Provision and Harden a Linux Server from Scratch
slug: provision-and-harden-linux-server
description: >-
  Set up a production-ready Linux server using Ansible roles for automated
  provisioning, systemd for service management, SSH hardening, iptables
  firewall, and rsync for deployments. Complete server setup in one playbook.
skills:
  - ansible-roles
  - systemd
  - ssh
  - iptables
  - rsync
category: devops
tags:
  - server
  - provisioning
  - hardening
  - ansible
  - linux
---

# Provision and Harden a Linux Server from Scratch

Kai just rented a bare Ubuntu 24.04 VPS for a new project. The goal: go from a fresh server to a production-ready machine running a Node.js app with Nginx, PostgreSQL, automatic TLS, firewall, and monitoring — all automated with Ansible so it's reproducible.

## Step 1: Ansible Inventory and Base Playbook

Kai starts by defining the server in an Ansible inventory and creating roles for each concern. The entire setup runs with a single command, and can be replayed on a new server in minutes.

```yaml
# inventory/production.yml — Server inventory
all:
  hosts:
    web1:
      ansible_host: 203.0.113.50
      ansible_user: root
      ansible_ssh_private_key_file: ~/.ssh/deploy_key
      app_domain: app.example.com
      app_port: 3000
      db_name: myapp_production
```

```yaml
# playbook.yml — Main provisioning playbook
- hosts: all
  become: yes
  vars:
    deploy_user: deploy
    app_name: myapp
    node_version: "20"

  roles:
    - role: base-setup         # users, packages, timezone
    - role: ssh-hardening      # key-only auth, custom port
    - role: firewall           # iptables rules
    - role: nodejs             # Node.js installation
    - role: postgresql         # database setup
    - role: nginx-proxy        # reverse proxy + TLS
    - role: app-deploy         # deploy application
    - role: monitoring         # basic monitoring setup
```

## Step 2: Base Setup Role

The first role creates a deploy user, installs essential packages, and configures the server basics.

```yaml
# roles/base-setup/tasks/main.yml — Initial server configuration
- name: Update apt cache
  apt:
    update_cache: yes
    cache_valid_time: 3600

- name: Install essential packages
  apt:
    name:
      - curl
      - wget
      - git
      - htop
      - unzip
      - build-essential
      - ufw
      - fail2ban
    state: present

- name: Create deploy user
  user:
    name: "{{ deploy_user }}"
    shell: /bin/bash
    groups: sudo
    append: yes
    create_home: yes

- name: Set up SSH key for deploy user
  authorized_key:
    user: "{{ deploy_user }}"
    key: "{{ lookup('file', '~/.ssh/deploy_key.pub') }}"

- name: Set timezone
  timezone:
    name: UTC

- name: Configure automatic security updates
  apt:
    name: unattended-upgrades
    state: present

- name: Enable automatic security updates
  copy:
    content: |
      APT::Periodic::Update-Package-Lists "1";
      APT::Periodic::Unattended-Upgrade "1";
      APT::Periodic::AutocleanInterval "7";
    dest: /etc/apt/apt.conf.d/20auto-upgrades
```

## Step 3: SSH Hardening Role

SSH is the front door — it needs to be locked down. Key-only authentication, custom port, no root login, and connection limits.

```yaml
# roles/ssh-hardening/tasks/main.yml — Lock down SSH access
- name: Configure SSH daemon
  template:
    src: sshd_config.j2
    dest: /etc/ssh/sshd_config
    validate: '/usr/sbin/sshd -t -f %s'
  notify: Restart SSH

- name: Ensure SSH key directory permissions
  file:
    path: "/home/{{ deploy_user }}/.ssh"
    state: directory
    owner: "{{ deploy_user }}"
    mode: '0700'
```

```text
# roles/ssh-hardening/templates/sshd_config.j2 — Hardened SSH config
Port 2222
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys
MaxAuthTries 3
MaxSessions 5
ClientAliveInterval 300
ClientAliveCountMax 2
AllowUsers {{ deploy_user }}
X11Forwarding no
AllowTcpForwarding yes
AllowAgentForwarding no
```

## Step 4: Firewall Role

Only allow what's needed: SSH (custom port), HTTP, HTTPS. Everything else is dropped.

```yaml
# roles/firewall/tasks/main.yml — UFW firewall configuration
- name: Reset UFW to defaults
  ufw:
    state: reset

- name: Set default policies
  ufw:
    direction: "{{ item.direction }}"
    policy: "{{ item.policy }}"
  loop:
    - { direction: incoming, policy: deny }
    - { direction: outgoing, policy: allow }

- name: Allow SSH on custom port
  ufw:
    rule: allow
    port: "2222"
    proto: tcp

- name: Allow HTTP and HTTPS
  ufw:
    rule: allow
    port: "{{ item }}"
    proto: tcp
  loop: ["80", "443"]

- name: Allow PostgreSQL from localhost only
  ufw:
    rule: allow
    port: "5432"
    from_ip: 127.0.0.1

- name: Enable firewall
  ufw:
    state: enabled
```

## Step 5: Application Deployment

The app runs as a systemd service with auto-restart. Deployments use rsync to push new code, then restart the service.

```ini
# roles/app-deploy/templates/myapp.service.j2 — systemd service
[Unit]
Description={{ app_name }}
After=network.target postgresql.service

[Service]
Type=simple
User={{ deploy_user }}
WorkingDirectory=/opt/{{ app_name }}
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT={{ app_port }}
EnvironmentFile=/opt/{{ app_name }}/.env
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/opt/{{ app_name }}/uploads

[Install]
WantedBy=multi-user.target
```

```yaml
# roles/app-deploy/tasks/main.yml — Deploy and start the app
- name: Create app directory
  file:
    path: "/opt/{{ app_name }}"
    state: directory
    owner: "{{ deploy_user }}"

- name: Sync application files
  synchronize:
    src: "{{ playbook_dir }}/../dist/"
    dest: "/opt/{{ app_name }}/"
    rsync_opts:
      - "--exclude=node_modules"
      - "--exclude=.env"

- name: Install dependencies
  command: npm ci --production
  args:
    chdir: "/opt/{{ app_name }}"
  become_user: "{{ deploy_user }}"

- name: Deploy systemd service
  template:
    src: myapp.service.j2
    dest: "/etc/systemd/system/{{ app_name }}.service"
  notify:
    - Reload systemd
    - Restart app
```

## Step 6: Run It

```bash
# Provision the entire server with one command
ansible-playbook -i inventory/production.yml playbook.yml

# Deploy just the app (skip infrastructure roles)
ansible-playbook -i inventory/production.yml playbook.yml --tags deploy

# Check what would change without making changes
ansible-playbook -i inventory/production.yml playbook.yml --check --diff
```

## Results

Kai runs the playbook and in 8 minutes, the bare VPS transforms into a hardened production server. SSH only accepts keys on port 2222, the firewall blocks everything except HTTP/HTTPS/SSH, PostgreSQL is configured and locked to localhost, Nginx proxies to the Node.js app with TLS from Let's Encrypt, and the app runs under systemd with auto-restart. More importantly, the entire setup is in Git — when Kai needs a second server for scaling, or needs to rebuild after a disaster, it's one command away. Three months later, this exact playbook provisions four more servers for the growing team without a single manual configuration step.
