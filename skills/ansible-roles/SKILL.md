---
name: ansible-roles
description: >-
  Organize server configuration with Ansible roles. Use when a user asks to
  structure Ansible playbooks, create reusable configuration modules, set up
  server provisioning, or build a library of infrastructure configurations.
license: Apache-2.0
compatibility: 'Linux, macOS (controller), any SSH-accessible target'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
    - ansible
    - roles
    - configuration
    - provisioning
    - infrastructure
---

# Ansible Roles

## Overview

Ansible roles structure server configuration into reusable, composable modules. Each role handles one concern (nginx, PostgreSQL, Node.js, security hardening). Combine roles to provision complete servers from scratch.

## Instructions

### Step 1: Role Structure

```text
roles/
├── nginx/
│   ├── tasks/main.yml        # what to do
│   ├── handlers/main.yml     # restart/reload triggers
│   ├── templates/nginx.conf.j2  # config templates
│   ├── defaults/main.yml     # default variables
│   └── vars/main.yml         # role-specific variables
├── postgresql/
│   ├── tasks/main.yml
│   ├── templates/pg_hba.conf.j2
│   └── defaults/main.yml
└── app-deploy/
    ├── tasks/main.yml
    └── templates/app.service.j2
```

### Step 2: Nginx Role

```yaml
# roles/nginx/tasks/main.yml — Install and configure Nginx
- name: Install Nginx
  apt:
    name: nginx
    state: present
    update_cache: yes

- name: Deploy Nginx config
  template:
    src: nginx.conf.j2
    dest: /etc/nginx/sites-available/{{ app_name }}
  notify: Reload Nginx

- name: Enable site
  file:
    src: /etc/nginx/sites-available/{{ app_name }}
    dest: /etc/nginx/sites-enabled/{{ app_name }}
    state: link
  notify: Reload Nginx
```

```yaml
# roles/nginx/handlers/main.yml
- name: Reload Nginx
  service:
    name: nginx
    state: reloaded
```

```nginx
# roles/nginx/templates/nginx.conf.j2 — Templated config
server {
    listen 80;
    server_name {{ domain }};

    location / {
        proxy_pass http://127.0.0.1:{{ app_port }};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Step 3: Use Roles in Playbook

```yaml
# playbook.yml — Combine roles to provision a server
- hosts: web_servers
  become: yes
  vars:
    app_name: myapp
    domain: app.example.com
    app_port: 3000
    db_name: myapp_production

  roles:
    - role: security-hardening
    - role: nginx
    - role: postgresql
    - role: nodejs
    - role: app-deploy
```

### Step 4: Galaxy (Community Roles)

```bash
# Install community roles
ansible-galaxy install geerlingguy.docker
ansible-galaxy install geerlingguy.postgresql
ansible-galaxy install geerlingguy.nginx

# Requirements file
# requirements.yml
roles:
  - name: geerlingguy.docker
    version: "6.1.0"
  - name: geerlingguy.certbot

# Install all
ansible-galaxy install -r requirements.yml
```

## Guidelines

- One role = one concern. Don't put Nginx and PostgreSQL in the same role.
- Use `defaults/main.yml` for variables users should override, `vars/main.yml` for internal constants.
- Handlers only run once at the end, even if notified multiple times — perfect for service restarts.
- Galaxy (galaxy.ansible.com) has thousands of community roles — don't reinvent common setups.
