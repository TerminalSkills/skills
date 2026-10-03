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
  version: "1.1.0"
  category: devops
  repository: https://github.com/anthropics/sandbox-runtime
  tags: ["sandbox", "security", "guardrails", "agent-safety", "isolation"]
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

Three layers, from cheapest to strongest. Pick by threat: a clumsy agent needs layer 1; hostile or untrusted code needs layer 2 or 3.

### Layer 0: Use the sandbox your agent already ships

Claude Code has an OS-enforced Bash sandbox (Seatbelt on macOS, bubblewrap + socat on Linux/WSL2). It is off by default: run `/sandbox` in a session or set `sandbox.enabled` to `true` in `~/.claude/settings.json`. Commands may write only to the working directory and temp, the network goes through a proxy that allows only `sandbox.network.allowedDomains`, and `sandbox.filesystem.denyRead` / `allowWrite` tune the rest. It covers shell commands only; file tools, MCP servers and hooks run outside it. Set `allowUnsandboxedCommands: false` to stop the retry-outside-sandbox escape. The engine is the open-source `@anthropic-ai/sandbox-runtime`, usable to wrap your own agent process. Check what other agent CLIs offer before writing your own wrapper.

### Layer 1: Filesystem + Command Guard (no Docker)

A policy layer for agents whose tools you control (your own agent loop). It stops mistakes, not attackers: a string blocklist is easy to bypass (`r""m`, base64, scripts written then executed), so route `exec` into Layer 2 for anything untrusted.

```typescript
// sandbox.ts
import { execSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

interface SandboxConfig {
  workDir: string;
  allowedPaths: string[];     // globs relative to workDir; a path must match one to be touched
  deniedPaths: string[];      // globs that always win
  blockedCommands: RegExp[];
  maxFileSize: number;        // bytes per write
  auditLog: string;           // keep OUTSIDE workDir
  readOnly: boolean;
}

const DEFAULT_BLOCKED = [
  /\brm\s+-[a-z]*r[a-z]*f?\s+(\/|~|\.)(\s|$)/i,
  /\b(mkfs|dd\s+if=)/i,
  /\b(drop|truncate)\s+(database|table)\b/i,
  /(curl|wget)[^|]*\|\s*(sudo\s+)?(ba|z)?sh\b/i,
  /\bchmod\s+(-R\s+)?777\b/,
  /(env|printenv)\s*\|\s*(curl|nc)/i,
];

export class SandboxError extends Error {}

function globToRegExp(glob: string): RegExp {
  const re = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\//g, "\u0000")
    .replace(/\*\*/g, "\u0001")
    .replace(/\*/g, "[^/]*")
    .replace(/\u0000/g, "(?:.*/)?")
    .replace(/\u0001/g, ".*");
  return new RegExp(`^${re}$`);
}

export class AgentSandbox {
  private cfg: SandboxConfig;
  private killed = false;

  constructor(cfg: Partial<SandboxConfig> & { workDir: string }) {
    this.cfg = {
      allowedPaths: ["**"],
      deniedPaths: ["**/.env*", "**/.ssh/**", "**/*.pem", ".git/config"],
      blockedCommands: DEFAULT_BLOCKED,
      maxFileSize: 1024 * 1024,
      auditLog: "/var/log/agent-audit.jsonl",
      readOnly: false,
      ...cfg,
    };
    this.cfg.workDir = realpathSync(this.cfg.workDir);
  }

  readFile(path: string): string {
    const abs = this.guard(path, "read");
    this.audit("read", path);
    return readFileSync(abs, "utf-8");
  }

  writeFile(path: string, content: string): void {
    if (this.cfg.readOnly) throw new SandboxError("write blocked: sandbox is read-only");
    const abs = this.guard(path, "write");
    if (Buffer.byteLength(content) > this.cfg.maxFileSize) throw new SandboxError("write blocked: file too large");
    this.audit("write", path, { bytes: Buffer.byteLength(content) });
    writeFileSync(abs, content);
  }

  exec(command: string, timeoutMs = 30_000): string {
    this.alive();
    if (this.cfg.blockedCommands.some((re) => re.test(command))) {
      this.audit("exec_blocked", command);
      throw new SandboxError("command blocked by policy");
    }
    this.audit("exec", command);
    return execSync(command, { cwd: this.cfg.workDir, encoding: "utf-8", timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 });
  }

  kill(reason: string): void {
    this.killed = true;
    this.audit("killed", reason);
  }

  private alive() {
    if (this.killed) throw new SandboxError("agent has been killed");
  }

  // Resolve symlinks first so a link inside workDir cannot point outside it.
  private guard(path: string, op: string): string {
    this.alive();
    const abs = resolve(this.cfg.workDir, path);
    const real = existsSync(abs) ? realpathSync(abs) : resolve(realpathSync(dirname(abs)), abs.split("/").pop()!);
    const rel = relative(this.cfg.workDir, real);
    if (rel.startsWith("..") || resolve(rel) === rel) throw new SandboxError(`${op} blocked: path escapes workDir`);
    if (this.cfg.deniedPaths.some((g) => globToRegExp(g).test(rel))) throw new SandboxError(`${op} blocked: denied path ${rel}`);
    if (!this.cfg.allowedPaths.some((g) => globToRegExp(g).test(rel))) throw new SandboxError(`${op} blocked: ${rel} is not allowlisted`);
    return real;
  }

  private audit(action: string, target: string, extra: Record<string, unknown> = {}) {
    appendFileSync(this.cfg.auditLog, JSON.stringify({ ts: new Date().toISOString(), action, target, ...extra }) + "\n");
  }
}
```

### Layer 2: Docker container sandbox

Arguments go to `docker` as an array (no shell string), so agent-supplied text cannot inject host commands.

```typescript
// docker-sandbox.ts
import { execFileSync } from "node:child_process";

interface DockerSandboxConfig {
  image: string;
  workDir: string;            // absolute host path mounted at /workspace
  readOnly: boolean;
  cpus: string;
  memory: string;
  network: "none" | "bridge";
  timeoutSeconds: number;
  allowedEnvVars: string[];   // names only; values come from the host environment
}

export class DockerSandbox {
  private cfg: DockerSandboxConfig;
  private id: string | null = null;
  private timer?: NodeJS.Timeout;

  constructor(cfg: Partial<DockerSandboxConfig> & { workDir: string }) {
    this.cfg = { image: "node:24-slim", readOnly: false, cpus: "1.0", memory: "512m", network: "none", timeoutSeconds: 300, allowedEnvVars: [], ...cfg };
  }

  start(): string {
    const args = [
      "run", "-d", "--rm",
      `--cpus=${this.cfg.cpus}`, `--memory=${this.cfg.memory}`, "--pids-limit=256",
      `--network=${this.cfg.network}`,
      "--cap-drop=ALL", "--security-opt=no-new-privileges",
      "--read-only", "--tmpfs", "/tmp:size=100m",
      "--user", "1000:1000",
      "-v", `${this.cfg.workDir}:/workspace:${this.cfg.readOnly ? "ro" : "rw"}`,
      "-w", "/workspace",
      ...this.cfg.allowedEnvVars.flatMap((v) => ["-e", v]),
      this.cfg.image, "sleep", "infinity",
    ];
    this.id = execFileSync("docker", args, { encoding: "utf-8" }).trim();
    this.timer = setTimeout(() => this.kill("timeout"), this.cfg.timeoutSeconds * 1000);
    this.timer.unref();
    return this.id;
  }

  exec(command: string, timeoutMs = 60_000): string {
    if (!this.id) throw new Error("sandbox not started");
    return execFileSync("docker", ["exec", this.id, "sh", "-c", command], { encoding: "utf-8", timeout: timeoutMs });
  }

  kill(reason = "manual"): void {
    if (!this.id) return;
    clearTimeout(this.timer);
    try { execFileSync("docker", ["kill", this.id]); } catch { /* already gone; --rm cleans up */ }
    console.error(`sandbox ${this.id.slice(0, 12)} killed: ${reason}`);
    this.id = null;
  }
}
```

### Layer 3: Stronger isolation

When the code is genuinely hostile or multi-tenant, containers share the host kernel. Add a user-space kernel (`docker run --runtime=runsc` with gVisor installed) or use microVMs (Firecracker, Kata Containers), and keep egress allowlisted at the network level rather than relying on `bridge`.

## Examples

### Example 1: Add safety controls to a coding agent

**User prompt:** "I want my AI coding agent to only modify files in the src/ directory and never touch .env files or run destructive commands."

```typescript
const box = new AgentSandbox({
  workDir: "/srv/projects/billing-api",
  allowedPaths: ["src/**", "tests/**", "package.json"],
  auditLog: "/var/log/agent/billing-api.jsonl",
});
box.writeFile("src/invoice.ts", updatedSource);   // ok
box.writeFile(".env", "X=1");                      // SandboxError: denied path .env
box.exec("rm -rf .");                              // SandboxError: command blocked by policy
```

Every call, allowed or blocked, appends one JSON line to the audit log.

### Example 2: Run untrusted code in Docker isolation

**User prompt:** "We're building a code execution platform. User-submitted code needs to run in isolation with no network access, 512MB memory, and a 30-second timeout."

```typescript
const box = new DockerSandbox({ workDir: "/srv/submissions/4471", readOnly: true, timeoutSeconds: 30 });
box.start();
try { console.log(box.exec("node main.js")); } finally { box.kill("done"); }
```

The container has no network, 512MB RAM, no capabilities, a read-only root and workspace, and 100MB of `/tmp`. It is killed after 30 seconds even if `exec` hangs, and `--rm` removes it.

## Guidelines

- **Default to deny**: allowlist the paths and hosts the agent needs, nothing else.
- **A blocklist is not a boundary**: treat Layer 1 as a guard rail and put real isolation underneath.
- **Never mount `/var/run/docker.sock`**: it is root on the host.
- **Network `none` by default**; if the agent needs a package registry or API, allow specific hosts via a proxy.
- **Pass secrets by name, scoped and short-lived**; never mount the home directory or `~/.ssh`, `~/.aws`.
- **Keep audit logs outside the agent's workspace** so it cannot rewrite its own trail.
- **Always set timeouts and a kill switch**, and test the sandbox by trying to escape it before trusting it.
- **Containers share the host kernel**; use gVisor or a microVM for hostile code.
