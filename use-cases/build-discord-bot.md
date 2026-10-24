---
title: Build a Feature-Rich Discord Bot
slug: build-discord-bot
description: Build a Discord bot with slash commands, buttons, modals, select menus, role management, and embed messages, then deploy it to Railway for a 10k-member community server.
skills:
  - typescript
  - postgresql
category: development
tags:
  - discord
  - bot
  - community
  - slash-commands
  - role-management
---

# Build a Feature-Rich Discord Bot

## The Problem

Mia manages a 10,000-member Discord server for a gaming community. Manual role assignment takes hours. New members don't know the rules. Moderation is chaotic: DMs, random channels, no audit trail. She needs a bot that onboards members with an interactive flow, lets them pick their own roles, gives moderators a warn command, opens private support tickets, and keeps an audit log.

## The Solution

A TypeScript bot on discord.js v14 with four slash commands (`/verify`, `/role`, `/warn`, `/ticket`) and a welcome message on join. Buttons, a select menu and a modal handle the interactive parts; PostgreSQL stores tickets and warnings; an `#audit-log` channel gets an embed for every action. It runs as a single container on Railway.

## Step-by-Step Walkthrough

### Step 1: Create the application and the project

In the [Discord Developer Portal](https://discord.com/developers/applications) create an application, add a bot, and copy its token. On the Bot page turn on the **Server Members Intent**: it is a privileged intent, needed for the join event. The bot does not read message text, so leave Message Content off (it also needs review once the bot is in many servers). Invite the bot with the `bot` and `applications.commands` scopes and the permissions View Channels, Send Messages, Embed Links, Manage Roles and Manage Channels. Its highest role must sit above the roles it assigns.

```bash
npm install discord.js pg
npm install -D typescript @types/node @types/pg tsx
```

Configuration comes from the environment (never commit the token): `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`, `DATABASE_URL`, `VERIFIED_ROLE_ID`, `MODERATOR_ROLE_ID`, `AUDIT_CHANNEL_ID`, `WELCOME_CHANNEL_ID`.

```sql
CREATE TABLE tickets (
  channel_id text PRIMARY KEY, user_id text NOT NULL, title text NOT NULL,
  description text NOT NULL, status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE warnings (
  id serial PRIMARY KEY, user_id text NOT NULL, moderator_id text NOT NULL,
  reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
```

### Step 2: Register the slash commands

Run this as its own script when the command list changes. Registering on every start is rate-limited by Discord. Guild commands update instantly, which suits a single community server.

```typescript
// src/deploy-commands.ts  (run with: npx tsx src/deploy-commands.ts)
import { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from "discord.js";

const commands = [
  new SlashCommandBuilder().setName("verify").setDescription("Read the rules and unlock the server"),
  new SlashCommandBuilder().setName("role").setDescription("Pick your roles"),
  new SlashCommandBuilder().setName("ticket").setDescription("Open a support ticket"),
  new SlashCommandBuilder()
    .setName("warn").setDescription("Warn a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName("user").setDescription("Member to warn").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(true).setMaxLength(500)),
].map((c) => c.toJSON());

const rest = new REST().setToken(process.env.DISCORD_TOKEN!);
await rest.put(
  Routes.applicationGuildCommands(process.env.CLIENT_ID!, process.env.GUILD_ID!),
  { body: commands },
);
console.log(`Registered ${commands.length} commands`);
```

`setDefaultMemberPermissions` only hides the command from non-moderators by default; the handler below checks again, because server admins can change command permissions in Discord's settings.

### Step 3: Handle commands, buttons, menus and modals

One `interactionCreate` listener routes everything. Replies that only the user should see use `flags: MessageFlags.Ephemeral` (the old `ephemeral: true` option is deprecated).

```typescript
// src/index.ts
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, Client, EmbedBuilder, GatewayIntentBits,
  MessageFlags, ModalBuilder, PermissionFlagsBits, StringSelectMenuBuilder, TextInputBuilder,
  TextInputStyle, type Guild, type Interaction,
} from "discord.js";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const env = (k: string) => process.env[k]!;
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

// The only roles members may give themselves: label -> role id
const SELF_ROLES: Record<string, string> = {
  "Valorant": "111111111111111111", "Minecraft": "222222222222222222",
  "EU": "333333333333333333", "NA": "444444444444444444",
};

async function audit(guild: Guild, title: string, text: string, color = 0x5865f2) {
  const ch = await guild.channels.fetch(env("AUDIT_CHANNEL_ID"));
  if (ch?.isTextBased()) {
    await ch.send({ embeds: [new EmbedBuilder().setTitle(title).setDescription(text).setColor(color).setTimestamp()] });
  }
}

client.on("interactionCreate", async (i: Interaction) => {
  try {
    if (i.isChatInputCommand()) {
      if (i.commandName === "verify") {
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId("agree_rules").setLabel("I agree to the rules").setStyle(ButtonStyle.Success));
        const embed = new EmbedBuilder().setTitle("Welcome to the community").setColor(0x5865f2)
          .setDescription("Read the rules, then press the button to gain access.")
          .addFields(
            { name: "1. Be respectful", value: "Treat everyone with respect." },
            { name: "2. No spam", value: "No unsolicited links or promotions." },
            { name: "3. Stay on topic", value: "Use the right channels." });
        await i.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
      } else if (i.commandName === "role") {
        const menu = new StringSelectMenuBuilder().setCustomId("role_select").setPlaceholder("Choose roles")
          .setMinValues(1).setMaxValues(Object.keys(SELF_ROLES).length)
          .addOptions(Object.keys(SELF_ROLES).map((label) => ({ label, value: label })));
        await i.reply({
          components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
          flags: MessageFlags.Ephemeral,
        });
      } else if (i.commandName === "ticket") {
        const field = (id: string, label: string, style: TextInputStyle, min: number, max: number) =>
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setMinLength(min).setMaxLength(max));
        await i.showModal(new ModalBuilder().setCustomId("ticket_modal").setTitle("Open a support ticket")
          .addComponents(field("title", "Issue title", TextInputStyle.Short, 1, 100), field("description", "Describe your issue", TextInputStyle.Paragraph, 20, 1000)));
      } else if (i.commandName === "warn") {
        if (!i.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) {
          await i.reply({ content: "You can't use this command.", flags: MessageFlags.Ephemeral });
          return;
        }
        const user = i.options.getUser("user", true);
        const reason = i.options.getString("reason", true);
        await pool.query("INSERT INTO warnings (user_id, moderator_id, reason) VALUES ($1, $2, $3)", [user.id, i.user.id, reason]);
        await user.send(`You were warned in ${i.guild!.name}: ${reason}`).catch(() => {}); // DMs may be closed
        await audit(i.guild!, "Member warned", `<@${user.id}> by <@${i.user.id}>\n${reason}`, 0xfee75c);
        await i.reply({ content: `Warned ${user}.`, flags: MessageFlags.Ephemeral });
      }
    } else if (i.isButton() && i.customId === "agree_rules") {
      await (await i.guild!.members.fetch(i.user.id)).roles.add(env("VERIFIED_ROLE_ID"));
      await audit(i.guild!, "Member verified", `<@${i.user.id}> accepted the rules`, 0x57f287);
      await i.update({ content: "You're verified. Enjoy the server!", embeds: [], components: [] });
    } else if (i.isStringSelectMenu() && i.customId === "role_select") {
      const ids = i.values.map((label) => SELF_ROLES[label]).filter(Boolean);
      await (await i.guild!.members.fetch(i.user.id)).roles.add(ids);
      await i.reply({ content: `Roles added: ${ids.map((id) => `<@&${id}>`).join(", ")}`, flags: MessageFlags.Ephemeral });
    } else if (i.isModalSubmit() && i.customId === "ticket_modal") {
      const title = i.fields.getTextInputValue("title");
      const description = i.fields.getTextInputValue("description");
      const channel = await i.guild!.channels.create({
        name: `ticket-${i.user.id}`, type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: i.guild!.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: client.user!.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
          { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
          { id: env("MODERATOR_ROLE_ID"), allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
        ],
      });
      await pool.query("INSERT INTO tickets (channel_id, user_id, title, description) VALUES ($1, $2, $3, $4)",
        [channel.id, i.user.id, title, description]);
      await channel.send({
        content: `<@${i.user.id}> your ticket was created.`,
        embeds: [new EmbedBuilder().setTitle(title).setDescription(description).setColor(0xfee75c)],
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId("close_ticket").setLabel("Close ticket").setStyle(ButtonStyle.Danger))],
      });
      await audit(i.guild!, "Ticket opened", `<@${i.user.id}>: ${title}\n${channel}`);
      await i.reply({ content: `Ticket created: ${channel}`, flags: MessageFlags.Ephemeral });
    } else if (i.isButton() && i.customId === "close_ticket") {
      if (!i.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
        await i.reply({ content: "Only moderators can close tickets.", flags: MessageFlags.Ephemeral });
        return;
      }
      await pool.query("UPDATE tickets SET status = 'closed' WHERE channel_id = $1", [i.channelId]);
      await audit(i.guild!, "Ticket closed", `<#${i.channelId}> by <@${i.user.id}>`);
      await i.reply("Closing this ticket.");
      await i.channel?.delete();
    }
  } catch (err) {
    console.error(err);
    if (i.isRepliable() && !i.replied && !i.deferred) {
      await i.reply({ content: "Something went wrong.", flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
});

client.on("guildMemberAdd", async (member) => {
  await member.send(`Welcome to ${member.guild.name}! Use /verify in the server to get started.`).catch(() => {});
  const ch = await member.guild.channels.fetch(env("WELCOME_CHANNEL_ID"));
  if (ch?.isTextBased()) await ch.send(`Welcome <@${member.id}>! Read the rules and use /verify to unlock the server.`);
});

client.once("clientReady", (c) => console.log(`Logged in as ${c.user.tag}`));
await client.login(env("DISCORD_TOKEN"));
```

The ticket title is capped at 100 characters because an embed title cannot exceed 256, and the bot adds itself to the channel overwrites because the `@everyone` deny would otherwise hide the new channel from it. Replace the placeholder role ids in `SELF_ROLES` with the ids of your own roles (enable Developer Mode in Discord, right-click a role, Copy Role ID). Only roles in that map can be self-assigned, so a member can never pick up a moderator role.

### Step 4: Deploy to Railway

The bot opens an outbound gateway connection and needs no port. Add a PostgreSQL service to the Railway project, run the SQL from Step 1 against it, and set the environment variables from Step 1 on the bot service.

```dockerfile
# Dockerfile
FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc && npm prune --omit=dev
USER node
CMD ["node", "dist/index.js"]
```

Save this as `railway.json` in the project root:

```json
{
  "build": { "builder": "DOCKERFILE" },
  "deploy": { "restartPolicyType": "ON_FAILURE" }
}
```

Set `"module": "nodenext"`, `"target": "es2022"`, `"outDir": "dist"` and `"rootDir": "src"` in `tsconfig.json`, and `"type": "module"` in `package.json`, so the top-level `await` compiles. Then deploy from the project directory:

```bash
railway login
railway link
railway up
```

## Real-World Example

Mia's team adds the bot on a Friday and pins `/verify` in the rules channel. New members press one button instead of waiting for a moderator, and pick their game and region roles from the `/role` menu. A harassment report that used to arrive as three scattered DMs now comes in through `/ticket`, lands in a private channel the moderators can see, and is closed with a button once resolved. The `warnings` table gives the team a history to check before deciding on a ban, and everything the bot does shows up in `#audit-log`.

## Related Skills

- `typescript` - strict types for the interaction handlers and build setup
- `postgresql` - tickets and warning history
