---
name: ansible-automation
description: >-
  Automates server configuration and application deployment with Ansible.
  Use when the user wants to write Ansible playbooks, create roles, manage
  inventory, configure servers, deploy applications, set up infrastructure,
  manage users and permissions, handle secrets with Ansible Vault, or
  orchestrate multi-server deployments. Trigger words: ansible, playbook,
  ansible role, ansible galaxy, inventory, ansible vault, ansible task,
  ansible handler, ansible template, jinja2, ansible collection, ansible
  tower, awx, ansible lint, configuration management, server provisioning.
license: Apache-2.0
compatibility: "Ansible 2.15+ (ansible-core). Python 3.9+ on control node. SSH access to managed nodes."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: ["ansible", "configuration-management", "automation", "devops"]
---

# Ansible Automation

## Overview

Writes Ansible playbooks and roles for server configuration, application deployment, and infrastructure automation. Covers inventory management, role creation, Jinja2 templating, Ansible Vault for secrets, handlers, tags, error handling, and integration with CI/CD pipelines.

## Instructions

### 1. Project Structure

```
ansible/
├── ansible.cfg
├── inventory/
│   ├── production/
│   │   ├── hosts.yml
│   │   ├── group_vars/
│   │   └── host_vars/
│   └── staging/
├── playbooks/
│   ├── site.yml
│   ├── webservers.yml
│   └── deploy.yml
├── roles/
│   ├── common/
│   ├── nginx/
│   └── postgresql/
├── vault/
│   └── secrets.yml
└── requirements.yml
```

**ansible.cfg:**
```ini
[defaults]
inventory = inventory/production
roles_path = roles
vault_password_file = .vault_pass
host_key_checking = False
stdout_callback = yaml
forks = 20

[privilege_escalation]
become = True
become_method = sudo

[ssh_connection]
pipelining = True
ssh_args = -o ControlMaster=auto -o ControlPersist=60s
```

### 2. Inventory

```yaml
# inventory/production/hosts.yml
all:
  children:
    webservers:
      hosts:
        web-1: { ansible_host: 10.0.1.10 }
        web-2: { ansible_host: 10.0.1.11 }
    databases:
      hosts:
        db-primary: { ansible_host: 10.0.2.10, postgresql_role: primary }
        db-replica: { ansible_host: 10.0.2.11, postgresql_role: replica }
  vars:
    ansible_user: deploy
    ansible_ssh_private_key_file: ~/.ssh/deploy_key
```

### 3. Playbooks

**Deployment playbook with rolling updates:**
```yaml
# playbooks/deploy.yml
---
- name: Deploy application
  hosts: webservers
  serial: "30%"
  max_fail_percentage: 10

  vars:
    app_version: "{{ version | default('latest') }}"

  pre_tasks:
    - name: Remove from load balancer
      uri:
        url: "http://lb.internal/api/servers/{{ inventory_hostname }}/drain"
        method: POST
      delegate_to: localhost

  roles:
    - role: app-deploy
      vars:
        deploy_version: "{{ app_version }}"

  post_tasks:
    - name: Verify application health
      uri:
        url: "http://{{ ansible_host }}:{{ app_port }}/health"
        status_code: 200
      retries: 10
      delay: 5
      register: health
      until: health.status == 200

    - name: Add back to load balancer
      uri:
        url: "http://lb.internal/api/servers/{{ inventory_hostname }}/enable"
        method: POST
      delegate_to: localhost
```

**Run commands:**
```bash
ansible-playbook playbooks/site.yml
ansible-playbook playbooks/deploy.yml -e version=1.2.3
ansible-playbook playbooks/site.yml --limit webservers
ansible-playbook playbooks/site.yml --check --diff
ansible-playbook playbooks/site.yml --tags "nginx,ssl"
```

### 4. Roles

**Role structure:**
```
roles/nginx/
├── defaults/main.yml     # Default variables (lowest priority)
├── vars/main.yml         # Role variables (higher priority)
├── tasks/main.yml        # Entry point
├── handlers/main.yml     # Service restart handlers
├── templates/site.conf.j2
├── files/
└── meta/main.yml         # Dependencies
```

**tasks/main.yml:**
```yaml
---
- name: Install nginx
  ansible.builtin.apt:
    name: nginx
    state: present
    update_cache: true
  tags: [nginx, install]

- name: Deploy nginx configuration
  ansible.builtin.template:
    src: nginx.conf.j2
    dest: /etc/nginx/nginx.conf
    mode: '0644'
    validate: 'nginx -t -c %s'
  notify: Reload nginx
  tags: [nginx, configure]

- name: Deploy site configurations
  ansible.builtin.template:
    src: site.conf.j2
    dest: "/etc/nginx/sites-available/{{ item.name }}.conf"
    mode: '0644'
  loop: "{{ nginx_sites }}"
  notify: Reload nginx

- name: Ensure nginx is running
  ansible.builtin.service:
    name: nginx
    state: started
    enabled: true
```

**handlers/main.yml:**
```yaml
---
- name: Reload nginx
  ansible.builtin.service:
    name: nginx
    state: reloaded
```

### 5. Ansible Vault

```bash
ansible-vault encrypt vault/secrets.yml
ansible-vault edit vault/secrets.yml
ansible-vault encrypt_string 'supersecret' --name 'db_password'
ansible-playbook site.yml --vault-password-file .vault_pass
```

```yaml
# group_vars/all.yml (references vault)
db_password: "{{ vault_db_password }}"
api_key: "{{ vault_api_key }}"
```

### 6. Common Patterns

**Error handling with rollback:**
```yaml
- name: Try to deploy
  block:
    - name: Pull latest code
      ansible.builtin.git:
        repo: "{{ app_repo }}"
        dest: "{{ app_dir }}"
        version: "{{ app_version }}"
    - name: Install dependencies
      community.general.npm:
        path: "{{ app_dir }}"
        production: true
    - name: Restart application
      ansible.builtin.service:
        name: "{{ app_name }}"
        state: restarted
  rescue:
    - name: Rollback to previous version
      ansible.builtin.git:
        repo: "{{ app_repo }}"
        dest: "{{ app_dir }}"
        version: "{{ app_previous_version }}"
    - name: Notify about failure
      community.general.slack:
        token: "{{ slack_token }}"
        msg: "Deploy failed on {{ inventory_hostname }}, rolled back"
        channel: "#deployments"
```

## Examples

### Example 1: Full Server Stack

**Input:** "Set up 3 web servers with nginx + Node.js app, 1 PostgreSQL primary with 1 replica, and a Redis server. Configure SSL, firewall, deploy user, and unattended security updates."

**Output:** Complete Ansible project with roles: `common` (deploy user, SSH hardening, UFW, unattended-upgrades), `nginx` (install, SSL via certbot), `nodejs` (nvm, PM2), `postgresql` (primary + streaming replica, backups), `redis` (bind to private IP), `app-deploy` (git pull, npm install, zero-downtime restart).

### Example 2: Rolling Deployment with Health Checks

**Input:** "Create a deployment playbook that does a rolling deploy across 10 web servers, 3 at a time. Drain from LB, deploy, health check, add back. If any server fails, stop and rollback all."

**Output:** Playbook with `serial: 3`, pre-task LB drain, deploy role with git/npm/restart, post-task health check with retries, and rescue block that rolls back all already-deployed hosts using a dynamic group.

## Guidelines

- Use fully qualified collection names: `ansible.builtin.copy` not `copy`
- Always use `ansible-lint` before committing playbooks
- Use roles for reusable logic, playbooks for orchestration
- Set `mode` explicitly on file/template/copy tasks (avoid permission drift)
- Use `validate` parameter on config file tasks to catch syntax errors before applying
- Use `handlers` for service restarts — they run once at the end, not on every task
- Use `tags` generously — they let you run subsets of a playbook
- Use `--check --diff` for dry runs before applying to production
- Keep secrets in Vault — never plain text in inventory or vars files
- Use `serial` for rolling deploys — never update all servers at once
- Idempotency is sacred — running a playbook twice should produce the same result
- Use `block/rescue/always` for error handling and rollback logic
- Test roles with Molecule before using in production
