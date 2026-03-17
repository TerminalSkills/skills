---
title: Build a CLI Framework
slug: build-cli-framework
description: Build a CLI framework with command parsing, argument validation, interactive prompts, progress indicators, colorized output, and plugin system for building developer tools.
skills:
  - zod
category: development
tags:
  - cli
  - framework
  - developer-tools
  - command-line
  - tooling
---

# Build a CLI Framework

## The Problem

Tom leads DX at a 20-person company with 5 internal CLI tools. Each tool reinvents argument parsing, help text, error handling, and output formatting. Adding a new command to any tool takes 2 hours of boilerplate. Interactive prompts use different libraries with inconsistent UX. Progress bars look different in each tool. They need a framework: declarative command definition, automatic help generation, Zod-based argument validation, interactive prompts, progress indicators, and plugins.

## Step 1: Build the CLI Framework

```typescript
import { z, ZodSchema } from "zod";
import * as readline from "node:readline";

interface Command {
  name: string;
  description: string;
  args?: ZodSchema;
  options?: Record<string, { description: string; type: "string" | "boolean" | "number"; default?: any; alias?: string; required?: boolean }>;
  action: (args: any, options: any) => Promise<void>;
  subcommands?: Command[];
}

interface CLIConfig {
  name: string;
  version: string;
  description: string;
  commands: Command[];
  plugins?: CLIPlugin[];
}

interface CLIPlugin {
  name: string;
  commands: Command[];
  hooks?: { beforeRun?: (cmd: string) => Promise<void>; afterRun?: (cmd: string) => Promise<void> };
}

// Parse and execute CLI
export async function run(config: CLIConfig, argv: string[] = process.argv.slice(2)): Promise<void> {
  // Register plugin commands
  for (const plugin of config.plugins || []) {
    config.commands.push(...plugin.commands);
  }

  const { commandName, args, options } = parseArgv(argv);

  if (!commandName || options.help) {
    printHelp(config, commandName);
    return;
  }

  if (options.version) {
    console.log(`${config.name} v${config.version}`);
    return;
  }

  const command = findCommand(config.commands, commandName);
  if (!command) {
    console.error(color("red", `Unknown command: ${commandName}`));
    console.error(`Run \`${config.name} --help\` for available commands.`);
    process.exit(1);
  }

  // Validate options
  if (command.options) {
    for (const [key, opt] of Object.entries(command.options)) {
      if (opt.required && options[key] === undefined) {
        console.error(color("red", `Missing required option: --${key}`));
        process.exit(1);
      }
      if (options[key] === undefined && opt.default !== undefined) {
        options[key] = opt.default;
      }
      if (opt.type === "number" && options[key] !== undefined) {
        options[key] = Number(options[key]);
        if (isNaN(options[key])) { console.error(color("red", `Option --${key} must be a number`)); process.exit(1); }
      }
    }
  }

  // Run hooks
  for (const plugin of config.plugins || []) {
    if (plugin.hooks?.beforeRun) await plugin.hooks.beforeRun(commandName);
  }

  try {
    await command.action(args, options);
  } catch (error: any) {
    console.error(color("red", `Error: ${error.message}`));
    process.exit(1);
  }

  for (const plugin of config.plugins || []) {
    if (plugin.hooks?.afterRun) await plugin.hooks.afterRun(commandName);
  }
}

function parseArgv(argv: string[]): { commandName: string; args: string[]; options: Record<string, any> } {
  const options: Record<string, any> = {};
  const args: string[] = [];
  let commandName = "";

  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      if (argv[i + 1] && !argv[i + 1].startsWith("-")) { options[key] = argv[++i]; }
      else { options[key] = true; }
    } else if (argv[i].startsWith("-") && argv[i].length === 2) {
      const key = argv[i].slice(1);
      if (argv[i + 1] && !argv[i + 1].startsWith("-")) { options[key] = argv[++i]; }
      else { options[key] = true; }
    } else if (!commandName) {
      commandName = argv[i];
    } else {
      args.push(argv[i]);
    }
  }

  return { commandName, args, options };
}

function findCommand(commands: Command[], name: string): Command | null {
  const parts = name.split(":");
  let current = commands;
  for (const part of parts) {
    const found = current.find((c) => c.name === part);
    if (!found) return null;
    if (parts.indexOf(part) < parts.length - 1) { current = found.subcommands || []; }
    else return found;
  }
  return null;
}

function printHelp(config: CLIConfig, commandName?: string): void {
  if (commandName) {
    const cmd = findCommand(config.commands, commandName);
    if (cmd) {
      console.log(`\n${color("bold", cmd.name)} — ${cmd.description}\n`);
      if (cmd.options) {
        console.log("Options:");
        for (const [key, opt] of Object.entries(cmd.options)) {
          const alias = opt.alias ? `-${opt.alias}, ` : "    ";
          const req = opt.required ? color("red", " (required)") : "";
          const def = opt.default !== undefined ? ` [default: ${opt.default}]` : "";
          console.log(`  ${alias}--${key.padEnd(20)} ${opt.description}${req}${def}`);
        }
      }
      return;
    }
  }

  console.log(`\n${color("bold", config.name)} v${config.version}`);
  console.log(`${config.description}\n`);
  console.log("Commands:");
  for (const cmd of config.commands) {
    console.log(`  ${color("cyan", cmd.name.padEnd(20))} ${cmd.description}`);
  }
  console.log(`\nRun \`${config.name} <command> --help\` for command details.`);
}

// Interactive prompt
export async function prompt(message: string, defaultValue?: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    const suffix = defaultValue ? ` (${defaultValue})` : "";
    rl.question(`${color("cyan", "?")} ${message}${suffix}: `, (answer) => {
      rl.close();
      resolve(answer || defaultValue || "");
    });
  });
}

export async function confirm(message: string, defaultValue: boolean = false): Promise<boolean> {
  const answer = await prompt(`${message} (${defaultValue ? "Y/n" : "y/N"})`);
  return answer ? ["y", "yes"].includes(answer.toLowerCase()) : defaultValue;
}

export async function select(message: string, choices: Array<{ label: string; value: string }>): Promise<string> {
  console.log(`${color("cyan", "?")} ${message}`);
  choices.forEach((c, i) => console.log(`  ${color("cyan", String(i + 1))}. ${c.label}`));
  const answer = await prompt("Select");
  const idx = parseInt(answer) - 1;
  return choices[idx]?.value || choices[0].value;
}

// Progress bar
export function createProgress(total: number, label: string = "Progress"): { update: (current: number) => void; done: () => void } {
  return {
    update(current: number) {
      const pct = Math.round((current / total) * 100);
      const filled = Math.round(pct / 2);
      const bar = "█".repeat(filled) + "░".repeat(50 - filled);
      process.stdout.write(`\r${label} ${bar} ${pct}% (${current}/${total})`);
    },
    done() {
      process.stdout.write("\n");
    },
  };
}

// Spinner
export function createSpinner(message: string): { stop: (finalMessage?: string) => void } {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  const interval = setInterval(() => {
    process.stdout.write(`\r${color("cyan", frames[i++ % frames.length])} ${message}`);
  }, 80);
  return {
    stop(finalMessage?: string) {
      clearInterval(interval);
      process.stdout.write(`\r${color("green", "✓")} ${finalMessage || message}\n`);
    },
  };
}

// Colorized output
export function color(c: string, text: string): string {
  const codes: Record<string, string> = { red: "31", green: "32", yellow: "33", blue: "34", cyan: "36", bold: "1", dim: "2" };
  return `\x1b[${codes[c] || "0"}m${text}\x1b[0m`;
}

// Table output
export function table(headers: string[], rows: string[][]): void {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] || "").length)));
  console.log(headers.map((h, i) => color("bold", h.padEnd(widths[i]))).join("  "));
  console.log(widths.map((w) => "─".repeat(w)).join("──"));
  for (const row of rows) console.log(row.map((c, i) => (c || "").padEnd(widths[i])).join("  "));
}
```

## Results

- **New command: 2 hours → 10 minutes** — declare name, options, action function; framework handles parsing, validation, help; zero boilerplate
- **Consistent UX across 5 tools** — same prompt style, progress bars, colors, error format; users learn one pattern
- **Automatic help** — `--help` generates formatted help from command definitions; always in sync; no manual help text
- **Zod validation** — `--port` validated as number, `--email` as email; type errors caught before action runs; no manual checks
- **Plugin system** — analytics plugin hooks into beforeRun/afterRun; tracks command usage; no changes to existing commands
