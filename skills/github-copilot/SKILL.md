---
name: github-copilot
description: >
  GitHub Copilot is an AI-powered pair programming tool that integrates directly into your editor
  and terminal. It provides real-time code suggestions, natural language chat for explaining and
  refactoring code, slash commands for common operations, and workspace-aware agents that can
  reason across your entire codebase. Copilot accelerates development by turning intent into
  working code, reducing boilerplate, and helping developers navigate unfamiliar APIs and patterns.
license: Apache-2.0
compatibility:
  - macos
  - linux
  - windows
metadata:
  author: terminal-skills
  version: 1.0.0
  category: ai-tools
  tags:
    - ai
    - copilot
    - code-completion
    - pair-programming
    - vscode
    - cli
    - productivity
---

# GitHub Copilot — AI Pair Programming

GitHub Copilot sits in your editor and writes code alongside you. It reads your current file, open tabs, and surrounding context to suggest completions that range from finishing a single line to generating entire functions. Beyond completions, Copilot Chat lets you ask questions, explain code, generate tests, and refactor — all without leaving your editor.

This skill covers setting up Copilot in VS Code and the CLI, working effectively with inline suggestions, leveraging chat and slash commands, and using workspace agents for codebase-wide tasks.

## Setting Up Copilot in VS Code

Copilot requires an active GitHub Copilot subscription (Individual, Business, or Enterprise). Once you have access, installation takes seconds.

Open VS Code and install the extension from the marketplace. The Copilot extension includes both inline suggestions and the chat panel.

```bash
# Install Copilot extensions from the command line
code --install-extension GitHub.copilot
code --install-extension GitHub.copilot-chat
```

After installation, VS Code prompts you to sign in with your GitHub account. Once authenticated, Copilot activates automatically. You can verify it's running by checking the Copilot icon in the status bar — it should show as active, not crossed out.

To configure Copilot's behavior, open your VS Code settings and adjust the relevant options.

```json
// .vscode/settings.json — Copilot configuration for a project
{
  // Enable Copilot for specific languages
  "github.copilot.enable": {
    "*": true,
    "markdown": true,
    "plaintext": false,
    "yaml": true
  },

  // Control inline suggestion behavior
  "editor.inlineSuggest.enabled": true,
  "github.copilot.advanced": {
    "inlineSuggestCount": 3
  }
}
```

## Working with Inline Suggestions

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

- **Tab** — Accept the full suggestion
- **Esc** — Dismiss the suggestion
- **Alt+]** / **Option+]** — Cycle to the next suggestion
- **Alt+[** / **Option+[** — Cycle to the previous suggestion
- **Ctrl+Enter** — Open the Copilot completions panel to see multiple alternatives

## Copilot Chat

The chat panel is where Copilot moves beyond autocompletion into genuine pair programming. You can ask it to explain code, find bugs, suggest refactors, or generate entirely new code based on natural language descriptions.

Open the chat panel with **Ctrl+Shift+I** (or **Cmd+Shift+I** on macOS). You can also select code in the editor, right-click, and choose a Copilot action from the context menu.

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

## Slash Commands

Slash commands are shortcuts for common operations. Type `/` in the chat panel to see the full list. These commands streamline repetitive tasks.

The most useful slash commands include:

- **/explain** — Explain the selected code in plain language
- **/fix** — Suggest a fix for problems in the selected code
- **/tests** — Generate unit tests for the selected code
- **/doc** — Generate documentation comments for a function or class
- **/simplify** — Refactor the selected code to reduce complexity
- **/new** — Scaffold a new project or file from a description

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

## Workspace Agents

Workspace agents are Copilot's most powerful feature. The `@workspace` agent can reason across your entire codebase, not just the current file. It indexes your project and answers questions that require understanding multiple files and their relationships.

```text
# Workspace agent prompts — these search across your entire project

@workspace "Where is the database connection configured?"

@workspace "Which components use the useAuth hook?"

@workspace "How does the payment flow work end to end?"

@workspace "Find all API endpoints that don't have authentication middleware"
```

Other built-in agents include:

- **@terminal** — Suggest or explain terminal commands
- **@vscode** — Help with VS Code settings and features

## Copilot in the CLI

GitHub Copilot extends beyond the editor into your terminal. The `gh copilot` command turns natural language into shell commands.

```bash
# Install the Copilot CLI extension
gh extension install github/gh-copilot

# Ask Copilot to explain a command
gh copilot explain "find . -name '*.ts' -not -path './node_modules/*' | xargs grep 'TODO'"

# Ask Copilot to suggest a command
gh copilot suggest "find all Docker containers using more than 1GB memory"

# Copilot presents the command and asks if you want to run it
# ✓ docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}" | awk '$2 > 1024'
```

The CLI is particularly powerful for operations you do infrequently — complex `find` commands, `awk` pipelines, Docker operations, or git history queries. Instead of searching Stack Overflow, describe what you want and Copilot translates it into the right command for your shell.

## Tips for Getting Better Suggestions

Copilot's quality depends heavily on the context you provide. A few practices dramatically improve suggestion accuracy.

Write descriptive variable and function names. Copilot reads identifiers as strong signals of intent. A function named `calculateMonthlyRevenue` gets better suggestions than one named `calc`.

Keep related code in the same file or have relevant files open in tabs. Copilot uses open tabs as context for its suggestions.

Use TypeScript or JSDoc types. The more type information Copilot has, the more constrained and accurate its suggestions become. A function that accepts `userId: string` and returns `Promise<User | null>` gives Copilot much more to work with than untyped JavaScript.

Write a leading comment before complex functions. Even a single line describing the algorithm or business rule helps Copilot generate the right implementation on the first try.
