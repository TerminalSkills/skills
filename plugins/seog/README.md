# SEOG plugin for Claude Code

Runs [SEOG](https://seog.ai) — local SEO for businesses on Google Maps — inside Claude
Code. Bundles the `seog` skill and the MCP server config, so one install gives Claude
90 tools against **your own SEOG account**: Google Business Profile management, map-pack
rank tracking and geo-grid scans, review sync and replies published to Google,
competitor intelligence, AI-visibility and citation checks, website + Search Console
audits, Google posts, and PDF reports.

## Install

**1. Get a SEOG token.** Sign up at [app.seog.ai](https://app.seog.ai) → **Settings →
MCP access** → *Create token*. It is shown once; copy it. (Every tool call runs as this
account — there is no anonymous mode.)

**2. Add the marketplace and install the plugin.** Inside a Claude Code session:

```
/plugin marketplace add TerminalSkills/skills
/plugin install seog@terminal-skills
```

Claude Code asks for the **SEOG MCP token** during install and stores it in your
credential store (`~/.claude/.credentials.json`), not in the repo or your settings file.

Same thing from a shell, non-interactively — useful for scripts, CI or dotfiles:

```bash
claude plugin marketplace add TerminalSkills/skills
claude plugin install seog@terminal-skills --config mcp_token="$SEOG_MCP_TOKEN"
```

Add `--scope project` (or `local`) to install for one repo instead of your user account.

**3. Verify.** In Claude Code:

```
/plugin list          # seog@terminal-skills → enabled
/mcp                  # seog → connected
```

`claude plugin details seog` shows what it added: 1 skill and 1 MCP server. Then ask
Claude *"list my SEOG businesses"* — it should call `list_businesses` and come back with
your portfolio.

**If the token prompt did not appear** (or the token changed), re-run
`/plugin` → *Configure* → `seog`, or from a shell:

```bash
claude plugin install seog@terminal-skills --config mcp_token="$NEW_TOKEN"
```

**Update / remove:**

```bash
claude plugin marketplace update terminal-skills   # pick up a new version
claude plugin uninstall seog@terminal-skills
```

### Troubleshooting

| Symptom | Cause |
|---|---|
| `/mcp` shows seog as failed | Token wrong or revoked → reissue in Settings → MCP access and reconfigure |
| Tools work but everything 402s | The account has no active plan, or the balance is empty — see below |
| A tool name "not found" | White-label/agency accounts do not get the raw-Google tools; that is by design |

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
