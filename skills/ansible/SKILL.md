---
name: ansible
description: >-
  Ansible is an agentless automation tool that configures servers and deploys applications over SSH from YAML playbooks. Use when the user needs to write playbooks, manage inventory, create roles, protect secrets with Ansible Vault, or run rolling multi-server deployments across environments.
license: Apache-2.0
compatibility: 'Controller: Linux/macOS with Python 3.12+ (ansible 14 / ansible-core 2.21); managed nodes: SSH and Python'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  repository: https://github.com/ansible/ansible
  tags:
    - ansible
    - configuration-management
    - automation
    - infrastructure
    - devops
---

# Ansible

## Overview

Ansible connects to managed nodes over SSH (no agent) and runs tasks from YAML playbooks. Tasks are idempotent: a second run changes nothing if the host already matches. This skill covers installation, inventory, playbooks, roles, Vault, configuration and the everyday commands. Use fully qualified module names (`ansible.builtin.apt`, `ansible.posix.synchronize`, `community.general.ufw`) so playbooks keep working when collections are split or renamed.

## Instructions

### Install

```bash
pipx install ansible          # full package: ansible-core plus the community collections
# or: pip install ansible     # inside a virtualenv
ansible --version             # ansible-core 2.21 needs Python 3.12+ on the controller
```

Targets need Python (set `ansible_python_interpreter` if auto-discovery picks the wrong one). Ansible does not run its control node on Windows.

### Inventory

```ini
# inventory/production.ini
[webservers]
web01.acme-shop.net ansible_host=10.0.1.10
web02.acme-shop.net ansible_host=10.0.1.11

[databases]
db01.acme-shop.net ansible_host=10.0.2.10

[production:children]
webservers
databases

[all:vars]
ansible_user=deploy
ansible_ssh_private_key_file=~/.ssh/deploy_ed25519
```

Variables for the `production` group live in `inventory/group_vars/production/` (next to the inventory, so every playbook loads them). Check with `ansible-inventory -i inventory/production.ini --list --yaml` and `ansible all -m ansible.builtin.ping`.

### Playbook

```yaml
# playbooks/webserver.yml
---
- name: Configure web servers
  hosts: webservers
  become: true
  vars:
    nginx_port: 80
    app_root: /var/www/app

  tasks:
    - name: Install nginx
      ansible.builtin.apt:
        name: nginx
        state: present
        update_cache: true
        cache_valid_time: 3600

    - name: Deploy site configuration
      ansible.builtin.template:
        src: templates/nginx.conf.j2
        dest: /etc/nginx/sites-available/default
        owner: root
        group: root
        mode: "0644"
      notify: Reload nginx

    - name: Create the app directory
      ansible.builtin.file:
        path: "{{ app_root }}"
        state: directory
        owner: www-data
        group: www-data
        mode: "0755"

    - name: Copy application files
      ansible.posix.synchronize:
        src: files/app/
        dest: "{{ app_root }}/"
      notify: Reload nginx

    - name: Make sure nginx runs at boot
      ansible.builtin.service:
        name: nginx
        state: started
        enabled: true

  handlers:
    - name: Reload nginx
      ansible.builtin.service:
        name: nginx
        state: reloaded
```

Handlers run once at the end of the play, only if a notifying task changed something.

Rolling deployment with a health check before the next batch:

```yaml
# playbooks/deploy-app.yml
---
- name: Deploy application
  hosts: webservers
  become: true
  serial: 2
  max_fail_percentage: 25

  pre_tasks:
    - name: Take the host out of the load balancer
      ansible.builtin.uri:
        url: "http://lb.acme-shop.net/api/deregister/{{ inventory_hostname }}"
        method: POST
        headers:
          Authorization: "Bearer {{ lb_api_token }}"
      delegate_to: localhost
      become: false

  roles:
    - role: app_deploy
      vars:
        app_version: "{{ deploy_version | default('latest') }}"

  post_tasks:
    - name: Wait for the health check
      ansible.builtin.uri:
        url: "http://{{ inventory_hostname }}:{{ app_port }}/health"
        status_code: 200
      register: health
      until: health.status == 200
      retries: 5
      delay: 10
      delegate_to: localhost
      become: false

    - name: Put the host back
      ansible.builtin.uri:
        url: "http://lb.acme-shop.net/api/register/{{ inventory_hostname }}"
        method: POST
        headers:
          Authorization: "Bearer {{ lb_api_token }}"
      delegate_to: localhost
      become: false
```

### Roles

Layout: `roles/common/{tasks,handlers,defaults,templates,files}/`. Use underscores in role names.

```yaml
# roles/common/tasks/main.yml
---
- name: Set the timezone
  community.general.timezone:
    name: "{{ server_timezone }}"

- name: Install baseline packages
  ansible.builtin.apt:
    name: [curl, vim, htop, unzip, jq, fail2ban]
    state: present

- name: Allow required ports
  community.general.ufw:
    rule: allow
    port: "{{ item }}"
    proto: tcp
  loop: "{{ allowed_ports }}"

- name: Enable the firewall (port 22 is allowed above)
  community.general.ufw:
    state: enabled
    policy: deny
```

```yaml
# roles/common/defaults/main.yml
---
server_timezone: UTC
allowed_ports: ["22", "80", "443"]
```


### Vault

```bash
ansible-vault create inventory/group_vars/production/vault.yml     # prompts for a password
ansible-vault edit inventory/group_vars/production/vault.yml
ansible-vault encrypt_string --vault-password-file ~/.vault_pass 'Zk3p9-rT7q' --name vault_db_password
ansible-playbook playbooks/site.yml --ask-vault-pass
ansible-playbook playbooks/site.yml --vault-password-file ~/.vault_pass   # CI: file from a secret store
```

```yaml
# inventory/group_vars/production/vault.yml (the file on disk is encrypted; this is what it contains)
vault_db_password: Zk3p9-rT7q
vault_api_key: 5d41402abc4b2a76b9719d911017c592
```

```yaml
# inventory/group_vars/production/vars.yml (plain; refers to the vault names)
db_password: "{{ vault_db_password }}"
api_key: "{{ vault_api_key }}"
```

### Configuration

```ini
# ansible.cfg
[defaults]
inventory = inventory/
roles_path = roles/
result_format = yaml
forks = 20
timeout = 30

[privilege_escalation]
become_method = sudo

[ssh_connection]
pipelining = true
```

`result_format = yaml` prints task results as YAML. The old `stdout_callback = yaml` needs community.general, which dropped that plugin, so avoid it. Leave host key checking on (the default); add hosts with `ssh-keyscan` after verifying the fingerprints, or use `ansible_ssh_common_args='-o StrictHostKeyChecking=accept-new'` for a first connection only.

### Everyday commands

```bash
ansible-playbook -i inventory/production.ini playbooks/webserver.yml
ansible-playbook playbooks/webserver.yml --limit web01.acme-shop.net
ansible-playbook playbooks/webserver.yml --check --diff     # dry run with diffs
ansible-playbook playbooks/deploy-app.yml -e "deploy_version=2.1.0"
ansible-playbook playbooks/site.yml --syntax-check
ansible webservers -m ansible.builtin.command -a "uptime"
```


```yaml
- name: Create users from a list
  ansible.builtin.user:
    name: "{{ item.name }}"
    groups: "{{ item.groups | join(',') }}"
    shell: "{{ item.shell | default('/bin/bash') }}"
  loop: "{{ users }}"
  loop_control:
    label: "{{ item.name }}"      # keeps logs short; use no_log: true only when values are secret
  when: ansible_facts['os_family'] == "Debian"
```

## Examples

### Example 1: "Set up nginx on my two web servers"

```console
$ ansible-playbook -i inventory/production.ini playbooks/webserver.yml --check --diff
$ ansible-playbook -i inventory/production.ini playbooks/webserver.yml
PLAY RECAP *********************************************************
web01.acme-shop.net : ok=7 changed=5 unreachable=0 failed=0
web02.acme-shop.net : ok=7 changed=5 unreachable=0 failed=0
```

The check run shows the planned diffs first; the real run installs and configures nginx. A second run reports `changed=0`.

### Example 2: "Deploy version 2.1.0 two servers at a time"

```bash
ansible-playbook playbooks/deploy-app.yml -e "deploy_version=2.1.0" --vault-password-file ~/.vault_pass
```

`serial: 2` upgrades two hosts per batch, and a failed health check stops the rollout once more than 25% of a batch failed.

## Guidelines

- Use `ansible.builtin.*` names and declare non-core collections (`ansible.posix`, `community.general`) in `collections/requirements.yml`, installed with `ansible-galaxy collection install -r`.
- Prefer modules over `shell`/`command`; when you must use them, add `creates:` or `changed_when:` so runs stay idempotent.
- Commit vault-encrypted files only; keep the vault password outside the repository. Hide secrets in output with `no_log: true`.
- Always try `--check --diff` and `--limit` on one host before a full production run.
- Do not turn off host key checking in shared configuration files.
- For one-off changes on a single host a plain SSH session is simpler; use Ansible when the same change must repeat across hosts.
