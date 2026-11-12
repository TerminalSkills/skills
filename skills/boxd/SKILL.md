---
name: boxd
description: >-
  boxd runs code in full Ubuntu microVMs ("machines") that are ready in about
  0.8 seconds, keep their disk, and can be hibernated, forked and snapshotted. Use
  when a user wants an AI agent to run shell commands, Python or Node code,
  install packages, read and write files, or serve a web app on a public HTTPS
  URL without touching the host, or wants to give a LangChain or custom agent
  loop a sandboxed code-execution tool backed by boxd.
license: Apache-2.0
compatibility: "Node.js 20+ (@boxd-sh/sdk, ESM only) and a boxd API key in BOXD_API_KEY"
metadata:
  author: MichielMAnalytics
  version: "1.0.0"
  category: data-ai
  tags: "sandbox, code-execution, ai-agents, microvm, boxd"
---

# boxd: Linux microVMs for AI Agents

## Overview

[boxd](https://boxd.sh?ref=skills) gives each agent task its own Linux machine: a microVM running Ubuntu 24.04 with a 100 GB disk, user `boxd` with passwordless sudo, and Python 3.12, uv, Node.js, Go, git and Docker already installed. In 12 runs in November 2026, `create` plus `waitUntilReady` took 0.7 to 1.0 s (median 0.8 s), measured from the same region as the machines. Machines keep their files until you delete them, and can be hibernated to disk, woken, forked (memory and disk) or snapshotted. The `@boxd-sh/sdk` package (Node 20+, Bun, Deno) drives all of it, and `exec` returns stdout, stderr and the real exit code.

## Instructions

### Install and authenticate

```bash
npm install @boxd-sh/sdk
```

Create an API key in the [boxd console](https://app.boxd.sh?ref=skills) and set it as `BOXD_API_KEY`. `new Boxd()` reads it from the environment. Never hardcode it.

### Create a machine and run commands

```typescript
import { Boxd } from "@boxd-sh/sdk";

const boxd = new Boxd();

const machine = await boxd.machines.create({
  isolated: true, // not on your org's private network, no boxd credentials inside
  labels: { task: "pr-review-1842" },
});

try {
  await boxd.machines.waitUntilReady(machine.id); // create returns before the machine is usable
  const result = await boxd.machines.exec(machine.id, {
    command: "git clone --depth 1 https://github.com/pallets/flask && cd flask && git log -1 --format=%s",
    cwd: "/home/boxd",
    env: { GIT_TERMINAL_PROMPT: "0" },
    timeout: 120_000, // milliseconds
  });
  console.log(result.exitCode, result.stdout, result.stderr);
} finally {
  await boxd.machines.delete(machine.id);
  await boxd.close();
}
```

`command` takes a shell string (pipes, `&&` and `cd` work) or an argv array (`["python3", "-c", "print(1)"]`) that skips the shell.

### Install packages and move files

```typescript
await boxd.machines.files.upload(machine.id, "/home/boxd/sales.csv", "region,revenue\nEMEA,410200\nAPAC,388950\nAMER,512300\n");

// uv is preinstalled; `uv run --with` gets packages without touching the system Python.
const stats = await boxd.machines.exec(machine.id, {
  command: "uv run -q --with pandas python -c \"import pandas as pd; df = pd.read_csv('/home/boxd/sales.csv'); df.describe().to_csv('/home/boxd/summary.csv'); print(df.describe())\"",
  timeout: 300_000,
});

const summary = await boxd.machines.files.download(machine.id, "/home/boxd/summary.csv"); // Uint8Array
console.log(stats.stdout, new TextDecoder().decode(summary));
```

`upload` takes a string, a `Uint8Array`, or `{ fromPath: "./local-file" }`. Use absolute paths; the home directory is `/home/boxd`. Check the exit code of the command that writes a file before you download it.

### Serve a web app on a public URL

```typescript
await boxd.machines.exec(machine.id, {
  command: "mkdir -p /home/boxd/site && cd /home/boxd/site && nohup python3 -m http.server 8000 > /tmp/server.log 2>&1 &",
});
await boxd.machines.proxies.create(machine.id, "web", 8000);
const routes = await boxd.machines.proxies.list(machine.id);
console.log(`https://${routes.find((r) => r.name === "web")?.domain}`); // e.g. https://web.<machine-name>.boxd.sh
```

Swap in your app's own start command. The first named proxy on a machine gets its TLS certificate in about 20 to 60 seconds, so retry the first request. The URL is public: anyone with it can reach the port.

### Keep, fork and snapshot machines

```typescript
await boxd.machines.hibernate(machine.id); // memory to disk; billed only for disk until woken
await boxd.machines.wake(machine.id);
await boxd.machines.waitUntilReady(machine.id);

const extra: string[] = []; // forks and machines made from snapshots are billed machines too
try {
  const copy = await boxd.machines.fork(machine.id); // live copy, memory and disk
  extra.push(copy.id);
  await boxd.machines.waitUntilReady(copy.id);

  await boxd.snapshots.create(machine.id, "python-data-base"); // returns while the capture is "pending"
  const deadline = Date.now() + 5 * 60_000;
  let snap = await boxd.snapshots.get("python-data-base");
  while (snap.status === "pending" && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    snap = await boxd.snapshots.get("python-data-base");
  }
  if (snap.status !== "ready") throw new Error(`snapshot is ${snap.status}`);

  const next = await boxd.machines.create({ fromSnapshot: "python-data-base" });
  extra.push(next.id);
  await boxd.machines.waitUntilReady(next.id);
} finally {
  await Promise.all(extra.map((id) => boxd.machines.delete(id))); // also runs when a step above throws
}
```

Prepare one machine with the slow setup (dependencies, a cloned repo, a warmed cache), snapshot it, then create one machine per task from the snapshot. The snapshot stays in your account until you remove it with `boxd.snapshots.delete("python-data-base")`.

## Examples

### Example 1: "Chart a CSV without running pandas on my laptop"

```typescript
import { Boxd } from "@boxd-sh/sdk";
import { writeFileSync } from "node:fs";

const boxd = new Boxd();
const machine = await boxd.machines.create({ isolated: true, labels: { task: "revenue-analysis" } });

try {
  await boxd.machines.waitUntilReady(machine.id);
  await boxd.machines.files.upload(machine.id, "/home/boxd/quarterly-revenue.csv", { fromPath: "./quarterly-revenue.csv" });
  await boxd.machines.files.upload(machine.id, "/home/boxd/analyze.py", `
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

df = pd.read_csv("/home/boxd/quarterly-revenue.csv")
df.plot.bar(x="quarter", y="revenue", legend=False)
plt.tight_layout()
plt.savefig("/home/boxd/revenue.png")
print(df.describe())
`);

  const run = await boxd.machines.exec(machine.id, {
    command: "uv run -q --with pandas --with matplotlib python /home/boxd/analyze.py",
    timeout: 300_000,
  });
  if (run.exitCode !== 0) throw new Error(run.stderr);
  console.log(run.stdout);

  writeFileSync("revenue.png", await boxd.machines.files.download(machine.id, "/home/boxd/revenue.png"));
} finally {
  await boxd.machines.delete(machine.id);
  await boxd.close();
}
```

The agent writes the script, boxd runs it in a machine that has nothing of the host on it, and the chart comes back as bytes.

### Example 2: "Let my LangChain agent run shell commands safely"

```bash
npm install @boxd-sh/sdk @langchain/core zod
```

```typescript
import { Boxd, BoxdError } from "@boxd-sh/sdk";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const boxd = new Boxd();
const machine = await boxd.machines.create({ isolated: true, labels: { task: "agent-session" } });

try {
  await boxd.machines.waitUntilReady(machine.id);

  const runShell = tool(
    async ({ command }) => {
      try {
        const r = await boxd.machines.exec(machine.id, { command, cwd: "/home/boxd", timeout: 120_000 });
        return `exit ${r.exitCode}\nstdout:\n${r.stdout.slice(-6000)}\nstderr:\n${r.stderr.slice(-2000)}`;
      } catch (err) {
        if (err instanceof BoxdError) return `error: ${err.message}`; // e.g. the 120 s timeout
        throw err;
      }
    },
    {
      name: "run_shell",
      description: "Runs a bash command in an isolated Linux machine and returns the exit code, stdout and stderr.",
      schema: z.object({ command: z.string() }),
    }
  );

  // Bind runShell to your model and run the agent loop here.
} finally {
  await boxd.machines.delete(machine.id);
  await boxd.close();
}
```

Files the agent writes stay on the machine between tool calls, so it can install a package in one call and use it in the next. Returning the exit code, stderr and timeouts as text lets the model see its own failures.

## Guidelines

- Call `waitUntilReady` after `create`, `fork` and `wake` before the first `exec`, and inside the `try` so a failure still deletes the machine.
- Use `isolated: true` for anything that runs generated or user-submitted code. An isolated machine does not join your organization's private network and holds no boxd credentials. It still has outbound internet; restrict it with `boxd.machines.setEgressAllow(id, ["pypi.org", "files.pythonhosted.org"])` when that matters.
- Machines persist until deleted. Delete them in a `finally` block, pass `deleteAfter: 3600` (seconds) to `create` as a safety net, or `hibernate` machines you want to come back to. Labels (`labels: { task: ... }`) make leftovers easy to find with `boxd.machines.list({ labels: { task: "agent-session" } })`.
- Machine names are unique per account. Leave `name` out to get a generated one; a fixed name fails with `ConflictError` while a machine with that name exists.
- `exec` timeouts are in milliseconds and throw a `BoxdError` when they expire. Idle timeouts such as `config.autoSuspendTimeout` are in seconds.
- Start long-running processes with `nohup ... &` and redirect their output, so the `exec` call returns while the process keeps running.
- Catch `AuthenticationError` (missing or revoked key) and `NotFoundError` (wrong id or deleted machine) from `@boxd-sh/sdk`, and show the message to the user instead of retrying.
- `exec` output is decoded as UTF-8. Pass `encoding: "buffer"` for binary output, or download the file instead.
- Keep `BOXD_API_KEY` on the server. A key can create billed machines in its organization.
- From Python, `pip install boxd` gives the same calls in snake_case (`machines.wait_until_ready`, `machines.files.upload`), but every timeout there is in seconds, so `timeout=120`, not `120_000`. Docs: [docs.boxd.sh](https://docs.boxd.sh?ref=skills).
