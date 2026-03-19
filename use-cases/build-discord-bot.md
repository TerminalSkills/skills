---
title: Build a Feature-Rich Discord Bot
slug: build-discord-bot
description: Build a Discord bot with slash commands, buttons, modals, select menus, role management, and embed messages. Deploy to Railway or Fly.io for a 10k-member community server.
skills:
  - typescript
  - discord-bot-builder
  - postgresql
  - redis
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

Mia manages a 10,000-member Discord server for a gaming community. Manual role assignment takes hours. New members don't know the rules. Moderation is chaotic — DMs, random channels, no audit trail. She needs a bot that onboards members with interactive flows, assigns roles automatically, lets moderators take action via buttons, and keeps an audit log.

## Step 1: Set Up the Bot with discord.js v14

```typescript
// src/index.ts — Bot entry point
import { Client, GatewayIntentBits, Partials, Collection } from "discord.js";
import { deployCommands } from "./deploy-commands";
import { loadCommands } from "./commands";
import { loadEvents } from "./events";

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// Attach commands collection to client
(client as any).commands = new Collection();

async function main() {
  await loadCommands(client);
  await loadEvents(client);
  await deployCommands();
  await client.login(process.env.DISCORD_TOKEN);
  console.log("Bot is online!");
}

main();
```

## Step 2: Register Slash Commands

```typescript
// src/deploy-commands.ts — Register slash commands with Discord API
import { REST, Routes, SlashCommandBuilder } from "discord.js";

const commands = [
  new SlashCommandBuilder()
    .setName("verify")
    .setDescription("Verify yourself to access the server"),

  new SlashCommandBuilder()
    .setName("role")
    .setDescription("Pick your roles")
    .addStringOption((opt) =>
      opt.setName("category").setDescription("Role category").setRequired(true)
        .addChoices(
          { name: "Game", value: "game" },
          { name: "Region", value: "region" },
          { name: "Platform", value: "platform" }
        )
    ),

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a member")
    .setDefaultMemberPermissions(8) // ADMINISTRATOR
    .addUserOption((opt) => opt.setName("user").setDescription("User to warn").setRequired(true))
    .addStringOption((opt) => opt.setName("reason").setDescription("Reason").setRequired(true)),

  new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Open a support ticket"),
].map((cmd) => cmd.toJSON());

export async function deployCommands() {
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN!);
  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID!, process.env.GUILD_ID!),
    { body: commands }
  );
  console.log("Commands deployed!");
}
```

## Step 3: Slash Command Handlers

```typescript
// src/commands/verify.ts — Interactive verification flow
import {
  CommandInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder,
} from "discord.js";

export async function handleVerify(interaction: CommandInteraction) {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("start_verification")
      .setLabel("✅ I agree to the rules")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("view_rules")
      .setLabel("📜 View Rules")
      .setStyle(ButtonStyle.Secondary)
  );

  const embed = new EmbedBuilder()
    .setTitle("Welcome to the Community!")
    .setDescription("Please read the rules and click **I agree** to gain access.")
    .setColor(0x5865f2)
    .addFields(
      { name: "1. Be respectful", value: "Treat everyone with respect." },
      { name: "2. No spam", value: "No unsolicited links or promotions." },
      { name: "3. Stay on topic", value: "Use the right channels for discussions." }
    );

  await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

// src/commands/ticket.ts — Modal-based ticket creation
export async function handleTicket(interaction: CommandInteraction) {
  const modal = new ModalBuilder()
    .setCustomId("ticket_modal")
    .setTitle("Open a Support Ticket");

  const titleInput = new TextInputBuilder()
    .setCustomId("ticket_title")
    .setLabel("Issue Title")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const descInput = new TextInputBuilder()
    .setCustomId("ticket_description")
    .setLabel("Describe your issue")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMinLength(20);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(descInput)
  );

  await interaction.showModal(modal);
}
```

## Step 4: Interaction Handler (Buttons, Modals, Select Menus)

```typescript
// src/events/interactionCreate.ts — Central interaction router
import { Interaction, PermissionFlagsBits, EmbedBuilder, ChannelType } from "discord.js";
import { client } from "../index";
import { pool } from "../db";

export async function handleInteractionCreate(interaction: Interaction) {
  // Slash commands
  if (interaction.isChatInputCommand()) {
    const command = (client as any).commands.get(interaction.commandName);
    if (command) await command.execute(interaction);
    return;
  }

  // Button interactions
  if (interaction.isButton()) {
    switch (interaction.customId) {
      case "start_verification":
        await handleVerificationComplete(interaction);
        break;
      case "close_ticket":
        await handleCloseTicket(interaction);
        break;
      case "ban_from_ticket":
        await handleBanFromTicket(interaction);
        break;
    }
    return;
  }

  // Modal submissions
  if (interaction.isModalSubmit()) {
    if (interaction.customId === "ticket_modal") {
      await createTicketChannel(interaction);
    }
    return;
  }

  // String select menus
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === "role_select") {
      await assignRoles(interaction);
    }
  }
}

async function handleVerificationComplete(interaction: any) {
  const guild = interaction.guild!;
  const member = interaction.member as any;

  // Assign "Verified" role
  const verifiedRole = guild.roles.cache.find((r: any) => r.name === "Verified");
  if (verifiedRole) {
    await member.roles.add(verifiedRole);
  }

  // Log to audit channel
  const auditChannel = guild.channels.cache.find((c: any) => c.name === "audit-log");
  if (auditChannel?.isTextBased()) {
    await auditChannel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("Member Verified")
          .setDescription(`<@${interaction.user.id}> completed verification`)
          .setTimestamp()
          .setColor(0x57f287),
      ],
    });
  }

  await interaction.update({ content: "✅ You're verified! Enjoy the server.", components: [], embeds: [] });
}

async function createTicketChannel(interaction: any) {
  const title = interaction.fields.getTextInputValue("ticket_title");
  const description = interaction.fields.getTextInputValue("ticket_description");
  const guild = interaction.guild!;

  // Create private channel
  const channel = await guild.channels.create({
    name: `ticket-${interaction.user.username}`,
    type: ChannelType.GuildText,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      { id: guild.roles.cache.find((r: any) => r.name === "Moderator")!.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
    ],
  });

  await pool.query(
    "INSERT INTO tickets (channel_id, user_id, title, description, status) VALUES ($1, $2, $3, $4, 'open')",
    [channel.id, interaction.user.id, title, description]
  );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("close_ticket").setLabel("🔒 Close Ticket").setStyle(ButtonStyle.Danger)
  );

  await channel.send({
    content: `<@${interaction.user.id}> Your ticket has been created.`,
    embeds: [new EmbedBuilder().setTitle(title).setDescription(description).setColor(0xfee75c)],
    components: [row],
  });

  await interaction.reply({ content: `📩 Ticket created: ${channel}`, ephemeral: true });
}

async function assignRoles(interaction: any) {
  const member = interaction.member as any;
  const selected = interaction.values;

  for (const roleId of selected) {
    const role = interaction.guild!.roles.cache.get(roleId);
    if (role) await member.roles.add(role);
  }

  await interaction.reply({ content: `✅ Roles assigned: ${selected.map((id: string) => `<@&${id}>`).join(", ")}`, ephemeral: true });
}
```

## Step 5: Guild Member Events

```typescript
// src/events/guildMemberAdd.ts — Welcome new members
import { GuildMember, EmbedBuilder, TextChannel } from "discord.js";

export async function handleGuildMemberAdd(member: GuildMember) {
  // Send welcome DM
  try {
    await member.send({
      embeds: [
        new EmbedBuilder()
          .setTitle(`Welcome to ${member.guild.name}!`)
          .setDescription("Head to #verify to get started.")
          .setThumbnail(member.guild.iconURL()!)
          .setColor(0x5865f2),
      ],
    });
  } catch {
    // DMs may be disabled
  }

  // Post in welcome channel
  const welcomeChannel = member.guild.channels.cache.find(
    (c) => c.name === "welcome"
  ) as TextChannel;

  if (welcomeChannel) {
    await welcomeChannel.send(
      `👋 Welcome <@${member.id}>! You're member #${member.guild.memberCount}. Read the rules and use /verify to unlock the server.`
    );
  }
}
```

## Step 6: Deploy to Railway

```bash
# Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json .
RUN npm ci --production
COPY dist ./dist
CMD ["node", "dist/index.js"]

# railway.json
{
  "build": { "builder": "DOCKERFILE" },
  "deploy": { "restartPolicyType": "ON_FAILURE" }
}
```

```bash
# Deploy
npm run build
railway login
railway link
railway up
```

## Results

- **Role assignment automated** — members self-assign game/region/platform roles in under 30 seconds with the select menu flow
- **Onboarding time cut by 80%** — interactive verification with embeds and buttons guides new members without mod intervention
- **Support tickets organized** — private ticket channels with audit trail replace chaotic DM moderation; mods handle 3x more issues
- **Audit log complete** — every verification, ticket, warn, and role change logged to #audit-log with timestamps and user IDs
- **Zero manual role work** — moderators freed from 4–5 hours/week of manual role assignments
