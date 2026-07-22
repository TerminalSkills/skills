---
name: codex-skin-pack-installer
description: >-
  Install, validate, apply, switch, and restore public-safe Codex desktop skin
  packs. Use when a user asks to customize OpenAI Codex Desktop, install a
  Codex theme or skin pack, verify that a skin package is safe to apply, fix a
  readability problem after applying a skin, or restore the default Codex
  appearance.
license: Apache-2.0
compatibility: "Requires OpenAI Codex Desktop and Node.js/npm for npx-based install."
metadata:
  author: ChannelerH
  version: "1.0.0"
  category: productivity
  tags: ["codex", "themes", "desktop", "skins", "restore"]
---

# Codex Skin Pack Installer

## Overview

You help users customize OpenAI Codex Desktop with reversible, public-safe skin packs. Your job is not to make a skin look impressive at any cost; your job is to install or apply a skin without leaking private workspace data, breaking readability, or leaving the user without a restore path.

Use this skill when the user asks for Codex themes, Codex skins, Dream Skin packs, `.codexskin` packages, custom Codex backgrounds, or restoring the default Codex appearance after a theme experiment.

## Instructions

### 1. Confirm intent and constraints

Ask only for missing information that affects safety or installation:

- Operating system and whether the official Codex desktop app is installed.
- The requested skin slug or visual direction.
- Whether they want preview-only, persistent apply, switch to another skin, or restore default.

Before applying anything, state that the workflow is unofficial and reversible. Do not claim affiliation with OpenAI.

### 2. Prefer the maintained installer skill

Install the helper skill from the public source:

```bash
npx skills add ChannelerH/codex-skin-packs --skill codex-skin-pack-installer --global --agent codex --yes
```

Then ask Codex to perform the selected action:

```text
Use $codex-skin-pack-installer to install the caishen-readable Codex skin pack and tell me how to restore the default theme.
```

Use `caishen-readable` as the default starter skin when the user asks for a light, readable fortune-style theme. Use `mythic-guardian-noir` when the user asks for a dark cinematic theme.

### 3. Validate before applying

Inspect the downloaded or local pack before changing the desktop appearance:

- `theme.json` exists and has a stable skin id.
- Required assets exist and are referenced by relative paths.
- A README or restore note exists.
- The pack does not contain private Codex screenshots, task names, file paths, emails, or chat content.
- The theme does not hide essential controls or lower text contrast below readable levels.

Stop and report the failed check if any item is unsafe.

### 4. Apply, verify, and keep the restore path visible

After applying or previewing the skin:

- Verify that sidebar labels, task output, code blocks, diffs, and composer input remain readable.
- If the user reports eye strain, low contrast, blocked faces, or hidden controls, restore first, then switch to a more readable pack.
- If the skin disappears after restart, explain whether the chosen method was preview-only or persistent, then re-apply using the persistent path if available.
- Always include the exact restore command or restore steps in the final response.

## Examples

### Example 1: Install a readable fortune skin

User request:

```text
Install a bright Caishen-style Codex skin, but keep text readable.
```

Agent behavior:

1. Install `codex-skin-pack-installer` using `npx skills add`.
2. Ask Codex to install `caishen-readable`.
3. Validate `theme.json`, assets, and restore guidance.
4. Apply the skin.
5. Verify that composer text, sidebar items, and code blocks are readable.
6. Return the selected skin and restore path.

Expected response shape:

```text
Applied `caishen-readable`.
Readability check: sidebar, task output, diffs, and composer are legible.
Restore: use $codex-skin-pack-installer to restore the default Codex theme.
```

### Example 2: Recover from a bad skin

User request:

```text
The Codex skin is too dark and I cannot read the sidebar.
```

Agent behavior:

1. Restore the default theme first.
2. Ask whether the user wants a lighter replacement.
3. If yes, install or switch to `caishen-readable`.
4. Verify the UI after switching.

Expected response shape:

```text
Restored the default Codex appearance first.
Switched to `caishen-readable` only after confirming the restore path.
The sidebar and composer are readable now.
```

## Guidelines

- Treat privacy as a hard gate: never publish or reuse private Codex screenshots.
- Treat readability as a hard gate: a skin that looks good but hides text is not acceptable.
- Prefer reversible changes and clear restore instructions.
- Do not bypass platform protections, login walls, or system security prompts.
- Do not install unknown packs without inspecting their files first.
