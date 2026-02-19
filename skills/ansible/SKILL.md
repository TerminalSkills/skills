---
name: ansible
description: >-
  Configuration management and automation with Ansible. Use when the user needs
  to write playbooks, manage inventory, create roles, use Ansible Vault for
  secrets, or orchestrate multi-server deployments across environments.
license: Apache-2.0
compatibility:
  - linux
  - macos
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
    - ansible
    - configuration-management
    - automation
    - infrastructure
    - devops
---

# Ansible

Ansible is an agentless automation tool for configuration management, application deployment, and orchestration. It uses SSH to connect to managed nodes and executes tasks defined in YAML playbooks.

## Installation

```bash
# Install Ansible via pip
pip install ansible

# Verify installation
ansible --version
```

## Inventory Management

```ini
# inventory/production.ini — Production inventory with groups
[webservers]
web1.example.com ansible_host=10.0.1.10
web2.example.com ansible_host=10.0.1.11

[databases]
db1.example.com ansible_host=10.0.2.10

[all:vars]
ansible_user=deploy
ansible_ssh_private_key_file=~/.ssh/deploy_key
ansible_python_interpreter=/usr/bin/python3
```

```yaml
# inventory/dynamic_aws.yml — Dynamic AWS EC2 inventory plugin
plugin: amazon.aws.aws_ec2
regions:
  - us-east-1
  - us-west-2
keyed_groups:
  - key: tags.Environment
    prefix: env
  - key: instance_type
    prefix: type
filters:
  tag:Managed: ansible
compose:
  ansible_host: private_ip_address
```

## Playbooks

```yaml
# playbooks/webserver.yml — Configure Nginx web servers
---
- name: Configure web servers
  hosts: webservers
  become: true
  vars:
    nginx_port: 80
    app_root: /var/www/app

  pre_tasks:
    - name: Update apt cache
      apt:
        update_cache: true
        cache_valid_time: 3600

  tasks:
    - name: Install Nginx
      apt:
        name: nginx
        state: present

    - name: Deploy Nginx configuration
      template:
        src: templates/nginx.conf.j2
        dest: /etc/nginx/sites-available/default
        owner: root
        group: root
        mode: "0644"
      notify: Restart Nginx

    - name: Ensure app directory exists
      file:
        path: "{{ app_root }}"
        state: directory
        owner: www-data
        group: www-data
        mode: "0755"

    - name: Deploy application files
      synchronize:
        src: files/app/
        dest: "{{ app_root }}/"
      notify: Restart Nginx

    - name: Ensure Nginx is running
      service:
        name: nginx
        state: started
        enabled: true

  handlers:
    - name: Restart Nginx
      service:
        name: nginx
        state: restarted
```

```yaml
# playbooks/deploy-app.yml — Rolling deployment with serial execution
---
- name: Deploy application
  hosts: webservers
  become: true
  serial: 2
  max_fail_percentage: 25

  pre_tasks:
    - name: Remove from load balancer
      uri:
        url: "http://lb.example.com/api/deregister/{{ inventory_hostname }}"
        method: POST

  roles:
    - role: app-deploy
      vars:
        app_version: "{{ deploy_version | default('latest') }}"

  post_tasks:
    - name: Health check
      uri:
        url: "http://{{ inventory_hostname }}:{{ app_port }}/health"
        status_code: 200
      retries: 5
      delay: 10

    - name: Re-register with load balancer
      uri:
        url: "http://lb.example.com/api/register/{{ inventory_hostname }}"
        method: POST
```

## Roles

```yaml
# roles/common/tasks/main.yml — Common server baseline role
---
- name: Set timezone
  timezone:
    name: "{{ server_timezone | default('UTC') }}"

- name: Install common packages
  apt:
    name:
      - curl
      - wget
      - vim
      - htop
      - unzip
      - jq
      - fail2ban
    state: present

- name: Configure SSH hardening
  template:
    src: sshd_config.j2
    dest: /etc/ssh/sshd_config
    validate: sshd -t -f %s
  notify: Restart SSH

- name: Configure firewall rules
  ufw:
    rule: allow
    port: "{{ item }}"
    proto: tcp
  loop: "{{ allowed_ports | default(['22']) }}"

- name: Enable UFW
  ufw:
    state: enabled
    policy: deny
```

```yaml
# roles/common/defaults/main.yml — Default variables for common role
---
server_timezone: UTC
allowed_ports:
  - "22"
  - "80"
  - "443"
ntp_servers:
  - 0.pool.ntp.org
  - 1.pool.ntp.org
```

## Ansible Vault

```bash
# Create encrypted variables file
ansible-vault create group_vars/production/vault.yml

# Encrypt existing file
ansible-vault encrypt secrets.yml

# Edit encrypted file
ansible-vault edit group_vars/production/vault.yml

# Run playbook with vault password
ansible-playbook site.yml --ask-vault-pass

# Use password file (for CI/CD)
ansible-playbook site.yml --vault-password-file ~/.vault_pass
```

```yaml
# group_vars/production/vault.yml — Encrypted production secrets
---
vault_db_password: supersecretpassword
vault_api_key: abc123def456
vault_ssl_cert: |
  -----BEGIN CERTIFICATE-----
  ...
  -----END CERTIFICATE-----
```

```yaml
# group_vars/production/vars.yml — Reference vault variables with prefix
---
db_password: "{{ vault_db_password }}"
api_key: "{{ vault_api_key }}"
```

## Configuration

```ini
# ansible.cfg — Project-level Ansible configuration
[defaults]
inventory = inventory/
roles_path = roles/
retry_files_enabled = false
host_key_checking = false
stdout_callback = yaml
forks = 20
timeout = 30

[privilege_escalation]
become = true
become_method = sudo
become_ask_pass = false

[ssh_connection]
pipelining = true
ssh_args = -o ControlMaster=auto -o ControlPersist=60s
```

## Common Commands

```bash
# Run playbook against specific inventory
ansible-playbook -i inventory/production.ini playbooks/webserver.yml

# Limit to specific hosts
ansible-playbook playbooks/deploy.yml --limit web1.example.com

# Dry run (check mode)
ansible-playbook playbooks/deploy.yml --check --diff

# Run ad-hoc commands
ansible webservers -m shell -a "uptime"
ansible all -m ping

# List hosts in a group
ansible-inventory --list --yaml

# Run with extra variables
ansible-playbook deploy.yml -e "deploy_version=2.1.0 env=production"

# Tags for selective execution
ansible-playbook site.yml --tags "configuration,packages"
ansible-playbook site.yml --skip-tags "slow_tasks"
```

## Jinja2 Templates

```nginx
# templates/nginx.conf.j2 — Nginx virtual host template
server {
    listen {{ nginx_port }};
    server_name {{ ansible_fqdn }};
    root {{ app_root }};

    {% if ssl_enabled | default(false) %}
    listen 443 ssl;
    ssl_certificate {{ ssl_cert_path }};
    ssl_certificate_key {{ ssl_key_path }};
    {% endif %}

    location / {
        proxy_pass http://127.0.0.1:{{ app_port }};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    access_log /var/log/nginx/{{ inventory_hostname }}_access.log;
    error_log /var/log/nginx/{{ inventory_hostname }}_error.log;
}
```

## Conditionals and Loops

```yaml
# playbooks/conditional-tasks.yml — Tasks with conditionals and loops
---
- name: Conditional and loop examples
  hosts: all
  become: true
  tasks:
    - name: Install packages based on OS family
      apt:
        name: "{{ item }}"
        state: present
      loop: "{{ debian_packages }}"
      when: ansible_os_family == "Debian"

    - name: Create users from list
      user:
        name: "{{ item.name }}"
        groups: "{{ item.groups | join(',') }}"
        shell: "{{ item.shell | default('/bin/bash') }}"
        state: present
      loop: "{{ users }}"
      no_log: true

    - name: Wait for service readiness
      uri:
        url: "http://localhost:{{ app_port }}/health"
      register: health
      until: health.status == 200
      retries: 10
      delay: 5
```
