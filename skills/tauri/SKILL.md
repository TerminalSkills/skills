---
name: tauri
description: >-
  Assists with building lightweight cross-platform desktop (and mobile) applications using
  Tauri. Use when creating small, fast, secure apps with a web frontend and Rust backend
  that use the system webview instead of bundling Chromium. Trigger words: tauri, rust
  desktop, system webview, tauri commands, tauri plugins.
license: Apache-2.0
compatibility: "Requires Rust toolchain and Node.js 18+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["tauri", "desktop", "rust", "cross-platform", "webview"]
---

# Tauri

## Overview

Tauri is a framework for building cross-platform desktop and mobile applications using any web framework for the frontend and Rust for the backend. By using the system webview instead of bundling Chromium, Tauri produces binaries under 10MB with 30-80MB memory usage, featuring capability-based security, type-safe IPC commands, and a plugin ecosystem for native APIs.

## Instructions

- When setting up the architecture, build the UI with any web framework (React, Vue, Svelte, Solid) rendered in the system webview, and implement system access and heavy computation in Rust backend commands.
- When implementing IPC, define Rust functions with `#[tauri::command]` for request-response patterns (called via `invoke()` from JS), and use events for push-style communication from backend to frontend.
- When accessing native APIs, use Tauri plugins (`@tauri-apps/plugin-fs`, `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-shell`, `@tauri-apps/plugin-notification`) and define allowed capabilities in the `capabilities/` directory.
- When managing security, define capability-based permissions to restrict which APIs the frontend can access, set CSP headers, and use the isolation pattern for sandboxed environments.
- When building for distribution, use `cargo tauri build` to produce platform-specific installers (NSIS/MSI for Windows, DMG for macOS, AppImage/deb for Linux) with code signing and notarization.
- When implementing auto-updates, use `@tauri-apps/plugin-updater` with GitHub Releases or a custom server, with signature verification to prevent tampering.

## Examples

### Example 1: Build a note-taking app with encrypted local storage

**User request:** "Create a Tauri note-taking app with local file storage and encryption"

**Actions:**
1. Set up a Svelte frontend with the Tauri project scaffolding
2. Implement Rust commands for reading, writing, and encrypting note files using the `aes-gcm` crate
3. Use `@tauri-apps/plugin-store` for app settings and `@tauri-apps/plugin-dialog` for file dialogs
4. Configure capability permissions to allow only the required file system paths

**Output:** A lightweight note-taking app with encrypted local storage and native file dialogs, under 10MB.

### Example 2: Build a system monitoring dashboard

**User request:** "Create a desktop app that shows CPU, memory, and disk usage in real time"

**Actions:**
1. Define Rust commands using the `sysinfo` crate to collect system metrics
2. Use Tauri events to push metric updates from backend to frontend every second
3. Build a React dashboard with real-time charts displaying CPU, memory, and disk usage
4. Add system tray icon with quick-view menu using `@tauri-apps/plugin-tray`

**Output:** A real-time system monitor with tray icon, using under 50MB of memory.

## Guidelines

- Use commands for request-response patterns and events for push notifications; do not mix them.
- Define all allowed APIs in `capabilities/` following the principle of least privilege.
- Use `tauri::State<Mutex<T>>` for shared mutable state since Rust enforces thread safety.
- Use `@tauri-apps/plugin-store` over `localStorage` for persistent data since it survives app updates.
- Handle errors in Rust with `Result<T, String>` so error messages surface as rejected promises in JS.
- Keep the frontend framework-agnostic since Tauri works with any web framework.
- Use the auto-updater with signature verification for production apps.
