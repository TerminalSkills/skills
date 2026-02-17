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

## Skills Catalog

| Skill | Category | Description |
|-------|----------|-------------|
| [pdf-analyzer](skills/pdf-analyzer/) | Documents | Extract text, tables, and structured data from PDF files |
| [excel-processor](skills/excel-processor/) | Data & AI | Read, transform, analyze, and generate Excel/CSV files |
| [code-reviewer](skills/code-reviewer/) | Development | Perform thorough code reviews with actionable feedback |
| [git-commit-pro](skills/git-commit-pro/) | Development | Write conventional, well-structured git commit messages |
| [api-tester](skills/api-tester/) | Development | Test REST and GraphQL API endpoints with assertions |
| [docker-helper](skills/docker-helper/) | DevOps | Build, debug, and optimize Docker configurations |
| [web-scraper](skills/web-scraper/) | Automation | Extract structured data from web pages reliably |
| [data-visualizer](skills/data-visualizer/) | Data & AI | Generate charts and visualizations from datasets |
| [markdown-writer](skills/markdown-writer/) | Content | Generate well-structured technical documentation |
| [sql-optimizer](skills/sql-optimizer/) | Data & AI | Analyze and optimize SQL queries for performance |
| [test-generator](skills/test-generator/) | Development | Generate unit, integration, and e2e tests for existing code |
| [security-audit](skills/security-audit/) | Development | Scan code for vulnerabilities, secrets, and dependency CVEs |
| [code-migration](skills/code-migration/) | Development | Migrate codebases between frameworks, languages, and API versions |
| [cicd-pipeline](skills/cicd-pipeline/) | DevOps | Generate and optimize CI/CD pipelines for testing, building, and deployment |
| [mcp-server-builder](skills/mcp-server-builder/) | Data & AI | Build MCP servers to connect AI agents to external services |
| [monorepo-manager](skills/monorepo-manager/) | Development | Manage dependencies and workspaces in monorepos |

## Use Cases

Step-by-step guides for common workflows:

- [Analyze PDF Documents](use-cases/analyze-pdf-documents.md)
- [Process Excel Data](use-cases/process-excel-data.md)
- [Automate Code Reviews](use-cases/automate-code-reviews.md)
- [Write Better Commits](use-cases/write-better-commits.md)
- [Test API Endpoints](use-cases/test-api-endpoints.md)
- [Manage Docker Containers](use-cases/manage-docker-containers.md)
- [Scrape Web Data](use-cases/scrape-web-data.md)
- [Create Data Visualizations](use-cases/create-data-visualizations.md)
- [Generate Documentation](use-cases/generate-documentation.md)
- [Optimize SQL Queries](use-cases/optimize-sql-queries.md)
- [Manage Monorepo Dependencies](use-cases/manage-monorepo-dependencies.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on creating and submitting new skills.

## License

Apache-2.0. See [LICENSE](LICENSE).
