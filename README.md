# Terminal Skills

An open-source library of AI agent skills following the [Agent Skills](https://agentskills.io) open standard. Skills work across Claude Code, OpenAI Codex, Gemini CLI, Cursor, and other AI-powered development tools.

Browse the full catalog at [terminalskills.io](https://terminalskills.io).

## Install a Skill

Each skill is a standalone `SKILL.md` file. Install skills into your project using one of the following methods.

### Claude Code

```bash
npx terminal-skills install pdf-analyzer
```

Or using curl:

```bash
curl -sL https://raw.githubusercontent.com/terminal-skills/skills/main/skills/pdf-analyzer/SKILL.md -o .claude/skills/pdf-analyzer.md
```

### OpenAI Codex

```bash
curl -sL https://raw.githubusercontent.com/terminal-skills/skills/main/skills/pdf-analyzer/SKILL.md -o .codex/skills/pdf-analyzer.md
```

### Gemini CLI

```bash
curl -sL https://raw.githubusercontent.com/terminal-skills/skills/main/skills/pdf-analyzer/SKILL.md -o .gemini/skills/pdf-analyzer.md
```

### Cursor

```bash
curl -sL https://raw.githubusercontent.com/terminal-skills/skills/main/skills/pdf-analyzer/SKILL.md -o .cursor/skills/pdf-analyzer.md
```

Replace `pdf-analyzer` with the skill name you want to install.

## Connect via MCP

Two of these skills are backed by a hosted **MCP server** — so your agent can call them
as live tools, not just read instructions:

| Server | URL | What it adds |
|--------|-----|--------------|
| Terminal Skills | `https://api.terminalskills.io/api/mcp` | Skill routing across the whole catalog — `search_skills`, `get_skill`, `plan_task`. The agent finds and loads the right skill for a task on its own. |
| SEOG | `https://api.seog.ai/mcp` | Local SEO against your own [seog.ai](https://seog.ai) account — ~90 tools: GBP management, map-pack + geo-grid rank tracking, review replies, competitors, AI visibility, website/Search Console audits, Google posts, PDF reports. |

There are **two ways to connect** either server — no plugin install required:

**1. As a connector (claude.ai web/desktop — OAuth, one click, no key to copy)**

In Claude: **Settings → Connectors → Add custom connector**, paste the server URL, and
sign in with your account. Claude discovers the tools and handles auth for you.

**2. As an MCP server in a CLI (Claude Code, Codex, Cursor, …) with a token**

Create a token on your account page, then add the server to your MCP config:

```jsonc
{
  "mcpServers": {
    "terminal-skills": {
      "type": "http",
      "url": "https://api.terminalskills.io/api/mcp",
      "headers": { "Authorization": "Bearer YOUR_TOKEN" }
    }
  }
}
```

For SEOG, use `https://api.seog.ai/mcp` and a token from [seog.ai](https://seog.ai). The
underlying skill ([seog](skills/seog/)) still installs on its own with
`npx terminal-skills install seog` if you only want the instructions.

## Skills Catalog

| Skill | Category | Description |
|-------|----------|-------------|
| [pdf-analyzer](skills/pdf-analyzer/) | Documents | Extract text, tables, and structured data from PDF files |
| [excel-processor](skills/excel-processor/) | Data & AI | Read, transform, analyze, and generate Excel/CSV files |
| [code-reviewer](skills/code-reviewer/) | Development | Perform thorough code reviews with actionable feedback |
| [git-commit-pro](skills/git-commit-pro/) | Development | Write conventional, well-structured git commit messages |
| [ax-extract-workflow](skills/ax-extract-workflow/) | Productivity | Reconstruct past coding workflows from local ax session and commit history |
| [agent-workflow-packager](skills/agent-workflow-packager/) | Development | Convert repeated AI coding-agent workflows into reusable skill packages |
| [api-tester](skills/api-tester/) | Development | Test REST and GraphQL API endpoints with assertions |
| [docker-helper](skills/docker-helper/) | DevOps | Build, debug, and optimize Docker configurations |
| [web-scraper](skills/web-scraper/) | Automation | Extract structured data from web pages reliably |
| [xquik-twitter](skills/xquik-twitter/) | Automation | Search tweets, read replies, monitor X/Twitter, and run approval-gated actions through Xquik |
| [data-visualizer](skills/data-visualizer/) | Data & AI | Generate charts and visualizations from datasets |
| [markdown-writer](skills/markdown-writer/) | Content | Generate well-structured technical documentation |
| [sql-optimizer](skills/sql-optimizer/) | Data & AI | Analyze and optimize SQL queries for performance |
| [sequenzy-email-marketing](skills/sequenzy-email-marketing/) | Business | Operate Sequenzy email marketing campaigns, subscribers, segments, sequences, and stats from an AI agent |
| [seog](skills/seog/) | Business | Run local SEO via the SEOG MCP server: Google Business Profile, map-pack and geo-grid rank tracking, review replies, competitors, AI visibility, website audits |
| [test-generator](skills/test-generator/) | Development | Generate unit, integration, and e2e tests for existing code |
| [security-audit](skills/security-audit/) | Development | Scan code for vulnerabilities, secrets, and dependency CVEs |
| [code-migration](skills/code-migration/) | Development | Migrate codebases between frameworks, languages, and API versions |
| [cicd-pipeline](skills/cicd-pipeline/) | DevOps | Generate and optimize CI/CD pipelines for testing, building, and deployment |
| [mcp-server-builder](skills/mcp-server-builder/) | Data & AI | Build MCP servers to connect AI agents to external services |
| [routerbase-gateway](skills/routerbase-gateway/) | Data & AI | Integrate OpenAI-compatible apps with [routerbase](https://routerbase.com/) model routing and media generation |
| [bifrost](skills/bifrost/) | Data & AI | Run a self-hosted, open-source AI gateway with fallbacks, virtual keys, caching and an MCP gateway |
| [prompt-tester](skills/prompt-tester/) | Data & AI | Test and evaluate AI prompts systematically with rubrics and test suites |
| [monorepo-manager](skills/monorepo-manager/) | Development | Manage dependencies and workspaces in monorepos |
| [data-validator](skills/data-validator/) | Data & AI | Validate data quality in CSV, JSON, and database exports |
| [log-analyzer](skills/log-analyzer/) | DevOps | Analyze application logs to identify root causes and incident timelines |

## Use Cases

Step-by-step guides for common workflows:

- [Analyze PDF Documents](use-cases/analyze-pdf-documents.md)
- [Process Excel Data](use-cases/process-excel-data.md)
- [Automate Code Reviews](use-cases/automate-code-reviews.md)
- [Write Better Commits](use-cases/write-better-commits.md)
- [Package Repeated AI Agent Workflows into Skills](use-cases/package-repeated-ai-agent-workflows.md)
- [Test API Endpoints](use-cases/test-api-endpoints.md)
- [Manage Docker Containers](use-cases/manage-docker-containers.md)
- [Scrape Web Data](use-cases/scrape-web-data.md)
- [Create Data Visualizations](use-cases/create-data-visualizations.md)
- [Generate Documentation](use-cases/generate-documentation.md)
- [Optimize SQL Queries](use-cases/optimize-sql-queries.md)
- [Test AI Prompts Systematically](use-cases/test-ai-prompts-systematically.md)
- [Route AI Model Requests Through RouterBase](use-cases/route-ai-model-requests-through-routerbase.md)
- [Manage Monorepo Dependencies](use-cases/manage-monorepo-dependencies.md)
- [Validate ETL Data Quality](use-cases/validate-etl-data-quality.md)
- [Automate Release Notes](use-cases/automate-release-notes.md)
- [Debug Production Incidents](use-cases/debug-production-incident.md)
- [Automate Local SEO Monitoring for Client Businesses](use-cases/automate-local-seo-agency-reporting.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on creating and submitting new skills.

## License

Apache-2.0. See [LICENSE](LICENSE).
