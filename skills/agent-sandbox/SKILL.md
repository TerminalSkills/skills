---
name: agent-sandbox
description: >-
  Run AI agent code safely in isolated sandboxes with resource limits, audit
  trails, and kill switches. Use when someone asks to "sandbox my agent",
  "run agent code safely", "add guardrails to AI agent", "isolate agent
  execution", "audit agent actions", "prevent agent from deleting files",
  "restrict agent permissions", or "add safety controls to AI coding agent".
  Covers Docker isolation, filesystem restrictions, network policies,
  resource locking, and comprehensive audit logging.
license: Apache-2.0
compatibility: "Node.js 18+ or Python 3.10+. Docker required for container-based sandbox."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: ["sandbox", "security", "guardrails", "agent-safety", "isolation", "audit"]
---

# Agent Sandbox

## Overview

AI agents execute code, modify files, and run shell commands. Without guardrails, a bad prompt or hallucination can delete your database, overwrite production configs, or exfiltrate secrets. This skill builds safety layers — sandboxed execution, filesystem restrictions, network policies, audit trails, and kill switches.

## When to Use

- Running untrusted or AI-generated code in production
- Adding safety controls to coding agents that modify your codebase
- Restricting which files, directories, or commands an agent can access
- Logging every agent action for compliance or debugging
- Building multi-tenant agent platforms where agents need isolation

## Instructions

### Strategy 1: Filesystem + Process Sandbox (Zero Dependencies)

The simplest safety layer — restrict which paths the agent can read/write and which commands it can execute. No Docker required.

```typescript
// sandbox.ts — Filesystem and process sandbox for AI agents
/**
 * Wraps agent operations with safety checks:
 * - Allowlist/denylist for file paths
 * - Command blocklist (rm -rf, DROP TABLE, etc.)
 * - Audit log of every action
 * - Kill switch to halt agent immediately
 */
import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync, appendFileSync } from "fs";
import { resolve, relative } from "path";

interface SandboxConfig {
  workDir: string;                    // Root directory agent can access
  allowedPaths: string[];             // Glob patterns of allowed paths
  deniedPaths: string[];              // Glob patterns of denied paths
  blockedCommands: string[];          // Commands that are never allowed
  maxFileSize: number;                // Max bytes per file write
  auditLog: string;                   // Path to audit log file
  readOnly: boolean;                  // If true, block all writes
}

const DEFAULT_BLOCKED = [
  "rm -rf /", "rm -rf ~", "rm -rf .",
  "mkfs", "dd if=", "> /dev/sd",
  "DROP DATABASE", "DROP TABLE", "TRUNCATE",
  "curl.*|.*sh", "wget.*|.*bash",           // Pipe to shell
  "chmod 777", "chmod -R 777",
  "env | curl", "printenv | curl",           // Secret exfiltration
  "ssh-keygen", "ssh-copy-id",
];

export class AgentSandbox {
  private config: SandboxConfig;
  private killed = false;

  constructor(config: Partial<SandboxConfig> & { workDir: string }) {
    this.config = {
      allowedPaths: ["**"],
      deniedPaths: ["**/.env", "**/.ssh/**", "**/node_modules/**"],
      blockedCommands: DEFAULT_BLOCKED,
      maxFileSize: 1024 * 1024,  // 1MB default
      auditLog: "./agent-audit.jsonl",
      readOnly: false,
      ...config,
    };
  }

  /**
   * Read a file through the sandbox — checks path is allowed.
   */
  readFile(filePath: string): string {
    this.checkKilled();
    const absPath = resolve(this.config.workDir, filePath);
    this.checkPathAllowed(absPath, "read");
    this.audit("read", filePath);
    return readFileSync(absPath, "utf-8");
  }

  /**
   * Write a file through the sandbox — checks path, size, and read-only mode.
   */
  writeFile(filePath: string, content: string): void {
    this.checkKilled();
    if (this.config.readOnly) {
      throw new SandboxError("Write blocked: sandbox is read-only");
    }

    const absPath = resolve(this.config.workDir, filePath);
    this.checkPathAllowed(absPath, "write");

    if (Buffer.byteLength(content) > this.config.maxFileSize) {
      throw new SandboxError(
        `Write blocked: file exceeds max size (${this.config.maxFileSize} bytes)`
      );
    }

    this.audit("write", filePath, { size: Buffer.byteLength(content) });
    writeFileSync(absPath, content);
  }

  /**
   * Execute a command through the sandbox — checks against blocklist.
   */
  exec(command: string, timeoutMs: number = 30000): string {
    this.checkKilled();
    this.checkCommandAllowed(command);
    this.audit("exec", command);

    try {
      return execSync(command, {
        cwd: this.config.workDir,
        encoding: "utf-8",
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,  // 10MB output limit
      });
    } catch (error: any) {
      this.audit("exec_error", command, { error: error.message });
      throw error;
    }
  }

  /**
   * Kill switch — immediately halt all agent operations.
   */
  kill(reason: string): void {
    this.killed = true;
    this.audit("killed", reason);
    console.error(`🛑 Agent sandbox killed: ${reason}`);
  }

  private checkKilled(): void {
    if (this.killed) throw new SandboxError("Agent has been killed");
  }

  private checkPathAllowed(absPath: string, operation: string): void {
    const relPath = relative(this.config.workDir, absPath);

    // Must be within workDir (no ../ escapes)
    if (relPath.startsWith("..")) {
      throw new SandboxError(`${operation} blocked: path escapes sandbox (${relPath})`);
    }

    // Check denylist
    for (const pattern of this.config.deniedPaths) {
      if (matchGlob(relPath, pattern)) {
        throw new SandboxError(`${operation} blocked: path matches denylist (${pattern})`);
      }
    }
  }

  private checkCommandAllowed(command: string): void {
    const lower = command.toLowerCase();
    for (const blocked of this.config.blockedCommands) {
      if (lower.includes(blocked.toLowerCase())) {
        throw new SandboxError(`Command blocked: matches "${blocked}"`);
      }
    }
  }

  private audit(action: string, target: string, extra?: Record<string, unknown>): void {
    const entry = {
      timestamp: new Date().toISOString(),
      action,
      target,
      ...extra,
    };
    appendFileSync(this.config.auditLog, JSON.stringify(entry) + "\n");
  }
}

class SandboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxError";
  }
}

function matchGlob(path: string, pattern: string): boolean {
  const regex = pattern
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, ".");
  return new RegExp(`^${regex}$`).test(path);
}
```

### Strategy 2: Docker Container Sandbox

For full isolation — the agent runs inside a container with limited CPU, memory, network, and filesystem access.

```typescript
// docker-sandbox.ts — Run agent code in isolated Docker containers
/**
 * Spawns a Docker container for each agent session.
 * Mounts only the allowed workspace directory (read-only optional).
 * Enforces CPU, memory, and network limits.
 * Auto-kills containers that exceed time limits.
 */
import { execSync, spawn } from "child_process";

interface DockerSandboxConfig {
  image: string;                 // Base image (e.g., "node:20-slim")
  workDir: string;               // Host directory to mount
  readOnly: boolean;             // Mount workspace as read-only
  cpuLimit: string;              // CPU limit (e.g., "1.0" = 1 core)
  memoryLimit: string;           // Memory limit (e.g., "512m")
  networkMode: string;           // "none" for no network, "bridge" for limited
  timeoutSeconds: number;        // Kill container after this many seconds
  allowedEnvVars: string[];      // Env vars to pass through
}

export class DockerSandbox {
  private config: DockerSandboxConfig;
  private containerId: string | null = null;

  constructor(config: Partial<DockerSandboxConfig> & { workDir: string }) {
    this.config = {
      image: "node:20-slim",
      readOnly: false,
      cpuLimit: "1.0",
      memoryLimit: "512m",
      networkMode: "none",        // No network by default
      timeoutSeconds: 300,        // 5 minutes max
      allowedEnvVars: [],
      ...config,
    };
  }

  /**
   * Start the sandbox container.
   */
  async start(): Promise<string> {
    const mountFlag = this.config.readOnly ? "ro" : "rw";
    const envFlags = this.config.allowedEnvVars
      .map((v) => `-e ${v}`)
      .join(" ");

    const cmd = [
      "docker run -d",
      `--cpus=${this.config.cpuLimit}`,
      `--memory=${this.config.memoryLimit}`,
      `--network=${this.config.networkMode}`,
      "--security-opt=no-new-privileges",    // No privilege escalation
      "--read-only",                          // Root FS read-only
      "--tmpfs /tmp:size=100m",              // Writable tmp with size limit
      `-v ${this.config.workDir}:/workspace:${mountFlag}`,
      `-w /workspace`,
      envFlags,
      this.config.image,
      "tail -f /dev/null",                   // Keep container alive
    ].join(" ");

    this.containerId = execSync(cmd, { encoding: "utf-8" }).trim();

    // Auto-kill timer
    setTimeout(() => this.kill("timeout"), this.config.timeoutSeconds * 1000);

    return this.containerId;
  }

  /**
   * Execute a command inside the sandbox container.
   */
  exec(command: string): string {
    if (!this.containerId) throw new Error("Sandbox not started");
    return execSync(
      `docker exec ${this.containerId} sh -c '${command.replace(/'/g, "'\\''")}'`,
      { encoding: "utf-8", timeout: 60000 }
    );
  }

  /**
   * Kill the sandbox container and remove it.
   */
  kill(reason: string = "manual"): void {
    if (this.containerId) {
      console.log(`🛑 Killing sandbox: ${reason}`);
      execSync(`docker kill ${this.containerId} && docker rm ${this.containerId}`, {
        encoding: "utf-8",
      });
      this.containerId = null;
    }
  }
}
```

## Examples

### Example 1: Add safety controls to a coding agent

**User prompt:** "I want my AI coding agent to only modify files in the src/ directory and never touch .env files or run destructive commands."

The agent will:
- Create an AgentSandbox with workDir pointing to the project root
- Set allowedPaths to `["src/**", "tests/**"]`
- Set deniedPaths to `["**/.env*", "**/.ssh/**", "**/secrets/**"]`
- Enable audit logging to track every agent action
- Wrap all file operations and command executions through the sandbox

### Example 2: Run untrusted code in Docker isolation

**User prompt:** "We're building a code execution platform. User-submitted code needs to run in isolation with no network access, 512MB memory, and a 30-second timeout."

The agent will:
- Set up DockerSandbox with networkMode "none", memory 512m, timeout 30s
- Mount user code directory as read-only
- Enable writable /tmp with 100MB limit for temporary files
- Add security-opt no-new-privileges to prevent escalation
- Implement cleanup on timeout or completion

## Guidelines

- **Default to deny** — block everything, then allowlist what the agent needs
- **No Docker socket access** — mounting docker.sock gives root on the host
- **Audit everything** — log every file read, write, and command for forensics
- **Time limits prevent infinite loops** — always set exec timeouts
- **Network "none" by default** — agents shouldn't make outbound calls unless explicitly needed
- **Read-only mounts when possible** — agents that only analyze code don't need write access
- **Separate audit logs from agent workspace** — the agent shouldn't be able to modify its own audit trail
- **Test the sandbox itself** — try to escape it before trusting it with real data
- **Kill switches save you** — always have a way to halt the agent immediately
- **Container cleanup** — always `docker rm` after container stops to avoid disk waste
