---
name: github-copilot
description: >-
  GitHub Copilot is an AI coding assistant for VS Code and the terminal that suggests code inline, answers questions in chat, and runs agent tasks across a project. Use it when a user asks to set up Copilot, write better prompts for Copilot Chat, use slash commands or #codebase context, generate tests with /tests, or move from the retired gh copilot extension to the GitHub Copilot CLI.
license: Apache-2.0
compatibility: 'macos, linux, windows'
metadata:
  author: terminal-skills
  repository: https://github.com/github/copilot-cli
  version: 1.1.0
  category: development
  tags:
    - ai
    - copilot
    - code-completion
    - vscode
    - cli
---

# GitHub Copilot — AI Pair Programming

## Overview

GitHub Copilot sits in your editor and writes code alongside you. It reads your current file, open tabs, and surrounding context to suggest completions that range from finishing a single line to generating entire functions. Beyond completions, Copilot Chat lets you ask questions, explain code, generate tests, and refactor — all without leaving your editor.

This skill covers setting up Copilot in VS Code and the CLI, working effectively with inline suggestions, leveraging chat and slash commands, and using workspace agents for codebase-wide tasks.

## Instructions

### Setting Up Copilot in VS Code

Copilot needs a GitHub Copilot plan (Free, Pro, Business or Enterprise). Once you have access, setup takes seconds.

Open VS Code and sign in through the Copilot entry in the status bar or the Accounts menu. Without a plan, signing in enrolls an eligible account in Copilot Free; organization accounts follow the organization's policies. Extension installation is handled by that setup flow in current VS Code, so no manual `code --install-extension` step is needed.

After signing in, run `/init` in a chat session to generate starter project instructions from the codebase.

Inline suggestions can be switched per language with the documented `github.copilot.enable` setting (the default already turns off `plaintext` and `markdown`):

```jsonc
// .vscode/settings.json — enable Copilot suggestions per language
{
  "github.copilot.enable": {
    "*": true,
    "plaintext": false,
    "markdown": true,
    "yaml": true
  }
}
```

### Working with Inline Suggestions

Inline suggestions appear as grayed-out ghost text as you type. Copilot predicts what you want to write based on your current file, function names, comments, and surrounding code.

The most effective way to guide Copilot is through clear function signatures and comments. When you write a descriptive function name and type signature, Copilot understands your intent and generates accurate implementations.

```typescript
// src/utils/validation.ts — Copilot generates implementations from descriptive signatures

// Type a function signature and pause — Copilot suggests the body
function validateEmailAddress(email: string): boolean {
  // Copilot completes this based on the function name and parameter
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// A comment describing the function triggers high-quality suggestions
// Parse a CSV string into an array of objects using the first row as headers
function parseCSV(csv: string): Record<string, string>[] {
  const lines = csv.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());

  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim());
    return Object.fromEntries(headers.map((h, i) => [h, values[i]]));
  });
}
```

Keyboard shortcuts control how you interact with suggestions:

- **Tab** — Accept the suggestion
- **Esc** — Dismiss the suggestion

Beyond line completion, "next edit suggestions" propose the next change elsewhere in the file; their editor behavior is controlled by the `inlineSuggest.edits.*` settings.

### Copilot Chat

The chat panel is where Copilot moves beyond autocompletion into genuine pair programming. You can ask it to explain code, find bugs, suggest refactors, or generate entirely new code based on natural language descriptions.

Open the Chat view with **Ctrl+Alt+I** (**Ctrl+Cmd+I** on macOS), start a new chat with **Ctrl+N**, and use **Ctrl+I** for inline chat in the editor or terminal. You can also select code in the editor, right-click, and choose a Copilot action from the context menu.

Effective chat prompts are specific and provide context. Instead of asking "fix this code," describe what's wrong and what behavior you expect.

```text
# Example chat prompts that produce high-quality responses

"This function throws when the input array is empty. Add a guard clause
that returns an empty array instead of throwing."

"Refactor this Express route handler to use async/await instead of
.then() chains, and add proper error handling with a try/catch."

"Generate unit tests for the UserService class. Cover the happy path,
invalid input, and database connection failures."

"Explain what this regex does step by step: /^(?=.*[A-Z])(?=.*\d).{8,}$/"
```

### Slash Commands

Slash commands are shortcuts for common operations. Type `/` in the chat panel to see the full list. These commands streamline repetitive tasks.

Type `/` to see the commands available in the current session. The ones in the VS Code reference are:

- **/explain**, **/fix**, **/tests** — explain code, suggest a fix, generate tests
- **/doc** — generate documentation comments (from editor inline chat)
- **/plan** — research and propose an implementation plan
- **/new**, **/newNotebook** — scaffold a workspace, file or notebook
- **/init** — generate or update workspace instructions
- **/setupTests** (experimental) — choose and set up a test framework
- **/compact**, **/clear** — compress or restart the conversation

`/simplify` is not in the documented list; ask for the refactor in plain words instead.

When you select a block of code and type `/tests`, Copilot analyzes the function signatures, identifies edge cases, and generates a complete test file. You can then refine the output by following up in chat.

```typescript
// src/services/orderService.ts — Select this code, then use /tests in chat
export class OrderService {
  constructor(private readonly db: Database) {}

  async createOrder(userId: string, items: CartItem[]): Promise<Order> {
    if (items.length === 0) {
      throw new ValidationError('Order must contain at least one item');
    }

    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const order = { userId, items, total, status: 'pending', createdAt: new Date() };

    return this.db.orders.insert(order);
  }
}
```

### Agents and Context

In current VS Code, chat runs as an agent: it can read files, run tools and edit code, and you steer it with context. Chat participants such as `@workspace`, `@terminal` and `@vscode` are listed as deprecated and are not supported in the Copilot harness, so do not rely on them. Reference context with `#` mentions instead: `#file`, folders, symbols, `#codebase` (search the whole project), `#terminalSelection` and `#fetch`.

```text
Where is the database connection configured? #codebase

Which components use the useAuth hook? #codebase

Find all API endpoints that don't have authentication middleware. #codebase
```

Project rules go in custom instructions (generate a first version with `/init`); reusable prompts, custom agents, skills and MCP servers are configured with `/prompts`, `/agents`, `/skills` and the MCP server settings.

### Copilot in the CLI

The `gh copilot suggest` / `gh copilot explain` extension (`github/gh-copilot`) was deprecated on October 25, 2025. Its replacement is GitHub Copilot CLI, an agent that runs in a terminal session, edits files and runs commands after you approve them. It needs an active Copilot subscription (and the CLI enabled by your organization, if you get Copilot through one).

```bash
# Install (also available as: brew install copilot-cli, winget install GitHub.Copilot)
npm install -g @github/copilot

# Start in the project folder, then sign in with /login on first run
cd ~/work/billing-service
copilot
```

Inside the session, describe the task in your own words, for example "explain what this find pipeline does and suggest a faster one". Useful slash commands: `/login`, `/model` (pick a model), `/experimental`. For unattended use, authenticate with a fine-grained personal access token that has the "Copilot Requests" permission in `GH_TOKEN` or `GITHUB_TOKEN`. Usage counts against your Copilot plan; GitHub now bills with AI credits and lists the older premium-request billing as legacy, so check your plan's billing page for the current meter.

### Tips for Getting Better Suggestions

Copilot's quality depends heavily on the context you provide. A few practices dramatically improve suggestion accuracy.

Write descriptive variable and function names. Copilot reads identifiers as strong signals of intent. A function named `calculateMonthlyRevenue` gets better suggestions than one named `calc`.

Keep related code in the same file or have relevant files open in tabs. Copilot uses open tabs as context for its suggestions.

Use TypeScript or JSDoc types. The more type information Copilot has, the more constrained and accurate its suggestions become. A function that accepts `userId: string` and returns `Promise<User | null>` gives Copilot much more to work with than untyped JavaScript.

Write a leading comment before complex functions. Even a single line describing the algorithm or business rule helps Copilot generate the right implementation on the first try.

## Examples

### Example 1: Generate tests for a service

**User request:** "Write unit tests for OrderService, including an empty cart."

Select the `OrderService` class in the editor, open the Chat view (Ctrl+Alt+I) and run `/tests`. Copilot proposes a test file covering `createOrder` with items and the `ValidationError` for an empty cart; review the diff, run the suite, and follow up in chat to adjust the framework or mocks.

### Example 2: Move from `gh copilot` to Copilot CLI

**User request:** "`gh copilot suggest` stopped working, what do I use now?"

Install `npm install -g @github/copilot`, start `copilot` in the project folder, run `/login`, then ask "find Docker containers using more than 1 GB of memory". The agent proposes a command and waits for approval before running it.

## Guidelines

- Copilot needs an active plan (Free, Pro, Business or Enterprise); organization policy can disable chat, the CLI or specific models.
- Review every suggestion and every command the agent asks to run; approve edits one at a time on unfamiliar code.
- Do not paste secrets into prompts; keep tokens such as `GH_TOKEN` in the environment.
- Chat participants (`@workspace`, `@terminal`, `@vscode`) and the `gh copilot` extension are deprecated; use `#codebase` and Copilot CLI.
- Keybindings and commands vary by surface (editor, terminal, CLI); type `/` or open the keyboard shortcuts list to confirm what your version offers.
