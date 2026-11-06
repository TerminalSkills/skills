---
name: astrbot
description: >-
  AstrBot is a self-hosted AI chatbot platform that connects one LLM assistant to messaging apps such as Discord, Slack, Telegram, LINE and Mattermost, with a web panel for providers, platforms and plugins. Use this skill to install it with uv or Docker, keep the panel on localhost, set the admin password, reset it, script settings with `astrbot conf`, manage plugins, or point it at a local Ollama model. Trigger phrases: "self-hosted chatbot for Discord and Slack", "deploy AstrBot", "AstrBot dashboard password", "run an LLM bot without writing code".
license: Apache-2.0
compatibility: "Python 3.12+ with uv, or Docker 24+; an LLM provider key or a local Ollama server"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: automation
  tags: "chatbot, self-hosted, discord, slack, llm"
  repository: https://github.com/AstrBotDevs/AstrBot
---
# AstrBot — one self-hosted LLM assistant for many chat apps

## Overview

AstrBot (v4.29.4 at the time of writing, license AGPL-3.0, Python 3.12+) is a server you run yourself. It holds the model connection, the conversation memory and a plugin system, and it logs in to chat platforms as a bot. Platforms with official adapters include QQ, Telegram, Slack, Discord, LINE, Feishu, DingTalk, WeCom, KOOK, Misskey and Mattermost. Model providers are OpenAI-compatible endpoints, Anthropic, Google Gemini, DeepSeek, Moonshot, Ollama and LM Studio.

An agent can do the server side: install, start, bind, set the password, change config keys, manage plugins. Adding a platform adapter, pasting a bot token and choosing the chat model happen in the web panel (WebUI, port 6185), which has no CLI or documented HTTP API for those steps. Tell the user which screens to open instead of guessing at files.

This skill is for running the ready-made platform. If the user wants custom bot logic in TypeScript or Python (their own slash commands, database, buttons), use the `discord` or `slack-bot-builder` skills and write the bot instead.

## Instructions

### Install with uv (single machine)

```bash
uv tool install astrbot --python 3.12
mkdir -p ~/astrbot-data && cd ~/astrbot-data
astrbot init --yes
```

`astrbot init` makes the working directory (it writes a `.astrbot` marker and creates `data/`, `data/config`, `data/plugins`, `data/temp`). Run every later `astrbot` command from this directory. `astrbot --version` prints the CLI version; pin a release with `uv tool install astrbot==4.29.4 --python 3.12`.

### Start it on localhost only

The panel listens on `0.0.0.0:6185` by default, which is every interface. Bind it to loopback with the `DASHBOARD_HOST` environment variable (read before the config file):

```bash
cd ~/astrbot-data
DASHBOARD_HOST=127.0.0.1 astrbot run --port 6185
```

The same setting lives in `data/cmd_config.json` as `dashboard.host`. `astrbot conf` cannot set the host (its keys are `timezone`, `log_level`, `dashboard.port`, `dashboard.username`, `dashboard.password`, `callback_api_base`), so use the environment variable or edit that JSON while AstrBot is stopped. The startup log prints a warning when it listens on all interfaces: treat that line as a failure to fix.

To reach the panel from another machine, use an SSH tunnel (`ssh -L 6185:127.0.0.1:6185 user@server`) or a reverse proxy with TLS, not an open port.

### Admin password

New installs print a random password for the user `astrbot` in the first startup log. Change it before any platform token is pasted in:

```bash
astrbot password                      # interactive, changes the panel password
astrbot password --username admin     # also rename the user
```

Never leave a default or guessable password, and never write the password into a command in shared history; `astrbot conf set dashboard.password` puts it in the shell history, so prefer `astrbot password`. To seed a password at init time for unattended setups, export `ASTRBOT_DASHBOARD_INITIAL_PASSWORD` from a secret store before `astrbot init`. If it is lost, `astrbot run --reset-password` regenerates the initial password and prints it in the startup log.

### Install with Docker

Run the published image, pinned to a release, with the panel published on loopback only and data on a volume:

```bash
mkdir -p ~/astrbot && cd ~/astrbot
docker run -d --name astrbot --restart unless-stopped \
  -p 127.0.0.1:6185:6185 \
  -v "$PWD/data:/AstrBot/data" \
  -e TZ=Europe/Berlin \
  soulter/astrbot:v4.29.4
docker logs astrbot 2>&1 | grep -i -E "password|dashboard"
```

The official compose file maps `"6185:6185"` (all interfaces) and also `6199` for the OneBot v11 websocket. Change the first to `"127.0.0.1:6185:6185"` and drop `6199` unless a OneBot or NapCat client really connects to it. The state is in `./data`; back it up before upgrades. Upgrade by pulling the new tag, `docker rm -f astrbot`, and running the same command with the new tag.

### Connect a model provider (panel)

Open `http://127.0.0.1:6185`, then **Providers → Chat Completion → Add**. For hosted models enter the base URL and key; the API Key field accepts `$DEEPSEEK_API_KEY`-style references, so the key can stay in the container environment (`-e DEEPSEEK_API_KEY=...`, introduced in v4.13.0). Click **Save and Fetch Models**, enable the model, then open **Config**, pick the profile, and set **AI → Model → Chat Model**.

For a local Ollama server choose `Ollama` (default base URL `http://127.0.0.1:11434/v1`). When AstrBot runs in Docker on Linux use the Docker host address (the docs use `http://172.17.0.1:11434/v1`); on Docker Desktop use `http://host.docker.internal:11434/v1`. Pull the model first with `ollama pull`.

### Connect a platform (panel)

**Platforms → Add Adapter**, pick Discord or Slack, paste the token.
- Discord: create an application in the Developer Portal, reset and copy the bot token, enable Presence, Server Members and Message Content intents, generate an OAuth2 URL with the `Bot` scope, and add the bot to the server. Test with `/help`. Give it only the permissions it needs, not Administrator.
- Slack: Socket Mode needs no public URL. Create the app, generate an app-level token with `connections:write` (the `app_token`), install it to get the Bot User OAuth Token (`bot_token`), add the bot scopes the docs list, and enable Socket Mode and Event Subscriptions.

Tokens belong to the user: never ask for one in chat, and tell them to paste it into the panel themselves.

### Config and plugins from the CLI

```bash
astrbot conf get                       # prints the current values of the settable keys
astrbot conf set timezone Europe/Berlin
astrbot conf set log_level INFO
astrbot plug search weather
astrbot plug list
```

`astrbot plug install <NAME>` installs one of the names `search` returns. Plugins are third-party code that runs inside the bot with its tokens in reach: read the plugin's repository before installing, and install only what a task needs. Restart (`astrbot run` again, or `docker restart astrbot`) after changes.

### Upgrade and back up

Everything stateful is in `data/` (config, plugins, the SQLite database `data_v4.db`). Stop AstrBot, copy that folder, then upgrade:

```bash
cd ~/astrbot-data
cp -a data "data-backup-$(date +%F)"
uv tool upgrade astrbot --python 3.12
astrbot --version
```

For Docker, copy `./data` the same way, then recreate the container with the new image tag. Read the release notes at https://github.com/AstrBotDevs/AstrBot/releases before a major jump, because the config format has changed between releases (the panel password storage was migrated, for example).

## Examples

### Example 1: private AI assistant for a Discord server

**Request:** "Set up a self-hosted AI bot for our Discord, 40 members, using our DeepSeek key. Nothing should be reachable from the internet."

```bash
uv tool install astrbot==4.29.4 --python 3.12
mkdir -p ~/astrbot-data && cd ~/astrbot-data
astrbot init --yes
export DEEPSEEK_API_KEY="$(cat ~/.secrets/deepseek-key)"
DASHBOARD_HOST=127.0.0.1 nohup astrbot run > astrbot.log 2>&1 &
sleep 20; grep -i -E "password|Starting WebUI" astrbot.log
```

**Result:** the log shows `Starting WebUI at http://127.0.0.1:6185` and the first-login password for `astrbot`. The agent runs `astrbot password` (the user types the new one), then tells the user to open the panel, add DeepSeek under Providers with the API Key field set to `$DEEPSEEK_API_KEY`, pick it as Chat Model, add the Discord adapter with their bot token, and send `/help` in the server to confirm.

### Example 2: Dockerized bot using a local Ollama model

**Request:** "Run AstrBot in Docker on the home server and use the Ollama model already there."

```bash
ollama pull qwen3:8b
mkdir -p ~/astrbot && cd ~/astrbot
docker run -d --name astrbot --restart unless-stopped \
  -p 127.0.0.1:6185:6185 -v "$PWD/data:/AstrBot/data" \
  soulter/astrbot:v4.29.4
docker logs astrbot 2>&1 | grep -i password
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:6185/
```

**Result:** the curl prints `200`. In the panel the user adds an Ollama provider with base URL `http://172.17.0.1:11434/v1`, enables `qwen3:8b`, and sets it as the Chat Model. If Ollama listens only on 127.0.0.1 the container cannot reach it: the user must let Ollama listen on the Docker bridge address.

## Guidelines

- AstrBot is AGPL-3.0: modified versions offered to others over a network carry source obligations. Using it unmodified for your own community is fine.
- The panel controls provider keys and platform tokens. Keep it on loopback, change the initial password, and never publish port 6185 raw.
- Do not run `astrbot run` twice in one directory: a lock file (`astrbot.lock`) blocks the second instance.
- A bot that cannot reach its platform is usually a network problem: Discord and Slack must be reachable directly from the server.
- Not for customer support with human handoff, ticketing or per-user billing logic: those need an application built around an LLM API. Not for a coding agent in chat; that is a different tool.
- The WhatsApp adapter is listed as "coming soon" upstream: do not promise it.
- Screen names in the panel follow the docs for v4.29.4 (https://docs.astrbot.app); a later release may rename them.
