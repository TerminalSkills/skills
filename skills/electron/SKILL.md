---
name: electron
description: >-
  Assists with building cross-platform desktop applications using Electron. Use when
  architecting main/renderer process communication, configuring secure contexts, implementing
  auto-updates, or packaging apps for Windows, macOS, and Linux. Trigger words: electron,
  desktop app, browserwindow, ipc, auto-update, electron-builder.
license: Apache-2.0
compatibility: "Requires Node.js 18+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["electron", "desktop", "cross-platform", "ipc", "packaging"]
---

# Electron

## Overview

Electron is a framework for building cross-platform desktop applications using web technologies. It combines a Node.js main process for system access and window management with Chromium renderer processes for the UI, communicating via IPC with context isolation and preload scripts for security.

## Instructions

- When setting up the architecture, create a main process for window management and system APIs, renderer processes for UI, and preload scripts to expose a controlled API bridge via `contextBridge.exposeInMainWorld()`.
- When implementing IPC, use `ipcMain.handle()` / `ipcRenderer.invoke()` for async request-response patterns, and `webContents.send()` for main-to-renderer push communication.
- When accessing native APIs, use dialogs, file system, clipboard, notifications, and shell operations in the main process, exposing them to the renderer through the preload bridge.
- When configuring security, keep `contextIsolation: true` and `nodeIntegration: false` (defaults), set CSP headers on all windows, sandbox renderer processes, and validate all IPC inputs in the main process.
- When packaging the app, use `electron-builder` or `electron-forge` to produce platform-specific installers (NSIS/MSI for Windows, DMG for macOS, AppImage/deb for Linux) with code signing and notarization.
- When implementing auto-updates, use `electron-updater` with GitHub Releases or a custom server, configure delta updates for smaller downloads, and verify update signatures.

## Examples

### Example 1: Build a file manager with native dialogs

**User request:** "Create an Electron app that browses and manages files with native dialogs"

**Actions:**
1. Set up main process with `BrowserWindow` and preload script exposing file system commands
2. Implement IPC handlers for `dialog.showOpenDialog()`, `dialog.showSaveDialog()`, and file operations
3. Build a React-based renderer UI for browsing directories and previewing files
4. Add context menus and keyboard shortcuts for file operations

**Output:** A cross-platform file manager with native OS dialogs and secure IPC-based file access.

### Example 2: Add auto-updates with staged rollout

**User request:** "Set up auto-updates for my Electron app using GitHub Releases"

**Actions:**
1. Configure `electron-builder` with `publish` settings pointing to GitHub Releases
2. Add `electron-updater` in the main process with update check on startup
3. Implement update UI in the renderer showing download progress and restart prompt
4. Configure staged rollout to update a percentage of users first

**Output:** An Electron app that automatically checks for updates, downloads them in the background, and prompts the user to restart.

## Guidelines

- Always use context isolation and preload scripts; never enable `nodeIntegration` in the renderer.
- Validate all IPC message data in the main process since the renderer is untrusted like a browser.
- Use `ipcMain.handle()` / `ipcRenderer.invoke()` for async operations over the older `send`/`on` pattern.
- Minimize main process work to keep it responsive for window management and IPC routing.
- Set CSP headers on all windows: `default-src 'self'; script-src 'self'`.
- Test on all target platforms since Windows, macOS, and Linux behave differently for menus, shortcuts, and file paths.
- Handle the `renderer-process-gone` event and monitor memory usage with `process.memoryUsage()`.
