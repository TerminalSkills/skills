# SEOG plugin for Claude Code

Runs [SEOG](https://seog.ai) — local SEO for businesses on Google Maps — inside Claude
Code. Bundles the `seog` skill and the MCP server config, so one install gives Claude
90 tools against **your own SEOG account**: Google Business Profile management, map-pack
rank tracking and geo-grid scans, review sync and replies published to Google,
competitor intelligence, AI-visibility and citation checks, website + Search Console
audits, Google posts, and PDF reports.

## Install

Inside Claude Code:

```
/plugin marketplace add TerminalSkills/skills
/plugin install seog@terminal-skills
```

Claude Code prompts for your **SEOG MCP token** and stores it in your OS keychain.

## Account and credits

A SEOG account is required — every tool call runs as that account, and there is no
anonymous mode.

1. Sign up at [app.seog.ai](https://app.seog.ai).
2. **Settings → MCP access** → issue a personal token (shown once).
3. Paste it when Claude Code asks.

SEOG bills in **credits (CR)**. Reads of stored data are free; paid tools cost the same
as the equivalent click in the app, and spend the same balance. Ask Claude for
`get_credit_balance` and `list_feature_prices` before a large sweep. A paid tool that
fails is refunded automatically.

When the balance runs out, the tool fails with the price, your balance and the top-up
link, e.g.:

```
Not enough credits: this action costs 45 CR and the account balance is 12 CR.
Nothing was run and nothing was charged. Top up or upgrade at
https://app.seog.ai/billing, then retry.
```

## Without the plugin

The same server works in any MCP client:

```bash
claude mcp add --transport http seog https://api.seog.ai/mcp \
  --header "Authorization: Bearer $SEOG_MCP_TOKEN"
```

Codex (`~/.codex/config.toml`):

```toml
[mcp_servers.seog]
url = "https://api.seog.ai/mcp"
bearer_token_env_var = "SEOG_MCP_TOKEN"
```

The skill alone (no MCP server) is still useful as instructions:
`npx terminal-skills install seog`.
