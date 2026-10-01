---
name: fig
description: >-
  Fig was a macOS terminal app that showed IDE-style autocomplete for CLI
  commands. It shut down on 1 September 2024; its autocomplete moved into
  Amazon Q Developer CLI, which became the closed-source Kiro CLI in November
  2025. The open completion-spec format (Fig.Spec, the withfig/autocomplete
  repository) still drives Kiro CLI, Microsoft inshellisense and VS Code's
  terminal suggestions. Use when a user asks "what happened to Fig", "what
  replaces Fig autocomplete", "write a Fig completion spec for my CLI", "add
  terminal autocomplete for our internal tool", or "move from Amazon Q CLI to
  Kiro CLI".
license: Apache-2.0
compatibility: "Writing and compiling specs needs Node.js 18+ and npm. inshellisense runs on Linux, macOS and Windows. Kiro CLI runs on macOS, Windows 11 and Linux (glibc 2.34+ or the musl build) and needs a sign-in."
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/withfig/autocomplete
  tags:
  - terminal
  - autocomplete
  - cli
  - dotfiles
  - scripts
---

# Amazon Q (formerly Fig) — Terminal Autocomplete & CLI Tools

## Overview

Fig added a dropdown of subcommands, flags and arguments next to the cursor in the terminal. The product no longer exists under that name, so start by telling the user which piece of it they can still use:

| Piece | Status (October 2026) |
|---|---|
| Fig app, `fig` CLI, fig.io | Shut down on 1 September 2024. fig.io, including its documentation, no longer answers. |
| Fig Scripts, Dotfiles sync, Plugins | Ended with Fig. No successor carried them over. |
| Amazon Q Developer CLI (`q`) | The open-source continuation of Fig. Since Kiro CLI appeared it only gets critical security fixes. |
| Kiro CLI (`kiro-cli`) | Current product, closed source. Has the autocomplete dropdown and inline "ghost text" suggestions, plus an AI chat agent. |
| Completion-spec format (`Fig.Spec`) | Open (MIT) in `withfig/autocomplete`: specs for 600+ CLIs. Last npm release `@withfig/autocomplete` 2.692.3, May 2025. |
| Runtimes that read the specs | Kiro CLI, Microsoft inshellisense (open source, all platforms), VS Code's built-in terminal suggestions. |

A completion spec is a TypeScript object that declares a CLI's subcommands, options and arguments, and optionally runs commands to produce dynamic suggestions. Writing one is still the way to give an in-house CLI autocomplete in these runtimes.

## Instructions

### 1. Find out what is installed

```bash
kiro-cli --version; q --version; is --version   # Kiro CLI, Amazon Q Developer CLI, inshellisense
```

The old Fig app has nothing to update to: uninstall it and pick one of the runtimes below.

### 2. Install a runtime

**inshellisense** needs no account and works over SSH because it runs inside the shell session:

```bash
npm install -g @microsoft/inshellisense
is init                  # one-time setup
is doctor                # checks the installation
is                       # start a session in the current shell; `exit` leaves it
is init zsh >> ~/.zshrc  # optional: start automatically (bash, fish, pwsh, nu, xonsh also supported)
```

Keep that `is init` line last in the shell config. Specs for `aws`, `az` and `gcloud` are not loaded because of their size.

**Kiro CLI.** The documented installer is a shell script fetched from cli.kiro.dev; Homebrew is not supported. Do not pipe it into a shell. The script only downloads a release file and compares it with a published SHA-256, which is easy to do by hand:

```bash
# Linux x86-64 with glibc 2.34+ (check with: ldd --version)
base=https://desktop-release.q.us-east-1.amazonaws.com/latest
curl --proto '=https' --tlsv1.2 -sSf "$base/kirocli-x86_64-linux.zip" -o kirocli.zip
curl --proto '=https' --tlsv1.2 -sSf "$base/kirocli-x86_64-linux.zip.sha256" -o kirocli.zip.sha256
echo "$(cat kirocli.zip.sha256)  kirocli.zip" | sha256sum -c -   # must print "kirocli.zip: OK"
unzip kirocli.zip
./kirocli/install.sh       # copies kiro-cli into ~/.local/bin and sets up shell integration
kiro-cli login
kiro-cli doctor
```

Other files in the same directory follow the same pattern (each has a `.sha256` next to it): `kirocli-aarch64-linux.zip` (its installer requires glibc 2.39+), the `-musl` variants for older glibc, `kiro-cli.deb`, `kiro-cli.appimage`, and `Kiro%20CLI.dmg` for macOS (check it with `shasum -a 256`). On Amazon Linux 2023 use the signed RPM repository described in Kiro's installation page and `sudo dnf install kiro-cli`. The zip is the headless build; the `.deb`, AppImage and `.dmg` are the full desktop builds.

Autocomplete settings in Kiro CLI:

```bash
kiro-cli settings autocomplete.disable true    # turn the dropdown off (false turns it on)
kiro-cli inline enable                          # ghost-text suggestions; also: disable, status
kiro-cli theme dark                             # dropdown theme: dark, light, system
kiro-cli settings app.disableAutoupdates true
```

Moving from Amazon Q Developer CLI: `q update` replaces it with Kiro CLI. Prompts, agents and MCP settings are copied once from `~/.aws/amazonq` to `~/.kiro`; project `.amazonq` folders keep working.

### 3. Scaffold a spec project

```bash
mkdir shipctl-completions && cd shipctl-completions
npx @withfig/autocomplete-tools@2 init           # creates .fig/autocomplete with package.json, tsconfig, src/
cd .fig/autocomplete
npm run create-spec -- shipctl                   # writes src/shipctl.ts
```

Before choosing a name, check it is not already taken by a public spec: `is specs list` prints all of them (`deployctl`, for example, is Deno's CLI).

### 4. Write the spec

```typescript
// src/shipctl.ts
const services: Fig.Generator = {
  script: ["kubectl", "get", "deployments", "-o", "name"],
  postProcess: (out) =>
    out.split("\n").filter(Boolean).map((line) => ({
      name: line.replace("deployment.apps/", ""),
      description: "Deployment in the current namespace",
    })),
  cache: { strategy: "stale-while-revalidate", ttl: 30_000 }, // milliseconds
};

const completionSpec: Fig.Spec = {
  name: "shipctl",
  description: "Deploy services to the cluster",
  subcommands: [
    {
      name: "create",
      description: "Create a new deployment",
      args: { name: "service", generators: services },
      options: [
        {
          name: ["--env", "-e"],
          description: "Target environment",
          isRequired: true,
          args: {
            name: "environment",
            suggestions: [{ name: "staging", description: "Staging cluster" }, { name: "production", description: "Production cluster" }],
          },
        },
        {
          name: ["--tag", "-t"],
          description: "Image tag",
          args: { name: "tag", generators: { script: ["git", "tag", "--sort=-version:refname"], splitOn: "\n" } },
        },
        { name: "--dry-run", description: "Print the plan and exit" },
      ],
    },
    {
      name: "rollback",
      description: "Roll a service back to an earlier revision",
      isDangerous: true,
      args: { name: "service", generators: services },
      options: [
        {
          name: "--revision",
          description: "Revision number to roll back to",
          args: {
            name: "revision",
            generators: {
              // tokens = ["shipctl", "rollback", "checkout-api", "--revision", ""]
              script: (tokens) => ["kubectl", "rollout", "history", `deployment/${tokens[2]}`],
              postProcess: (out) =>
                out.split("\n").map((line) => line.trim().split(/\s+/)[0])
                  .filter((rev) => /^\d+$/.test(rev))
                  .map((rev) => ({ name: rev, description: `Revision ${rev}` })),
            },
          },
        },
      ],
    },
    {
      name: "logs",
      description: "Show logs of a service",
      args: { name: "service", isOptional: true, generators: services },
      options: [
        { name: ["--follow", "-f"], description: "Stream new lines" },
        { name: "--since", description: "Only newer lines", args: { name: "duration", suggestions: ["5m", "1h", "24h"] } },
      ],
    },
  ],
  options: [
    { name: ["--verbose", "-v"], description: "Verbose output", isPersistent: true },
    { name: "--config", description: "Config file", isPersistent: true, args: { name: "file", template: "filepaths" } },
  ],
};

export default completionSpec;
```

What the parts do:

- `args` — positional arguments; `isOptional`, `isVariadic` and `default` describe them. `suggestions` are static values.
- `generators` — dynamic values. `script` is an array (command and arguments) or a function of the typed tokens that returns one; its stdout goes to `postProcess`, or to `splitOn` when every line is one suggestion. `custom` is an async function for cases that need several commands. `cache` avoids rerunning slow commands.
- `template` — built-in suggestions: `"filepaths"`, `"folders"`, `"history"`, `"help"`.
- `isPersistent` makes an option available in every subcommand; `isRequired` marks it mandatory; `isDangerous` on a subcommand stops the runtime from running it straight from the menu; `priority` (0–100) orders suggestions.

### 5. Check and compile

`npm test` type-checks every spec against `@withfig/autocomplete-types`; `npm run build` writes `build/shipctl.js` and `build/index.js`.

### 6. Load the spec

**inshellisense** reads extra spec folders from its config file, `~/.inshellisenserc` (or `~/.config/inshellisense/rc.toml`):

```toml
[specs]
path = ["/home/dana/shipctl-completions/.fig/autocomplete/build"]
```

Use an absolute path. Then `is specs list` includes `shipctl`, and typing `shipctl ` in a new `is` session shows the subcommands. Rebuild and restart the session after each change.

**Kiro CLI and Amazon Q.** `npm run dev` in the spec project was Fig's developer mode: it recompiles on save and points the desktop app at `build/` by calling `q settings autocomplete.developerModeNPM true` and `q settings autocomplete.devCompletionsFolder` with the build path. It was written for the macOS apps of Fig and Amazon Q and looks for a `q`, `cw` or `fig` binary. Kiro's documentation says nothing about custom specs, so treat this as untested there and confirm on the user's machine before promising it.

### 7. Generate a spec from the CLI's own definition

For a CLI built with Commander, `@fig/complete-commander` writes the spec from the program object:

```javascript
// shipctl.mjs
import { program } from "commander";
import { addCompletionSpecCommand } from "@fig/complete-commander";

program.name("shipctl").description("Deploy services to the cluster").version("1.4.0");
program
  .command("create <service>")
  .description("Create a new deployment")
  .requiredOption("-e, --env <environment>", "Target environment")
  .option("--dry-run", "Print the plan and exit");

addCompletionSpecCommand(program);
program.parse();
```

```bash
npm install commander@11 @fig/complete-commander
node shipctl.mjs generate-fig-spec > src/shipctl.ts
```

The package declares Commander `^11.1.0` as its peer and crashes with newer major versions. Kiro CLI prints its own spec the same way: `kiro-cli completion fig`.

### 8. Autocomplete over SSH

With inshellisense, install it on the remote machine and run `is` there. Kiro CLI's Linux archive documents its own route in its README: install it on the server, add `AcceptEnv Q_SET_PARENT` and `AllowStreamLocalForwarding yes` to the sshd configuration, restart sshd and reconnect.

## Examples

### Example 1: Autocomplete for an in-house CLI

**User request:**

```
Our team has a CLI called shipctl (create, rollback, logs). Fig used to complete it for me. How do I get that back on my Linux laptop?
```

The agent explains that Fig itself is gone, installs inshellisense, and builds the spec from section 4:

```bash
npm install -g @microsoft/inshellisense && is init
mkdir -p ~/shipctl-completions && cd ~/shipctl-completions
npx @withfig/autocomplete-tools@2 init
cd .fig/autocomplete && npm run create-spec -- shipctl
# edit src/shipctl.ts, then:
npm test && npm run build
printf '[specs]\npath = ["%s/build"]\n' "$PWD" >> ~/.inshellisenserc
is
```

`npm test` prints `All specs passed validation.` and the build prints `Built src/shipctl.ts`. In the `is` session, typing `shipctl ` opens a box listing `create`, `rollback`, `logs`, `--verbose` and `--config`; `shipctl create checkout-api --env ` offers `staging` and `production`.

### Example 2: Replacing Fig or Amazon Q with Kiro CLI

**User request:**

```
I still have "brew install fig" and `q login` in my setup notes for new laptops. What should they say now?
```

The agent replaces both lines. Fig cannot be installed any more and Amazon Q Developer CLI is in maintenance; the current tool is Kiro CLI, which Homebrew does not carry. For a Linux workstation the notes become the verified download from section 2, followed by:

```bash
kiro-cli login                 # opens the browser; --use-device-flow on a remote machine
kiro-cli doctor                # reports shell-integration problems
kiro-cli settings autocomplete.disable false
kiro-cli inline status
```

`sha256sum -c` must print `kirocli.zip: OK` before the archive is unpacked. `kiro-cli doctor` prints `Not authenticated. Please run kiro-cli login` until the login is done. The agent also notes what will not come back: Fig Scripts and dotfile sync have no replacement in Kiro CLI, so those belong in a dotfiles repository.

## Guidelines

1. **Say what is gone before giving commands** — `fig` commands, `~/.fig/scripts`, `fig run` and fig.io links in old tutorials no longer work.
2. **Kiro CLI is not Fig with a new name** — it is closed source, requires a sign-in, and is mainly an AI agent; if the user only wants completions without an account, use inshellisense or the shell's native completion.
3. **`script` must be an array or a function** — a plain string such as `script: "git branch"` was valid in early Fig specs and fails the type check now.
4. **Generators run commands on every completion** — keep them fast and read-only, add `cache`, and never build a command from user input with a shell (`bash -c`); pass tokens as separate array items.
5. **Mark destructive subcommands** — `isDangerous: true` on `delete`, `rollback`, `drop`.
6. **Do not rely on the public spec repository for distribution** — `withfig/autocomplete` has had no release since May 2025; ship the compiled spec with your tool or in a team repository and load it through `specs.path`.
7. **Runtimes differ** — a spec that type-checks can still behave differently in Kiro CLI, inshellisense and VS Code; test in the one the user runs.
8. **Never install by piping a script into a shell** — download the release file, check its SHA-256, then run it.
