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

Writes Ansible playbooks and roles for server configuration, application deployment, and infrastructure automation. Covers inventory management, role creation, Jinja2 templating, Ansible Vault for secrets, handlers, tags, error handling, and integration with CI/CD pipelines. Supports bare-metal servers, VMs, cloud instances, and containers.

## Instructions

### 1. Project Structure

Standard Ansible project layout:

```
ansible/
├── ansible.cfg
├── inventory/
│   ├── production/
│   │   ├── hosts.yml
│   │   ├── group_vars/
│   │   │   ├── all.yml
│   │   │   ├── webservers.yml
│   │   │   └── databases.yml
│   │   └── host_vars/
│   │       └── db-primary.yml
│   └── staging/
│       ├── hosts.yml
│       └── group_vars/
├── playbooks/
│   ├── site.yml              # Master playbook
│   ├── webservers.yml
│   ├── databases.yml
│   └── deploy.yml
├── roles/
│   ├── common/
│   ├── nginx/
│   ├── nodejs/
│   ├── postgresql/
│   └── app-deploy/
├── templates/
├── files/
├── vault/
│   └── secrets.yml
└── requirements.yml          # Galaxy roles/collections
```

**ansible.cfg:**
```ini
[defaults]
inventory = inventory/production
roles_path = roles
vault_password_file = .vault_pass
host_key_checking = False
retry_files_enabled = False
stdout_callback = yaml
forks = 20
timeout = 30

[privilege_escalation]
become = True
become_method = sudo
become_user = root

[ssh_connection]
pipelining = True
ssh_args = -o ControlMaster=auto -o ControlPersist=60s
```

### 2. Inventory

**YAML inventory (recommended):**
```yaml
# inventory/production/hosts.yml
all:
  children:
    webservers:
      hosts:
        web-1:
          ansible_host: 10.0.1.10
        web-2:
          ansible_host: 10.0.1.11
        web-3:
          ansible_host: 10.0.1.12
    databases:
      hosts:
        db-primary:
          ansible_host: 10.0.2.10
          postgresql_role: primary
        db-replica:
          ansible_host: 10.0.2.11
          postgresql_role: replica
    workers:
      hosts:
        worker-[1:4]:
          ansible_host: 10.0.3.1{{ item }}
  vars:
    ansible_user: deploy
    ansible_ssh_private_key_file: ~/.ssh/deploy_key
```

**Dynamic inventory (AWS):**
```yaml
# inventory/aws_ec2.yml
plugin: amazon.aws.aws_ec2
regions:
  - us-east-1
keyed_groups:
  - key: tags.Role
    prefix: role
  - key: tags.Environment
    prefix: env
filters:
  tag:ManagedBy: ansible
  instance-state-name: running
compose:
  ansible_host: private_ip_address
```

### 3. Playbooks

**Site playbook (orchestrates everything):**
```yaml
# playbooks/site.yml
---
- name: Apply common configuration to all servers
  hosts: all
  roles:
    - common

- name: Configure web servers
  hosts: webservers
  roles:
    - nginx
    - nodejs
    - app-deploy

- name: Configure databases
  hosts: databases
  roles:
    - postgresql
```

**Deployment playbook:**
```yaml
# playbooks/deploy.yml
---
- name: Deploy application
  hosts: webservers
  serial: "30%"           # Rolling deploy, 30% at a time
  max_fail_percentage: 10  # Abort if >10% fail

  vars:
    app_version: "{{ version | default('latest') }}"

  pre_tasks:
    - name: Remove from load balancer
      uri:
        url: "http://lb.internal/api/servers/{{ inventory_hostname }}/drain"
        method: POST
      delegate_to: localhost

    - name: Wait for connections to drain
      wait_for:
        timeout: 30

  roles:
    - role: app-deploy
      vars:
        deploy_version: "{{ app_version }}"

  post_tasks:
    - name: Verify application health
      uri:
        url: "http://{{ ansible_host }}:{{ app_port }}/health"
        status_code: 200
      register: health
      retries: 10
      delay: 5
      until: health.status == 200

    - name: Add back to load balancer
      uri:
        url: "http://lb.internal/api/servers/{{ inventory_hostname }}/enable"
        method: POST
      delegate_to: localhost
```

**Run with:**
```bash
# Full site
ansible-playbook playbooks/site.yml

# Deploy specific version
ansible-playbook playbooks/deploy.yml -e version=1.2.3

# Limit to specific hosts
ansible-playbook playbooks/site.yml --limit webservers

# Dry run
ansible-playbook playbooks/site.yml --check --diff

# With tags
ansible-playbook playbooks/site.yml --tags "nginx,ssl"
```

### 4. Roles

**Role structure:**
```
roles/nginx/
├── defaults/
│   └── main.yml        # Default variables (lowest priority)
├── vars/
│   └── main.yml        # Role variables (higher priority)
├── tasks/
│   ├── main.yml        # Entry point
│   ├── install.yml
│   ├── configure.yml
│   └── ssl.yml
├── handlers/
│   └── main.yml        # Service restart handlers
├── templates/
│   ├── nginx.conf.j2
│   └── site.conf.j2
├── files/
│   └── dhparam.pem
├── meta/
│   └── main.yml        # Dependencies, metadata
└── molecule/           # Tests
    └── default/
        ├── molecule.yml
        ├── converge.yml
        └── verify.yml
```

**tasks/main.yml:**
```yaml
---
- name: Install nginx
  ansible.builtin.apt:
    name: nginx
    state: present
    update_cache: true
    cache_valid_time: 3600
  tags: [nginx, install]

- name: Deploy nginx configuration
  ansible.builtin.template:
    src: nginx.conf.j2
    dest: /etc/nginx/nginx.conf
    owner: root
    group: root
    mode: '0644'
    validate: 'nginx -t -c %s'
  notify: Reload nginx
  tags: [nginx, configure]

- name: Deploy site configuration
  ansible.builtin.template:
    src: site.conf.j2
    dest: "/etc/nginx/sites-available/{{ item.name }}.conf"
    owner: root
    group: root
    mode: '0644'
  loop: "{{ nginx_sites }}"
  notify: Reload nginx
  tags: [nginx, configure]

- name: Enable sites
  ansible.builtin.file:
    src: "/etc/nginx/sites-available/{{ item.name }}.conf"
    dest: "/etc/nginx/sites-enabled/{{ item.name }}.conf"
    state: link
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

- name: Restart nginx
  ansible.builtin.service:
    name: nginx
    state: restarted
```

**templates/site.conf.j2:**
```nginx
server {
    listen 80;
    server_name {{ item.domain }};
    
{% if item.ssl | default(false) %}
    listen 443 ssl http2;
    ssl_certificate /etc/letsencrypt/live/{{ item.domain }}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/{{ item.domain }}/privkey.pem;
    
    if ($scheme != "https") {
        return 301 https://$host$request_uri;
    }
{% endif %}

    location / {
        proxy_pass http://127.0.0.1:{{ item.port | default(3000) }};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
{% if item.websocket | default(false) %}
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
{% endif %}
    }
}
```

### 5. Ansible Vault

```bash
# Encrypt a file
ansible-vault encrypt vault/secrets.yml

# Edit encrypted file
ansible-vault edit vault/secrets.yml

# Encrypt a string (inline)
ansible-vault encrypt_string 'supersecret' --name 'db_password'

# Run playbook with vault
ansible-playbook site.yml --ask-vault-pass
ansible-playbook site.yml --vault-password-file .vault_pass
```

**Using vault variables:**
```yaml
# vault/secrets.yml (encrypted)
vault_db_password: "s3cur3p@ss"
vault_api_key: "abc123def456"
vault_ssl_private_key: |
  -----BEGIN PRIVATE KEY-----
  ...
  -----END PRIVATE KEY-----
```

```yaml
# group_vars/all.yml (references vault)
db_password: "{{ vault_db_password }}"
api_key: "{{ vault_api_key }}"
```

### 6. Common Patterns

**Conditionals:**
```yaml
- name: Install on Debian
  ansible.builtin.apt:
    name: "{{ packages }}"
  when: ansible_os_family == "Debian"

- name: Install on RedHat
  ansible.builtin.yum:
    name: "{{ packages }}"
  when: ansible_os_family == "RedHat"
```

**Loops:**
```yaml
- name: Create application users
  ansible.builtin.user:
    name: "{{ item.name }}"
    groups: "{{ item.groups }}"
    shell: /bin/bash
  loop:
    - { name: deploy, groups: "www-data,docker" }
    - { name: monitor, groups: "adm" }

- name: Deploy config files
  ansible.builtin.template:
    src: "{{ item.src }}"
    dest: "{{ item.dest }}"
    mode: "{{ item.mode | default('0644') }}"
  loop: "{{ config_files }}"
  notify: Restart app
```

**Error handling:**
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
  
  always:
    - name: Log deployment attempt
      ansible.builtin.lineinfile:
        path: /var/log/deployments.log
        line: "{{ ansible_date_time.iso8601 }} {{ app_version }} {{ ansible_failed_task.name | default('success') }}"
        create: true
```

**Delegation and local actions:**
```yaml
- name: Add DNS record
  community.general.cloudflare_dns:
    zone: example.com
    record: "{{ inventory_hostname }}"
    type: A
    value: "{{ ansible_host }}"
    account_api_key: "{{ cloudflare_api_key }}"
  delegate_to: localhost
  run_once: true

- name: Wait for server to be reachable
  ansible.builtin.wait_for:
    host: "{{ ansible_host }}"
    port: 22
    delay: 10
    timeout: 300
  delegate_to: localhost
```

### 7. Testing with Molecule

```yaml
# molecule/default/molecule.yml
---
dependency:
  name: galaxy
driver:
  name: docker
platforms:
  - name: ubuntu-22
    image: ubuntu:22.04
    pre_build_image: true
    privileged: true
    command: /sbin/init
  - name: debian-12
    image: debian:12
    pre_build_image: true
    privileged: true
    command: /sbin/init
provisioner:
  name: ansible
verifier:
  name: ansible
```

```bash
# Run full test cycle
molecule test

# Just converge (apply playbook)
molecule converge

# Run verification
molecule verify

# Login to test instance
molecule login -h ubuntu-22
```

### 8. CI/CD Integration

```yaml
# GitHub Actions
- name: Run Ansible Playbook
  uses: dawidd6/action-ansible-playbook@v2
  with:
    playbook: playbooks/deploy.yml
    directory: ansible/
    key: ${{ secrets.SSH_PRIVATE_KEY }}
    inventory: |
      [webservers]
      10.0.1.10
      10.0.1.11
    options: |
      -e version=${{ github.sha }}
      --vault-password-file <(echo "${{ secrets.VAULT_PASSWORD }}")
```

## Examples

### Example 1: Full Server Stack

**Input:** "Set up 3 web servers with nginx + Node.js app, 1 PostgreSQL primary with 1 replica, and a Redis server. Configure SSL with Let's Encrypt, set up log rotation, configure UFW firewall, create deploy user with SSH key access, and set up unattended security updates."

**Output:** Complete Ansible project with:
- `common` role: deploy user, SSH hardening, UFW rules, unattended-upgrades, log rotation
- `nginx` role: install, site configs with SSL via certbot, security headers
- `nodejs` role: install via nvm, systemd service file, PM2 process manager
- `postgresql` role: install, configure primary + streaming replica, pg_hba.conf, automated backups
- `redis` role: install, bind to private IP, set maxmemory policy
- `app-deploy` role: git pull, npm install, restart with zero-downtime (PM2 reload)

### Example 2: Rolling Deployment with Health Checks

**Input:** "Create a deployment playbook that does a rolling deploy across 10 web servers, 3 at a time. Before each batch: drain connections from the load balancer, deploy new code, run health checks, and add back. If any server fails health check, stop the entire deploy and rollback all servers that were already updated."

**Output:** Playbook with `serial: 3`, pre-task LB drain, deploy role with git/npm/restart, post-task health check with retries, and a rescue block that rolls back all already-deployed hosts using a dynamic group built during the play.

## Guidelines

- Use fully qualified collection names: `ansible.builtin.copy` not `copy`
- Always use `ansible-lint` before committing playbooks
- Use roles for reusable logic, playbooks for orchestration
- Prefer `ansible.builtin.template` over `ansible.builtin.copy` when any variable substitution is needed
- Use `become: true` at the play or task level, not in `ansible.cfg` globally
- Set `mode` explicitly on file/template/copy tasks (avoid permission drift)
- Use `validate` parameter on config file tasks to catch syntax errors before applying
- Use `handlers` for service restarts — they run once at the end, not on every task
- Use `tags` generously — they let you run subsets of a playbook (`--tags ssl`)
- Use `--check --diff` for dry runs before applying to production
- Keep secrets in Vault — never plain text in inventory or vars files
- Use `serial` for rolling deploys — never update all servers at once
- Idempotency is sacred — running a playbook twice should produce the same result
- Use `block/rescue/always` for error handling and rollback logic
- Test roles with Molecule before using in production
