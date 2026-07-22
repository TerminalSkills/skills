---
title: "Build a Cross-Platform Desktop App with Web Technologies"
slug: build-cross-platform-desktop-app
description: "Ship a native desktop application for Windows, macOS, and Linux using your existing web development skills and a single codebase."
skills:
  - electron
  - tauri
category: development
tags:
  - desktop
  - cross-platform
  - electron
  - tauri
---

# Build a Cross-Platform Desktop App with Web Technologies

## The Problem

Your team built a successful internal web tool for managing inventory, but warehouse staff need it to work offline in facilities with unreliable internet. A native desktop app would solve this, but nobody on the team writes Swift, C++, or C#. Building three separate native apps for Windows, macOS, and Linux is out of scope for a four-person team. You need a way to reuse the existing React frontend while adding offline storage, system tray integration, and auto-updates.

## The Solution

Use the **electron** skill to scaffold the desktop app shell with IPC communication, native menus, and auto-update support, then evaluate and optionally migrate to **tauri** for a smaller binary size and lower memory footprint when the app matures.

## Step-by-Step Walkthrough

### 1. Scaffold the Electron app with offline storage

Start by wrapping the existing React frontend in an Electron shell with SQLite for offline data persistence.

> Set up an Electron app that loads our React inventory dashboard. Add SQLite for offline storage so warehouse staff can scan items without internet. Include IPC handlers for reading and writing inventory records from the renderer process.

The skill configures the main process with proper security defaults: context isolation enabled, node integration disabled, and a preload script that exposes only the specific IPC channels the renderer needs.

### 2. Add native OS integrations

Desktop users expect system tray icons, notifications, and keyboard shortcuts that web apps cannot provide.

> Add a system tray icon that shows sync status (green for synced, yellow for pending, red for offline). Add a global shortcut Ctrl+Shift+I to bring the app to the front. Show a native notification when a new shipment arrives in the queue.

### 3. Evaluate Tauri as a lighter alternative

Electron bundles Chromium, producing a 150MB+ installer. Tauri uses the OS webview, producing binaries under 10MB.

> Compare our Electron app against a Tauri equivalent. Show me the binary size difference, memory usage, and what code changes are needed to migrate. Our app uses SQLite via better-sqlite3 and the Notification API.

The comparison reveals significant differences in resource usage:

```text
Desktop Framework Comparison — Inventory Scanner App
=====================================================
                          Electron 28       Tauri 2.1
Installer size (macOS)    168 MB            7.4 MB
Installer size (Windows)  154 MB            6.8 MB
Installer size (Linux)    172 MB            8.1 MB
RAM at idle               148 MB            42 MB
RAM with 10k records      210 MB            67 MB
Startup time              2.8s              0.6s
SQLite support            better-sqlite3    tauri-plugin-sql
Notification API          Electron native   tauri-plugin-notification
Auto-update               electron-updater  tauri-plugin-updater

Migration effort:
  Frontend (React):       No changes needed
  IPC bridge:             Rewrite 14 IPC handlers from Electron to Tauri commands
  Native plugins:         Replace 3 npm packages with Tauri plugins
  Build config:           New tauri.conf.json (replaces electron-builder.yml)
  Estimated time:         3-4 days for one developer
```

Tauri's Rust backend replaces Node.js IPC with a command system. The frontend stays identical -- only the bridge layer changes.

### 4. Set up auto-updates and code signing

Ship updates without requiring users to manually download new versions.

> Configure auto-updates for both platforms. For Electron use electron-updater with a GitHub Releases backend. For Tauri use the built-in updater with our self-hosted update server at updates.warehouse-internal.com. Include code signing for macOS and Windows.

## Real-World Example

A logistics startup with 12 warehouses built their inventory scanner as a React web app. When two facilities lost internet during peak season, staff could not log scans for three hours, creating a backlog of 2,400 unprocessed items. The team used the electron skill to wrap the app with SQLite offline storage in two days. After validating the approach, they migrated to Tauri, cutting the installer from 168MB to 8MB. Warehouse managers no longer complain about download times on slow facility networks, and offline scans sync automatically when connectivity returns.

## Tips

- Start with Electron if your team has no Rust experience. The migration to Tauri is straightforward once the app architecture is stable, but debugging Rust compilation errors during initial development slows momentum.
- Use context isolation and a preload script in Electron from day one. Retrofitting security after launch is far harder than building it in from the start.
- Test auto-updates on all three platforms before shipping. macOS code signing behaves differently from Windows Authenticode, and Linux distributions handle updates through package managers rather than in-app updaters.
- SQLite is the right offline storage for structured data, but consider using the filesystem directly for large binary assets like scanned images. Storing blobs in SQLite causes database bloat and slower backups.
