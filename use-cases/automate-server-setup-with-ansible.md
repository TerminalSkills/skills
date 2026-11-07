---
title: "Automate Server Setup and App Deployment with Ansible"
slug: automate-server-setup-with-ansible
description: "Replace manual SSH server configuration with Ansible playbooks and roles that provision, harden, and deploy applications across any number of servers reproducibly."
skills: [ansible, security-audit, coding-agent]
category: devops
tags: [ansible, configuration-management, server-setup, deployment, automation]
---

# Automate Server Setup and App Deployment with Ansible

## The Problem

A team manages 12 servers across staging and production. Every new server takes a full day to set up: install packages, configure nginx, set up SSL, create users, configure the firewall, deploy the app, set up monitoring. The process lives in a 47-step wiki page that is always outdated: step 23 references a package that was renamed two years ago, and step 31 was added by someone who left and nobody knows why it is there.

Servers drift. Someone installs a package on one server and forgets the others. Someone tweaks an nginx config directly in production "just this once". Last month a security patch was applied to 10 of 12 servers, and the two missed ones were compromised. Scaling means another day of manual setup per server, and nothing guarantees the new server matches the old ones.

## The Solution

Use **ansible** to turn the wiki into roles and playbooks that give every server the same result. Use **coding-agent** (headless `claude -p`, one narrow task per run) to draft the roles and playbooks, and **security-audit** to scan the automation repository itself (leaked secrets, unencrypted vault files, vulnerable app dependencies) before anything reaches a server. Every generated file is reviewed and run with `--check --diff` first.

## Step-by-Step Walkthrough

### Step 1: Audit Current Servers and Create an Inventory

Understand the current state before writing roles. Group hosts in an inventory and collect facts:

```ini
# inventory/production.ini
[web]
web01 ansible_host=10.0.1.11
web02 ansible_host=10.0.1.12

[api]
api01 ansible_host=10.0.1.21

[postgres]
db01 ansible_host=10.0.2.10

[production:children]
web
api
postgres

[all:vars]
ansible_user=deploy
ansible_ssh_private_key_file=~/.ssh/deploy_ed25519
```

```bash
ansible all -i inventory/production.ini -m ansible.builtin.package_facts
ansible web -i inventory/production.ini -m ansible.builtin.command -a "nginx -v"
ansible all -i inventory/production.ini -m ansible.builtin.command -a "getent passwd" --become
```

Compare the output between hosts that should be identical: nginx versions, patch levels, and local user accounts. In this team's audit the differences were the kind that matter: three web servers on three nginx versions, two servers missing last month's patch, and one unrecognised `dev_temp` account with sudo. The account was locked immediately, and the audit became the argument for doing this properly. Host keys stay verified (do not disable host key checking): add them with `ssh-keyscan` after checking the fingerprints.

### Step 2: Write Roles for Base Server Configuration

Hand each role to the coding agent as a separate, scoped run:

```bash
timeout 900 claude -p "Create roles/common in this Ansible repo for Ubuntu 24.04: deploy user,
SSH hardening as a drop-in /etc/ssh/sshd_config.d/10-hardening.conf (PermitRootLogin no,
PasswordAuthentication no), UFW via community.general.ufw with a deny default and ports from
defaults/main.yml, fail2ban, unattended-upgrades. Use fully qualified module names. Do not touch
other roles." \
  --permission-mode acceptEdits --allowedTools "Read" "Write" "Edit" "Bash(ansible-lint *)" \
  --max-budget-usd 2 --output-format text > /tmp/role-common.log 2>&1
```

Repeat for `nginx`, `nodejs`, `postgresql` and `monitoring`. Things to check in what comes back:

- **Firewall order.** Allow SSH before enabling UFW with `policy: deny`, or the run locks you out of the host. Database ports (5432) are allowed only from the private network range.
- **Node.js.** Node 20 is end-of-life; install Node 24 LTS from the official tarball and let Ansible verify it: `ansible.builtin.get_url` accepts `checksum: "sha256:https://nodejs.org/dist/v24.22.2/SHASUMS256.txt"`. Never pipe a downloaded install script into a shell.
- **PostgreSQL.** Use a supported major (16 is supported until November 2028; 18 is current). Streaming replication needs the replica's `pg_hba.conf` and a replication role; keep `pg_hba.conf` templated from variables so access rules live in the repo. Bind `listen_addresses` to the private interface, never `*`.
- **Certificates.** The certbot package installs its own renewal systemd timer; the role needs to enable it, not reinvent it.
- **Variables, not edits.** Ports, domains and memory limits belong in `defaults/main.yml` and `group_vars`, so a new domain is a three-line change.

Roles are idempotent: a second run reports `changed=0`, which is the test that applying a role to fix drift is safe. Molecule with the Docker driver (`pip install molecule molecule-plugins[docker]`) can check this for package and template roles; roles that manage systemd units, UFW or sysctl need a VM, so test those on a throwaway Hetzner server.

### Step 3: Create the Deployment Playbook with Rolling Updates

Two points are easy to get wrong. With `serial`, `run_once: true` runs once **per batch**, not once overall, so migrations get their own play that runs before the rolling play. That means migrations must be backward compatible with the version still running (add columns first, remove them in a later release). And the Hetzner load balancer is driven with the `hetzner.hcloud` collection (`ansible-galaxy collection install hetzner.hcloud`; token in `HCLOUD_TOKEN`). The module's `server` option takes the Hetzner server name or ID, so each inventory hostname must equal the server's name in Hetzner (otherwise set `server: "{{ hcloud_server_name }}"` per host).

```yaml
# deploy.yml  -- usage: ansible-playbook deploy.yml -e version=v1.2.3
---
- name: Run database migrations once, before any server changes
  hosts: api[0]
  tasks:
    - name: Check out the new release for the migration
      ansible.builtin.git:
        repo: "{{ app_repo }}"
        dest: "{{ app_dir }}/releases/{{ version }}"
        version: "{{ version }}"

    - name: Install dependencies for the migration
      community.general.npm:
        path: "{{ app_dir }}/releases/{{ version }}"
        ci: true

    - name: Run migrations from the new release
      ansible.builtin.command: npm run migrate
      args:
        chdir: "{{ app_dir }}/releases/{{ version }}"
      changed_when: true

- name: Rolling deploy, two servers per batch
  hosts: web
  serial: 2
  any_errors_fatal: true
  tasks:
    - name: Deploy one batch with automatic rollback
      block:
        - name: Remember the running version
          ansible.builtin.command: git -C {{ app_dir }}/current describe --tags --exact-match  # noqa: command-instead-of-module
          register: previous
          changed_when: false

        - name: Take the server out of the load balancer
          hetzner.hcloud.load_balancer_target:
            load_balancer: "{{ lb_name }}"
            type: server
            server: "{{ inventory_hostname }}"
            state: absent
          delegate_to: localhost

        - name: Let in-flight requests finish
          ansible.builtin.pause:
            seconds: 30

        - name: Check out the release tag
          ansible.builtin.git:
            repo: "{{ app_repo }}"
            dest: "{{ app_dir }}/current"
            version: "{{ version }}"

        - name: Install production dependencies
          community.general.npm:
            path: "{{ app_dir }}/current"
            ci: true
            production: true

        - name: Reload PM2 without downtime
          ansible.builtin.command: pm2 reload ecosystem.config.cjs
          args:
            chdir: "{{ app_dir }}/current"
          changed_when: true

        - name: Wait for /health
          ansible.builtin.uri:
            url: "http://{{ ansible_host }}:{{ app_port }}/health"
            status_code: 200
          register: health
          until: health.status == 200
          retries: 10
          delay: 3

        - name: Put the server back in the load balancer
          hetzner.hcloud.load_balancer_target:
            load_balancer: "{{ lb_name }}"
            type: server
            server: "{{ inventory_hostname }}"
            state: present
          delegate_to: localhost

      rescue:
        - name: Roll back to the previous tag
          ansible.builtin.git:
            repo: "{{ app_repo }}"
            dest: "{{ app_dir }}/current"
            version: "{{ previous.stdout }}"
          when: previous is defined and previous.stdout is defined

        - name: Reload PM2 on the old release
          ansible.builtin.command: pm2 reload ecosystem.config.cjs
          args:
            chdir: "{{ app_dir }}/current"
          changed_when: true

        - name: Put the rolled-back server back in the load balancer
          hetzner.hcloud.load_balancer_target:
            load_balancer: "{{ lb_name }}"
            type: server
            server: "{{ inventory_hostname }}"
            state: present
          delegate_to: localhost

        - name: Fail the run after rolling back
          ansible.builtin.fail:
            msg: "Deploy of {{ version }} failed on {{ inventory_hostname }}; rolled back"
```

This file passes `ansible-playbook --syntax-check` on ansible-core 2.21 and `ansible-lint` on the production profile (the only warnings are the `api_token` argument, which the module reads from `HCLOUD_TOKEN`). `any_errors_fatal` stops the whole run after the failing batch is rolled back, so a bad release reaches at most two servers. Run `npm audit --omit=dev --audit-level=high` in the app repository before tagging, as security-audit teaches.

### Step 4: Encrypt Secrets with Ansible Vault

Each environment gets its own vault file. Variables carry a `vault_` prefix and are referenced from plain `group_vars`, so anyone can see which secrets exist without decrypting:

```bash
ansible-vault create inventory/group_vars/production/vault.yml    # prompts for the vault password
ansible-vault edit inventory/group_vars/production/vault.yml
```

```yaml
# inventory/group_vars/production/vars.yml  (plain text)
db_password: "{{ vault_db_password }}"
```

The vault password is read from a file, not from a variable named in a pipeline: Ansible's setting is `ANSIBLE_VAULT_PASSWORD_FILE` (or `vault_password_file` in `ansible.cfg`), and there is no `ANSIBLE_VAULT_PASSWORD` variable. In CI, write the password from the secret store to a temporary file, point `ANSIBLE_VAULT_PASSWORD_FILE` at it, and delete it afterwards. Keep that file out of git. Mark tasks that handle secrets with `no_log: true`.

This is where security-audit earns its place: run `gitleaks dir .` and `gitleaks git .` on the repository, and check that every vault file is really encrypted (`head -1` shows `$ANSIBLE_VAULT;1.1;AES256`), before the first push.

### Step 5: Set Up CI/CD and Drift Detection

- **On pull request:** `pip install ansible-core ansible-lint` then `ansible-lint` and `ansible-playbook site.yml --syntax-check`, plus Molecule for changed roles that it can test.
- **On merge to main:** deploy to staging with `ansible-playbook -i inventory/staging.ini site.yml`.
- **On release tag:** production deploy through a GitHub environment with required reviewers, so a human approves the tag.
- **Weekly:** run `ansible-playbook -i inventory/production.ini site.yml --check --diff` and post any `changed` result to the team channel. Tasks built on `command` or `shell` do not run in check mode and cannot show drift, which is one more reason to use real modules.

A monthly audit playbook can list unauthorised SSH keys (`authorized_keys` content per user), open ports and pending security updates, reported with the host name and the exact remediation.

## Real-World Example

An ops engineer at a 20-person company manages 12 servers by hand. Setup takes a day, two servers missed a security patch, and the wiki is out of date. The audit finds the unknown `dev_temp` account, and the team moves the setup into five roles.

A new server now goes from a bare Ubuntu image to the same state as its peers in the time one `ansible-playbook` run takes (minutes, on the team's own timing), because there is nothing left to remember. A bad release is caught by the health check in its first batch and rolled back before it reaches the other web servers. The weekly `--check --diff` run catches a teammate's manual nginx edit; the fix is a one-line change in `group_vars` that applies to all web servers. The wiki is archived with a pointer to the repo, and `git log` answers what changed, when and why.

## Related Skills

- [ansible](/skills/ansible)
- [security-audit](/skills/security-audit)
- [coding-agent](/skills/coding-agent)
