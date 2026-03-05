---
name: fig
description: Expert guidance for Amazon Q Developer (formerly Fig), the terminal tool that provides IDE-style autocomplete, AI chat, and CLI builder capabilities. Helps developers create custom completion specs, build CLI tools with autocomplete, and configure terminal productivity features.
license: Apache-2.0
compatibility: No special requirements
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags:
  - terminal
  - autocomplete
  - cli
  - dotfiles
  - scripts
---

# Amazon Q (formerly Fig) — Terminal Autocomplete & CLI Tools


## Overview

You are an expert in Amazon Q Developer (formerly Fig), the terminal tool that provides IDE-style autocomplete, AI chat, and CLI builder capabilities. You help developers create custom completion specs, build CLI tools with autocomplete, and configure terminal productivity features.

## Instructions

### Custom Completion Specs

Define autocomplete for your own CLI tools:

```typescript
// src/my-cli.ts — Completion spec for a custom CLI tool
const completionSpec: Fig.Spec = {
  name: "deploy",
  description: "Deploy services to cloud infrastructure",
  subcommands: [
    {
      name: "create",
      description: "Create a new deployment",
      args: {
        name: "service",
        description: "Service name to deploy",
        // Dynamic suggestions from an API or command output
        generators: {
          script: ["bash", "-c", "ls services/"],
          postProcess: (output) =>
            output.split("\n").filter(Boolean).map((name) => ({
              name,
              description: `Deploy ${name} service`,
              icon: "📦",
            })),
        },
      },
      options: [
        {
          name: ["--env", "-e"],
          description: "Target environment",
          args: {
            name: "environment",
            suggestions: [
              { name: "staging", description: "Staging environment", icon: "🟡" },
              { name: "production", description: "Production environment", icon: "🔴" },
              { name: "development", description: "Development environment", icon: "🟢" },
            ],
          },
          isRequired: true,
        },
        {
          name: ["--replicas", "-r"],
          description: "Number of replicas",
          args: { name: "count", default: "2" },
        },
        {
          name: "--dry-run",
          description: "Preview changes without deploying",
        },
        {
          name: ["--tag", "-t"],
          description: "Docker image tag",
          args: {
            name: "tag",
            generators: {
              // Suggest recent git tags
              script: ["bash", "-c", "git tag --sort=-version:refname | head -10"],
              postProcess: (output) =>
                output.split("\n").filter(Boolean).map((tag) => ({
                  name: tag,
                  icon: "🏷️",
                })),
            },
          },
        },
      ],
    },
    {
      name: "status",
      description: "Check deployment status",
      args: {
        name: "service",
        isOptional: true,
        generators: {
          script: ["bash", "-c", "kubectl get deployments -o jsonpath='{.items[*].metadata.name}'"],
          splitOn: " ",
        },
      },
      options: [
        {
          name: ["--watch", "-w"],
          description: "Watch status in real-time",
        },
        {
          name: "--format",
          description: "Output format",
          args: {
            suggestions: ["table", "json", "yaml"],
          },
        },
      ],
    },
    {
      name: "rollback",
      description: "Rollback to previous version",
      isDangerous: true,    // Shows warning icon
      args: {
        name: "service",
        generators: {
          script: ["bash", "-c", "kubectl get deployments -o jsonpath='{.items[*].metadata.name}'"],
          splitOn: " ",
        },
      },
      options: [
        {
          name: "--revision",
          description: "Specific revision to rollback to",
          args: {
            name: "revision",
            generators: {
              // Dynamic: list revision history for the selected service
              script: ({ tokens }) => {
                const service = tokens[2]; // deploy rollback <service>
                return ["bash", "-c", `kubectl rollout history deployment/${service} | tail -n +3 | awk '{print $1}'`];
              },
              postProcess: (output) =>
                output.split("\n").filter(Boolean).map((rev) => ({
                  name: rev,
                  description: `Revision ${rev}`,
                })),
            },
          },
        },
      ],
    },
    {
      name: "logs",
      description: "View deployment logs",
      args: {
        name: "service",
        generators: {
          script: ["bash", "-c", "kubectl get deployments -o jsonpath='{.items[*].metadata.name}'"],
          splitOn: " ",
        },
      },
      options: [
        { name: ["--follow", "-f"], description: "Stream logs in real-time" },
        { name: "--since", description: "Show logs since duration", args: { suggestions: ["1m", "5m", "1h", "24h"] } },
        { name: "--tail", description: "Number of recent lines", args: { name: "lines", default: "100" } },
      ],
    },
  ],
  options: [
    {
      name: ["--verbose", "-v"],
      description: "Enable verbose output",
      isPersistent: true,    // Available on all subcommands
    },
    {
      name: "--config",
      description: "Path to config file",
      isPersistent: true,
      args: { template: "filepaths" },   // File path autocomplete
    },
  ],
};

export default completionSpec;
```

### Dotfile Scripts

Create portable shell scripts that run across machines:

```bash
# ~/.fig/scripts/setup-project.sh — Reusable project setup script
#!/bin/bash
# Fig script: Initialize a new TypeScript project with standard tooling

set -euo pipefail

PROJECT_NAME=${1:?"Usage: fig run setup-project <name>"}

echo "📁 Creating project: $PROJECT_NAME"
mkdir -p "$PROJECT_NAME" && cd "$PROJECT_NAME"

# Initialize with package.json
cat > package.json << EOF
{
  "name": "$PROJECT_NAME",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsup src/index.ts",
    "lint": "biome check .",
    "format": "biome format --write .",
    "test": "vitest"
  }
}
EOF

# Install dependencies
pnpm install typescript tsx tsup vitest @biomejs/biome

# TypeScript config
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true
  },
  "include": ["src"]
}
EOF

# Biome config
cat > biome.json << 'EOF'
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "organizeImports": { "enabled": true },
  "linter": { "enabled": true },
  "formatter": { "indentStyle": "space", "indentWidth": 2 }
}
EOF

# Create entry point
mkdir -p src
cat > src/index.ts << 'EOF'
console.log("Hello from $PROJECT_NAME!");
EOF

# Git init
git init
echo "node_modules/\ndist/\n.env" > .gitignore

echo "✅ Project $PROJECT_NAME created!"
echo "   cd $PROJECT_NAME && pnpm dev"
```

### SSH Integration

Auto-complete for remote servers:

```typescript
// src/ssh-hosts.ts — Dynamic SSH host suggestions
const sshSpec: Fig.Spec = {
  name: "ssh",
  args: {
    name: "destination",
    generators: {
      // Parse SSH config for host suggestions
      script: ["bash", "-c", `
        grep "^Host " ~/.ssh/config 2>/dev/null | awk '{print $2}' | grep -v '*'
      `],
      postProcess: (output) =>
        output.split("\n").filter(Boolean).map((host) => ({
          name: host,
          description: "SSH host from config",
          icon: "🖥️",
          priority: 80,
        })),
    },
  },
};
```

## Installation

```bash
# macOS
brew install amazon-q

# Or direct download from https://aws.amazon.com/q/developer/

# Login and configure
q login
q settings
```


## Examples

### Example 1

**User request:** "Help me set up Fig"

The agent follows the instructions above to configure Fig with recommended settings, handling dependencies and environment setup.

### Example 2

**User request:** "Debug an issue with my Fig configuration"

The agent diagnoses common configuration problems, checks logs, validates settings, and suggests fixes based on the guidelines above.


## Guidelines

1. **Generators for dynamic suggestions** — Use shell scripts to generate suggestions from live data (git branches, k8s resources, file lists)
2. **Mark dangerous commands** — Set `isDangerous: true` on destructive subcommands (delete, drop, rollback)
3. **Use templates for common arg types** — `template: "filepaths"` for file args, `template: "folders"` for directories
4. **Persistent options** — Use `isPersistent: true` for flags like `--verbose` that apply to all subcommands
5. **Icons and descriptions** — Add icons and descriptions to suggestions; visual cues speed up selection
6. **Publish to the spec repo** — Share your completion specs via the fig/autocomplete GitHub repo for community use
7. **Test with `fig settings developer.enabled true`** — Enable developer mode for spec debugging and hot reload
8. **Dotfile scripts for portability** — Store setup scripts in `~/.fig/scripts/`; they sync across machines via Fig's dotfile management
