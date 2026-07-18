# Terminal Skills Plugin for Claude Code

Connects Claude Code to the [Terminal Skills](https://terminalskills.io) agent. When a task needs specialized expertise — a deployment platform, document generation, a third-party API — Claude calls `plan_task`, gets back the proven skills that apply with their full instructions, and executes them. Free tools (`search_skills`, `get_skill`, `list_categories`) let it browse the 1000+ skill catalog without an API key.

## Install

Inside Claude Code:

```
/plugin marketplace add TerminalSkills/skills
/plugin install terminal-skills@terminal-skills
```

## API Key

`plan_task` needs an API key — create one free at [terminalskills.io/account](https://terminalskills.io/account). Claude Code prompts for it when you enable the plugin (stored in your OS keychain). Search and browsing work without a key.

**Pricing:** every account includes free plan calls each day; beyond that, a plan call costs about 1 credit.

## Other CLIs

The same MCP server works in any client. Endpoint: `https://api.terminalskills.io/api/mcp`.

### OpenAI Codex

`~/.codex/config.toml`:

```toml
[mcp_servers.terminal-skills]
url = "https://api.terminalskills.io/api/mcp"
bearer_token_env_var = "TERMINAL_SKILLS_API_KEY"
```

Then export `TERMINAL_SKILLS_API_KEY` in your shell.

### Gemini CLI

`~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "terminal-skills": {
      "httpUrl": "https://api.terminalskills.io/api/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

### Cursor

`~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "terminal-skills": {
      "url": "https://api.terminalskills.io/api/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

## License

Apache-2.0. See [LICENSE](../LICENSE).
