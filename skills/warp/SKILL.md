---
name: warp
category: Developer Tools
tags: [terminal, cli, workflows, automation, ai, productivity]
version: 1.0.0
author: terminal-skills
---

# Warp — Modern Terminal & Workflow Automation

You are an expert in Warp, the modern terminal built for developer productivity. You help developers create Warp Workflows (shareable command templates), configure Warp Drive for team knowledge sharing, and leverage Warp's AI features and block-based editing for efficient terminal usage.

## Core Capabilities

### Warp Workflows

Create reusable, parameterized command templates:

```yaml
# ~/.warp/workflows/deploy-service.yaml — Parameterized deployment workflow
name: Deploy Service
description: Build and deploy a service to production with health checks
author: DevOps Team
tags: [deploy, production, docker]
command: |-
  echo "🚀 Deploying {{service_name}} to {{environment}}..." &&
  docker build -t {{registry}}/{{service_name}}:{{version}} . &&
  docker push {{registry}}/{{service_name}}:{{version}} &&
  kubectl set image deployment/{{service_name}} \
    {{service_name}}={{registry}}/{{service_name}}:{{version}} \
    -n {{namespace}} &&
  kubectl rollout status deployment/{{service_name}} -n {{namespace}} --timeout=300s &&
  echo "✅ Deployment complete. Running health check..." &&
  curl -sf https://{{service_name}}.{{domain}}/health || \
    (echo "❌ Health check failed! Rolling back..." && \
     kubectl rollout undo deployment/{{service_name}} -n {{namespace}} && exit 1)
arguments:
  - name: service_name
    description: Name of the service to deploy
    default_value: api-server
  - name: environment
    description: Target environment
    default_value: production
  - name: registry
    description: Container registry URL
    default_value: ghcr.io/myorg
  - name: version
    description: Image version tag
    default_value: latest
  - name: namespace
    description: Kubernetes namespace
    default_value: production
  - name: domain
    description: Base domain for health check
    default_value: api.example.com
```

```yaml
# ~/.warp/workflows/git-cleanup.yaml — Clean up old git branches
name: Git Branch Cleanup
description: Delete merged branches locally and remotely
tags: [git, cleanup]
command: |-
  echo "🧹 Cleaning merged branches..." &&
  git fetch --prune &&
  echo "Local merged branches:" &&
  git branch --merged {{base_branch}} | grep -v "{{base_branch}}" | grep -v "^\*" &&
  echo "" &&
  read -p "Delete these local branches? (y/n) " confirm &&
  if [ "$confirm" = "y" ]; then
    git branch --merged {{base_branch}} | grep -v "{{base_branch}}" | grep -v "^\*" | xargs -r git branch -d &&
    echo "✅ Local branches cleaned"
  fi &&
  if [ "{{clean_remote}}" = "true" ]; then
    echo "Remote merged branches:" &&
    git branch -r --merged {{base_branch}} | grep -v "{{base_branch}}" | grep "origin/" | sed 's/origin\///' &&
    read -p "Delete these remote branches? (y/n) " confirm2 &&
    if [ "$confirm2" = "y" ]; then
      git branch -r --merged {{base_branch}} | grep -v "{{base_branch}}" | grep "origin/" | sed 's/origin\///' | xargs -r -I{} git push origin --delete {} &&
      echo "✅ Remote branches cleaned"
    fi
  fi
arguments:
  - name: base_branch
    description: Base branch to compare against
    default_value: main
  - name: clean_remote
    description: Also clean remote branches (true/false)
    default_value: "false"
```

```yaml
# ~/.warp/workflows/db-ops.yaml — Database operations workflow
name: Database Operations
description: Common database tasks with safety checks
tags: [database, postgres, backup]
command: |-
  {{#if (eq operation "backup")}}
    echo "📦 Backing up {{db_name}} on {{host}}..." &&
    pg_dump -h {{host}} -U {{user}} -d {{db_name}} \
      --format=custom --compress=9 \
      -f "backup_{{db_name}}_$(date +%Y%m%d_%H%M%S).dump" &&
    echo "✅ Backup complete: backup_{{db_name}}_$(date +%Y%m%d_%H%M%S).dump"
  {{else if (eq operation "restore")}}
    echo "⚠️  Restoring {{db_name}} from {{backup_file}}..." &&
    echo "This will OVERWRITE the current database!" &&
    read -p "Continue? (yes/no) " confirm &&
    if [ "$confirm" = "yes" ]; then
      pg_restore -h {{host}} -U {{user}} -d {{db_name}} \
        --clean --if-exists {{backup_file}} &&
      echo "✅ Restore complete"
    fi
  {{else if (eq operation "stats")}}
    psql -h {{host}} -U {{user}} -d {{db_name}} -c "
      SELECT schemaname, relname, n_tup_ins, n_tup_upd, n_tup_del,
             pg_size_pretty(pg_total_relation_size(relid)) as total_size
      FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 20;"
  {{/if}}
arguments:
  - name: operation
    description: "Operation: backup, restore, or stats"
    default_value: backup
  - name: db_name
    description: Database name
  - name: host
    description: Database host
    default_value: localhost
  - name: user
    description: Database user
    default_value: postgres
  - name: backup_file
    description: Backup file path (for restore)
    default_value: ""
```

### Warp Drive — Team Knowledge Base

Share workflows and snippets with your team:

```yaml
# Team-shared workflow: New Developer Onboarding
# Stored in Warp Drive, accessible to all team members
name: New Dev Environment Setup
description: Set up local development environment from scratch
tags: [onboarding, setup]
command: |-
  echo "🔧 Setting up development environment..." &&

  # Clone all required repositories
  echo "📥 Cloning repositories..." &&
  mkdir -p ~/projects &&
  cd ~/projects &&
  git clone git@github.com:{{org}}/api.git &&
  git clone git@github.com:{{org}}/frontend.git &&
  git clone git@github.com:{{org}}/infrastructure.git &&

  # Install dependencies
  echo "📦 Installing dependencies..." &&
  cd api && npm install && cd .. &&
  cd frontend && npm install && cd .. &&

  # Set up local services
  echo "🐳 Starting Docker services..." &&
  cd infrastructure &&
  docker compose -f docker-compose.local.yml up -d &&

  # Run database migrations
  echo "🗄️ Running migrations..." &&
  cd ../api &&
  npm run db:migrate &&
  npm run db:seed &&

  # Verify everything works
  echo "🧪 Running smoke tests..." &&
  npm run test:smoke &&

  echo "✅ Environment ready! Start the API: cd api && npm run dev"
arguments:
  - name: org
    description: GitHub organization
    default_value: mycompany
```

### Custom Themes

```yaml
# ~/.warp/themes/custom-theme.yaml — Custom terminal theme
name: Midnight Dev
accent: "#7c3aed"
background: "#0f172a"
foreground: "#e2e8f0"
details: darker
terminal_colors:
  normal:
    black: "#1e293b"
    red: "#ef4444"
    green: "#22c55e"
    yellow: "#eab308"
    blue: "#3b82f6"
    magenta: "#a855f7"
    cyan: "#06b6d4"
    white: "#f1f5f9"
  bright:
    black: "#475569"
    red: "#f87171"
    green: "#4ade80"
    yellow: "#facc15"
    blue: "#60a5fa"
    magenta: "#c084fc"
    cyan: "#22d3ee"
    white: "#f8fafc"
```

### Launch Configurations

Configure how Warp starts and behaves:

```yaml
# ~/.warp/launch_configurations.yaml — Startup configurations
configurations:
  - name: Full Stack Dev
    tabs:
      - title: API Server
        directory: ~/projects/api
        command: npm run dev
      - title: Frontend
        directory: ~/projects/frontend
        command: npm run dev
      - title: Logs
        directory: ~/projects
        command: docker compose logs -f
      - title: Shell
        directory: ~/projects

  - name: DevOps
    tabs:
      - title: Cluster
        command: kubectl get pods -w --all-namespaces
      - title: Monitoring
        command: watch -n 5 'kubectl top pods'
      - title: Logs
        command: stern -n production "api-*" --tail 100
      - title: Shell
        directory: ~/infrastructure
```

## Warp Features for Developers

### Block-Based Editing
Warp treats each command and its output as a "block." This means you can:
- Select and copy just the output of a command (not the prompt)
- Share a block with teammates (includes command + output)
- Navigate between blocks with Ctrl+Shift+↑/↓
- Search command output with Cmd+F within a block

### AI Command Search
Type `#` in Warp to search for commands using natural language:
- `# find all files larger than 100MB` → `find / -type f -size +100M`
- `# compress this directory as tar.gz` → `tar -czf archive.tar.gz directory/`
- `# show disk usage sorted by size` → `du -sh * | sort -rh`

### Notebooks
Interactive documents that combine Markdown explanations with runnable commands:
```markdown
# Database Maintenance Runbook

## 1. Check current connections
​```bash
psql -c "SELECT count(*) FROM pg_stat_activity;"
​```

## 2. Run VACUUM on large tables
​```bash
psql -c "VACUUM (VERBOSE, ANALYZE) large_table;"
​```
```

## Best Practices

1. **Parameterize everything** — Use `{{variables}}` in workflows; never hardcode values that change between environments
2. **Add descriptions** — Every workflow and argument needs a description; team members shouldn't guess what things do
3. **Use Warp Drive for team knowledge** — Shared workflows reduce tribal knowledge and onboarding time
4. **Launch configs for projects** — Define multi-tab setups per project so starting work is one click
5. **Tag workflows consistently** — Use tags like `deploy`, `database`, `git`, `debug` for quick filtering
6. **Safety prompts for destructive ops** — Add `read -p "Continue? (y/n)"` before any data-modifying operation
7. **Version your workflows** — Store workflows in your team's git repo; symlink to `~/.warp/workflows/`
8. **Notebooks for runbooks** — Incident response and maintenance procedures work better as Warp Notebooks than wiki pages
