---
name: fabric
description: >-
  Fabric is a command-line tool that runs a library of reusable AI prompts, called patterns, over any text you pipe in, such as summarize, extract_wisdom or analyze_claims. Use it to summarize articles, pull key ideas from YouTube talks and podcasts, fact-check claims, write custom prompt patterns, or chain patterns into a workflow, with OpenAI, Anthropic, Gemini or local Ollama models. Trigger phrases: "summarize this article with fabric", "extract wisdom from this YouTube video", "run a fabric pattern", "create a custom fabric pattern", "pipe this into an LLM from the terminal".
license: Apache-2.0
compatibility: "Fabric 1.4.x (Go binary) on macOS, Linux or Windows; an API key for one provider or a local Ollama server; yt-dlp for YouTube transcripts"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: productivity
  tags: ["prompt-patterns", "llm-cli", "summarization", "youtube-transcripts", "ollama"]
  repository: https://github.com/danielmiessler/Fabric
---
# Fabric — Reusable AI Prompt Patterns in the Terminal

## Overview

Fabric turns prompts into named, versioned files called **patterns** and runs them from the shell. Text arrives on stdin (or from a URL or a YouTube video), Fabric wraps it with the chosen pattern's system prompt, sends it to the configured model and prints Markdown to stdout, so it composes with pipes, redirects and other CLI tools. The project ships about 260 patterns (`summarize`, `extract_wisdom`, `analyze_claims`, `summarize_paper`, `create_flash_cards`, `summarize_git_diff`, `write_pull-request`, ...), and users add private ones in a custom directory.

Fabric was rewritten from Python to Go in 2024. Old tutorials that use `pipx install`, `fabric --setup` screens from the Python era or the `yt` helper as a separate binary are out of date; the current CLI is a single `fabric` binary.

## Instructions

### Install

Use a package manager or the Go toolchain. Homebrew and the AUR install the binary as `fabric-ai`, so add an alias for interactive use (Scoop's `fabric-ai` package installs it as `fabric`).

```bash
# macOS / Linux with Homebrew
brew install fabric-ai
alias fabric='fabric-ai'

# Any OS with Go 1.26+ (binary lands in $(go env GOPATH)/bin)
go install github.com/danielmiessler/fabric/cmd/fabric@latest

# Windows
winget install danielmiessler.Fabric
```

Release archives with a checksum file are on GitHub if no package manager is available:

```bash
VER=1.4.505   # the release to install; each one publishes a checksum file
curl -LO https://github.com/danielmiessler/Fabric/releases/download/v$VER/fabric_Linux_x86_64.tar.gz
curl -LO https://github.com/danielmiessler/Fabric/releases/download/v$VER/fabric_${VER}_checksums.txt
sha256sum --ignore-missing -c fabric_${VER}_checksums.txt   # must print "fabric_Linux_x86_64.tar.gz: OK"
tar -xzf fabric_Linux_x86_64.tar.gz fabric && ./fabric --version
```

YouTube input needs `yt-dlp` on `PATH` (`brew install yt-dlp` or `pipx install yt-dlp`).

### Configure a model

`fabric --setup` (`-S`) is an interactive menu: pick providers, paste keys, choose the default vendor and model, download patterns and strategies. It writes everything to `~/.config/fabric/.env`. An agent that cannot drive the menu can write the same keys directly:

```bash
mkdir -p ~/.config/fabric
cat >> ~/.config/fabric/.env <<'EOF'
DEFAULT_VENDOR=Anthropic
DEFAULT_MODEL=claude-sonnet-4-5
EOF
# The provider key itself: export ANTHROPIC_API_KEY in your shell profile
# (create it at console.anthropic.com), or let `fabric --setup` store it.
fabric -U          # download or refresh the built-in patterns
fabric -l | head   # confirm patterns are installed
```

Other key names follow the vendor: `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`. For a local model, set `DEFAULT_VENDOR=Ollama`, `DEFAULT_MODEL=llama3.1:8b` and `OLLAMA_API_URL=http://localhost:11434`. List every provider with `fabric --listvendors` and the models your keys can reach with `fabric -L`.

Override per call with `-V` (vendor) and `-m` (model), or per pattern with an environment variable named `FABRIC_MODEL_<PATTERN>`:

```bash
export FABRIC_MODEL_SUMMARIZE='Ollama|llama3.1:8b'     # cheap local model for summaries
export FABRIC_MODEL_ANALYZE_CLAIMS='Anthropic|claude-sonnet-4-5'
```

### Run patterns

```bash
# stdin -> pattern -> stdout
cat meeting-2026-09-29.txt | fabric -p summarize_meeting

# Stream tokens as they arrive, save to a file, or copy to the clipboard
cat rfc-draft.md | fabric -sp analyze_claims
cat rfc-draft.md | fabric -p summarize -o rfc-summary.md
git diff --staged | fabric -p summarize_git_diff -c

# Preview the exact prompt without spending tokens
cat rfc-draft.md | fabric --dry-run -p summarize

# Read a pattern before trusting it
fabric --readpattern extract_wisdom
```

Useful chat flags: `-t` temperature, `--thinking=low|medium|high` for reasoning models, `-g es` answer language, `--strategy cot` to add a prompt strategy (install strategies through `--setup`, list with `--liststrategies`), `--show-metadata` to print token counts to stderr.

### Pull input from the web and YouTube

```bash
# Web page -> Markdown via Jina AI Reader (works without a key; JINA_AI_API_KEY raises limits)
fabric -u https://go.dev/blog/go1.25 -p summarize

# YouTube transcript (uses yt-dlp), then a pattern
fabric -y "https://www.youtube.com/watch?v=uXs-zPc63kM" -p extract_wisdom
fabric -y "https://www.youtube.com/watch?v=uXs-zPc63kM" --transcript-with-timestamps -p summarize_lecture

# Transcript only, no model call, for saving or grepping
fabric -y "https://www.youtube.com/watch?v=uXs-zPc63kM" > talk-transcript.txt
```

`--comments` and `--metadata` need a YouTube Data API key (`YOUTUBE_API_KEY`, set through `--setup`). `--yt-dlp-args="..."` passes extra options to yt-dlp. Local audio or video goes through `--transcribe-file meeting.m4a --transcribe-model whisper-1` (OpenAI speech-to-text; `--split-media-file` handles files over 25 MB with ffmpeg).

### Write a custom pattern

A pattern is a directory containing `system.md`. Put private patterns in a separate directory so `fabric -U` never overwrites them, and point Fabric at it with `CUSTOM_PATTERNS_DIRECTORY` (or the Custom Patterns entry in `--setup`). Custom patterns win over built-ins with the same name.

```bash
mkdir -p ~/fabric-patterns/extract_release_risks
cat > ~/fabric-patterns/extract_release_risks/system.md <<'EOF'
# IDENTITY and PURPOSE

You review release notes and list what could break for {{audience}}.

# OUTPUT

- A section called RISKS with at most 5 numbered items.
- A section called ACTIONS with one owner-ready task per risk.
- Output Markdown only.

# INPUT:
EOF
echo "CUSTOM_PATTERNS_DIRECTORY=$HOME/fabric-patterns" >> ~/.config/fabric/.env

cat CHANGELOG.md | fabric -p extract_release_risks -v "audience:API clients"
```

`{{name}}` placeholders are filled with `-v "name:value"` (repeat `-v` for several). Fabric stops with `missing required variable` if one is not supplied. Built-in examples: `translate` uses `{{lang_code}}`, `write_essay` uses `{{author_name}}`.

### Chain patterns

Pipes work (`... | fabric -p summarize_meeting | fabric -p create_formal_email`). A workflow file does the same in one call and can set a model or variables per step:

```yaml
# release-brief.yaml
name: release-brief
steps:
  - pattern: extract_release_risks
    variables:
      audience: mobile clients
  - pattern: create_5_sentence_summary
    model: llama3.1:8b
    vendor: Ollama
```

```bash
cat CHANGELOG.md | fabric --workflow release-brief.yaml -o release-brief.md
```

Progress lines go to stderr; only the last step's output reaches stdout. A step may not repeat the pattern of the step before it, and `--session` is ignored in workflows.

### Contexts, sessions and the REST server

- A context is a text file in `~/.config/fabric/contexts/` prepended to every request: `fabric -C team-style -p improve_writing`.
- `--session release-review` keeps conversation history across calls; `-X` lists sessions, `-W name` wipes one.
- `fabric --serve --api-key "$FABRIC_API_KEY"` exposes patterns and chat over HTTP on `127.0.0.1:8080` (`GET /patterns/names`, `POST /chat` streaming Server-Sent Events, Swagger UI at `/swagger/index.html`). Clients send the key in the `X-API-Key` header. `--serveOllama` adds Ollama-compatible endpoints so tools that speak the Ollama API can call patterns as models.

## Examples

### Example 1: Decide whether a 90-minute talk is worth watching

**User request:** "Here's a conference talk link. Tell me the main ideas and whether I should watch the whole thing."

```bash
fabric -y "https://www.youtube.com/watch?v=uXs-zPc63kM" > talk.txt
wc -w talk.txt                               # size check before paying for tokens
fabric -p rate_content < talk.txt            # tier label + score + reasons
fabric -p extract_wisdom < talk.txt -o talk-wisdom.md
```

The agent fetches the transcript once and reuses it, so the video is downloaded a single time. `rate_content` returns a tier (from S "must consume immediately" down to D) and a 1–100 score. Its themes are fixed in the pattern (human meaning, the future of AI, mental models, books, art), so to rate against your own interests copy it into your custom directory under a new name and replace the themes. `talk-wisdom.md` contains the sections `SUMMARY`, `IDEAS`, `INSIGHTS`, `QUOTES`, `HABITS`, `FACTS`, `REFERENCES`, `ONE-SENTENCE TAKEAWAY` and `RECOMMENDATIONS`, which is usually enough to decide whether to watch.

### Example 2: A team pattern for release notes, run on a local model

**User request:** "Our release notes are long. Make a reusable command that lists the risks for API clients, and keep the data off third-party APIs."

```bash
ollama pull llama3.1:8b
cat >> ~/.config/fabric/.env <<'EOF'
DEFAULT_VENDOR=Ollama
DEFAULT_MODEL=llama3.1:8b
OLLAMA_API_URL=http://localhost:11434
EOF
# extract_release_risks created as in "Write a custom pattern" above
cat docs/releases/4.2.md | fabric -p extract_release_risks -v "audience:API clients" -o risks-4.2.md
```

For release notes that retire `/v1/invoices/render` in favour of polling `/v1/invoices/jobs`, `risks-4.2.md` lists numbered RISKS such as "synchronous endpoint removed after March 2027" and "clients must switch to polling", followed by one ACTIONS item per risk. The pattern lives in `~/fabric-patterns`, so it can be committed to the team's dotfiles repository and survives `fabric -U`.

## Guidelines

- **Patterns are prompts, not programs.** Output varies between models and runs. Check facts and numbers before forwarding a summary, especially from small local models.
- **Long input costs money.** A one-hour transcript is roughly 10–15k words. Use `--dry-run` to see the prompt size, `--show-metadata` for token counts, and route bulk jobs to a cheaper model with `FABRIC_MODEL_<PATTERN>`. For Ollama, raise the context window with `--modelContextLength` or the input gets truncated.
- **Secrets:** Fabric reads provider keys already exported in your shell (for example `GEMINI_API_KEY`) and can write them into `~/.config/fabric/.env` when it saves settings. Keep that file out of dotfile repos and backups that others can read. `fabric -L` calls every configured provider to list models.
- **Privacy:** `-u` sends the URL to Jina AI's reader service, and cloud vendors receive the full input. Use Ollama or LM Studio for confidential documents.
- **YouTube:** transcripts depend on yt-dlp and on the video having captions. If you see errors such as `no VTT files found`, update yt-dlp first. Age-restricted and members-only videos need a signed-in session; skip them rather than handing yt-dlp the browser's login cookies. Respect the platform's terms.
- **Loops read stdin:** Fabric reads all of stdin whenever it is not a terminal, so inside `while read ...; done < list.txt` the first call swallows the rest of the list and sends it to the model. Give each call its own input: `fabric -u "$url" < /dev/null`.
- **REST server:** it listens on localhost by default. Always set `--api-key` before binding it to another address, since anyone who can reach it can spend your provider credits.
- **Pattern updates:** `fabric -U` refreshes built-in patterns in place, so never edit them there. Copy to your custom directory under a new name instead.
- **Homebrew naming:** scripts that call `fabric` fail under Homebrew/AUR installs unless the `fabric-ai` alias or a symlink exists; non-interactive shells do not load aliases, so call `fabric-ai` explicitly in scripts.
- **When not to use it:** for multi-step agent work with tools and file edits, use a coding agent. For programmatic LLM calls inside an application, use the provider SDK. Fabric fits one-shot text transformations from the shell.
