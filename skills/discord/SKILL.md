---
name: discord
description: >-
  Discord is a chat platform whose bot API lets programs read events, answer slash commands and post messages in servers. Use this skill to create a Discord application and bot, choose gateway intents, register slash commands, reply to interactions, send embeds and buttons, check permissions, handle rate limits, and post through webhooks or the plain REST API with discord.js 14. Triggers: "make a Discord bot", "register slash commands", "ephemeral reply", "Discord webhook", "MessageContent intent".
license: Apache-2.0
compatibility: "Node.js 18+ (discord.js 14.x), a Discord account with permission to add apps to a server"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: "discord, discord-js, bot, slash-commands, webhooks"
  repository: https://github.com/discordjs/discord.js
---

# Discord — bots, slash commands and webhooks with discord.js 14

## Overview

A Discord bot is an application with a bot user. It connects to the Gateway (a WebSocket that streams events such as interactions) and calls the REST API (`https://discord.com/api/v10`) to act. Most bots today are driven by **interactions**: users run slash commands or press buttons, Discord sends the bot an event, and the bot must respond within 3 seconds.

This skill targets discord.js 14 (14.27 at the time of writing), the main Node.js library. Sources: the Discord developer docs (discord.com/developers/docs), the discord.js guide (discordjs.guide) and the library reference (discord.js.org). The code below type-checks under `tsc --strict` against discord.js 14.27.

Two lighter options need no gateway connection: a **webhook** (post-only, one URL per channel) and plain **REST calls** with the bot token.

## Instructions

### 1. Create the application and bot (done by a human)

An agent cannot do this step; the owner must:

1. Open the Developer Portal (discord.com/developers/applications), choose New Application.
2. On the General Information page copy the **Application ID** into `DISCORD_APP_ID`.
3. On the Bot page choose Reset Token and store it in `DISCORD_TOKEN`. The token is shown once; anyone holding it controls the bot.
4. Under Installation / OAuth2 URL Generator select the scopes `bot` and `applications.commands`, pick the minimum bot permissions, open the generated URL and add the bot to a server you manage.
5. For testing, enable Developer Mode (User Settings, Advanced), right-click the server and copy its ID into `DISCORD_GUILD_ID`.

### 2. Install

```bash
mkdir release-bot && cd release-bot
npm init -y
npm install discord.js
npm install -D typescript @types/node tsx
```

Never commit the token. Keep `DISCORD_TOKEN`, `DISCORD_APP_ID` and `DISCORD_GUILD_ID` in the environment or a gitignored `.env` (run with `node --env-file=.env`).

### 3. Gateway intents

Intents select which events the Gateway sends. Request only what you use.

| Intent | Privileged | Needed for |
|---|---|---|
| `Guilds` | no | slash commands, guild and channel cache (enough for most bots) |
| `GuildMembers` | **yes** | member join/leave events, full member lists |
| `GuildPresences` | **yes** | online status, activities |
| `MessageContent` | **yes** | reading the text of messages that do not mention the bot |
| `GuildMessages`, `GuildMessageReactions` | no | message and reaction events (content is empty without `MessageContent`) |

Privileged intents must be switched on in the Bot page of the Developer Portal. Once the people who can see your app across all its servers exceed 10,000, you must also apply for Discord's approval to use them (the older "100 servers" threshold no longer applies). A slash-command bot needs none of them; do not enable them "just in case".

### 4. Register slash commands

Registration is a separate step from running the bot. Run it when command definitions change, not on every start.

```typescript
import { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from "discord.js";

const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check that the bot is alive"),
  new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Open a support ticket")
    .addStringOption((o) =>
      o.setName("topic").setDescription("What do you need help with?").setRequired(true).setMaxLength(100),
    ),
  new SlashCommandBuilder()
    .setName("purge-notes")
    .setDescription("Delete the bot's saved notes")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(0), // 0 = guild only
].map((c) => c.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN!);
const appId = process.env.DISCORD_APP_ID!;
const guildId = process.env.DISCORD_GUILD_ID;

async function main() {
  // Guild commands appear instantly; global commands can take up to an hour to propagate.
  const route = guildId
    ? Routes.applicationGuildCommands(appId, guildId)
    : Routes.applicationCommands(appId);
  const registered = (await rest.put(route, { body: commands })) as unknown[];
  console.log(`Registered ${registered.length} commands`);
}
main();
```

- `PUT` replaces the whole command set for that scope, so omitted commands are deleted.
- Develop against **guild** commands (instant). Ship **global** commands once stable, by leaving `DISCORD_GUILD_ID` unset.
- `setDefaultMemberPermissions` only sets the default; server admins can override it in Server Settings, so still check permissions in code for dangerous actions.
- Limits: 100 global chat-input commands, 25 options per command, 25 choices per option.

### 5. Handle interactions and reply

```typescript
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, EmbedBuilder,
  Events, GatewayIntentBits, MessageFlags,
} from "discord.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (c) => {
  console.log(`Logged in as ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "ping") {
      await interaction.reply({ content: "Pong", flags: MessageFlags.Ephemeral });
      return;
    }
    if (interaction.commandName === "ticket") {
      const topic = interaction.options.getString("topic", true);
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }); // 3 s limit to first response
      const embed = new EmbedBuilder()
        .setTitle(`Ticket: ${topic}`)
        .setDescription(`Opened by ${interaction.user}`)
        .setColor(0x5865f2)
        .addFields({ name: "Status", value: "Open", inline: true });
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("ticket:close").setLabel("Close").setStyle(ButtonStyle.Danger),
      );
      await interaction.editReply({ embeds: [embed], components: [row] });
    }
    return;
  }
  if (interaction.isButton() && interaction.customId === "ticket:close") {
    await interaction.update({ content: "Ticket closed", components: [] });
  }
});

client.login(process.env.DISCORD_TOKEN);
```

Rules that cause most bugs:

- **Respond within 3 seconds**: `reply()` or `deferReply()` first. After deferring you have 15 minutes (the interaction token lifetime) to `editReply()` or `followUp()`.
- **Ephemeral** replies (visible only to the invoker) use `flags: MessageFlags.Ephemeral`. The old `ephemeral: true` option is deprecated.
- Each interaction is answered once; further messages use `followUp()`.
- Button, select-menu and modal interactions are separate types: test with `isButton()`, `isStringSelectMenu()`, `isModalSubmit()`. Put routing data in `customId` (max 100 characters), for example `ticket:close:4812`.
- Wrap handlers in try/catch; an uncaught rejection in an event handler can crash the process.

### 6. Embeds and components

- One message holds up to 10 embeds and 5 action rows. A row holds up to 5 buttons or exactly one select menu.
- Embed limits: title 256, description 4096, 25 fields, field value 1024, 6000 characters in total across all embeds in a message.
- Button styles: `Primary`, `Secondary`, `Success`, `Danger`, and `Link` (needs `setURL`, has no `customId`).
- Modals (`ModalBuilder` with `TextInputBuilder`) are opened with `interaction.showModal()` and must be the first response to that interaction.

### 7. Permissions

- Bot permissions are granted by the invite URL and by roles. Check before acting: `interaction.appPermissions?.has(PermissionFlagsBits.ManageMessages)`.
- Check the invoker with `interaction.memberPermissions?.has(PermissionFlagsBits.BanMembers)`.
- A bot can manage only members and roles below its highest role. If a role action fails with "Missing Permissions" (error code 50013), move the bot's role higher in Server Settings, Roles.
- Request least privilege: avoid `Administrator`.

### 8. Webhooks (post-only, no bot)

Create one in Channel Settings, Integrations, Webhooks, and store the URL in `DISCORD_WEBHOOK_URL`. The URL itself is the credential.

```typescript
import { WebhookClient } from "discord.js";

export async function notify(text: string) {
  const hook = new WebhookClient({ url: process.env.DISCORD_WEBHOOK_URL! });
  await hook.send({ content: text, username: "Deploy bot" });
}
```

Webhooks can send embeds, but cannot receive commands or read messages.

### 9. Plain REST with a bot token

Use this from scripts or serverless jobs that only post. Authorization is `Bot <token>`; Discord asks for a descriptive `User-Agent` of the form `DiscordBot (url, version)`.

```typescript
const token = process.env.DISCORD_TOKEN!;

async function discord(path: string, init: RequestInit = {}) {
  const res = await fetch(`https://discord.com/api/v10${path}`, {
    ...init,
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "DiscordBot (https://github.com/acme-games/release-bot, 1.0.0)",
      ...init.headers,
    },
  });
  if (res.status === 429) {
    const body = (await res.json()) as { retry_after: number };
    await new Promise((r) => setTimeout(r, body.retry_after * 1000));
    return discord(path, init);
  }
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

export const postMessage = (channelId: string, content: string) =>
  discord(`/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
  });
```

### 10. Rate limits

- Global limit: 50 requests per second per bot, plus per-route buckets reported in `X-RateLimit-*` headers.
- On HTTP 429 the body carries `retry_after` (seconds); wait that long. Repeated invalid requests (401, 403, 429) can get the IP banned by Cloudflare, so never loop on failures.
- discord.js queues and retries REST calls for you; hand-written `fetch` code must do it itself, as above.
- Do not edit a message or bulk-send in tight loops; batch with `bulkDelete` (up to 100 messages, none older than 14 days).

## Examples

### Example 1: A /ticket command for a game community

**Request**: "Add a /ticket command to our bot. It takes a topic, replies privately with an embed and a Close button."

Steps the agent takes:

```bash
npm install discord.js && npm install -D typescript @types/node tsx
export DISCORD_TOKEN="..." DISCORD_APP_ID="1234567890123456789" DISCORD_GUILD_ID="9876543210987654321"
npx tsx src/deploy.ts   # code from section 4
npx tsx src/bot.ts      # code from section 5
```

(Set the three variables from the Developer Portal in your own shell; the agent never invents or prints them.)

**Result**: `deploy.ts` prints `Registered 3 commands`. In the server, `/ticket topic:Cannot join voice` shows only to the member an embed "Ticket: Cannot join voice" with a red Close button; pressing it replaces the message with "Ticket closed" and removes the button.

### Example 2: Post a release note from CI without running a bot

**Request**: "When a release is tagged, post a message to #releases."

```typescript
// scripts/announce.ts, run in the release job with DISCORD_WEBHOOK_URL set from CI secrets
import { WebhookClient } from "discord.js";

const hook = new WebhookClient({ url: process.env.DISCORD_WEBHOOK_URL! });
await hook.send({
  content: "Release 2.4.0 is live: dark mode, faster search, 14 bug fixes",
  username: "Release bot",
});
```

```bash
npx tsx scripts/announce.ts
```

**Result**: the message appears in #releases under the name "Release bot". If the webhook was deleted, Discord answers 404 (`Unknown Webhook`); the fix is to create a new one.

## Guidelines

- Prefer slash commands and components over reading message text. They need no privileged intent and work with Discord's built-in permission UI.
- Enable `MessageContent` only if you truly parse arbitrary messages; verify the toggle in the Developer Portal when message `content` arrives empty.
- Keep tokens and webhook URLs in environment variables. If one leaks, reset the token or delete the webhook immediately; do not paste them into chat, logs or screenshots.
- Disable unwanted pings on bot output: set `allowedMentions: { parse: [] }` (discord.js) or `allowed_mentions` (REST) when echoing user text, otherwise `@everyone` in user input will fire.
- Always validate user input from slash options; treat it as untrusted text.
- Run one gateway connection per shard; a single process is fine under 2,500 servers, beyond that use `ShardingManager`.
- Discord changes the API; check `GET /gateway/bot` and the changelog at discord.com/developers/docs/change-log when behavior shifts, and pin the discord.js minor version in `package.json`.
- Not for: user-account automation (self-bots violate the Terms of Service), scraping servers, or sending unsolicited DMs.
