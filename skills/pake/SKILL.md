---
name: pake
description: >-
  Pake packages a website or a static web build into a small native desktop app (typically under 10 MB) using Tauri and the system WebView instead of a bundled Chromium. Use when the user says "turn this website into a desktop app", "wrap a web app as a Mac/Windows/Linux app", "package ./dist as an installer", "make an Electron alternative for a web tool", or wants a dedicated window for a web service. Covers the pake-cli flags, JSON output for automation, declarative config files, and build targets.
license: Apache-2.0
compatibility: "Node.js 20.9+, Rust 1.85+ (needed to build; the build runs on the OS you target)"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: "pake, tauri, desktop-app, webview, packaging"
  repository: https://github.com/tw93/Pake
---

# Pake — Turn any website into a lightweight desktop app

## Overview

Pake (`pake-cli` on npm, version 3.18.0 at the time of writing) wraps a URL, a local HTML file or a static build directory in a Tauri shell and produces a native installer: `dmg` or `app` on macOS, `msi` on Windows, `deb`, `AppImage`, `rpm` or `zst` on Linux. The app uses the operating system's WebView, so installers are small and there is no Node runtime inside.

It is the quickest route when the product already exists as a website and someone wants a dedicated window, a dock or taskbar icon, a tray entry or keyboard shortcuts. It is not a framework: there is no native API surface, no custom Rust commands and no auto-updater. For an app that needs native code, use the `tauri` skill instead.

Building needs Rust, and the build compiles on the machine that runs it, so a Linux box produces Linux packages only. Cross-OS installers come from running Pake on each OS (the project documents a GitHub Actions workflow for this).

## Instructions

### Installation

```bash
npm install -g pake-cli@3.18.0
pake --version
```

Prerequisites: Node.js 20.9 or newer and Rust 1.85 or newer. In an interactive run Pake offers to install Rust when it is missing; in `--json` mode it never prompts and fails with `ENV_MISSING` instead, so install Rust first with `rustup` from https://www.rust-lang.org/tools/install. On macOS and Linux the tools `curl`, `wget`, `file` and `tar` must exist. The first build downloads and compiles the Tauri dependencies and takes several minutes; later builds are much faster.

### Package a website

```bash
pake https://github.com --name GitHub
```

The icon is fetched from the site's favicon when `--icon` is omitted. The installer lands in the system Downloads folder unless `--download-dir` is set. On Linux the app name is lowercased with hyphens (`google-translate`); on macOS and Windows case and spaces are kept.

Common options (all listed by `pake --help`):

| Option | Effect |
|---|---|
| `--name <string>` | App name |
| `--identifier <string>` | Bundle ID such as `com.northwind.github`; letters, digits, hyphens, dots |
| `--icon <string>` | Icon: `.icns` on macOS, `.ico` on Windows, `.png` on Linux (path or URL) |
| `--width`, `--height`, `--min-width`, `--min-height` | Window size in pixels |
| `--hide-title-bar` | macOS only: immersive title bar |
| `--hide-window-decorations` | Windows and Linux: frameless window with a drag region |
| `--dark-mode` | Force dark theme (macOS, Windows, Linux) |
| `--show-system-tray`, `--start-to-tray`, `--hide-on-close` | Tray and close behaviour |
| `--inject <files>` | Inject local CSS or JS files into the page |
| `--user-agent <string>` | Custom user agent |
| `--proxy-url <url>` | Proxy baked into the app (`http://`, `https://`, `socks5://`) |
| `--zoom <number>` | Initial zoom, 50 to 200 |
| `--multi-window`, `--multi-instance` | Allow several windows or several instances |
| `--targets <string>` | Output format, see below |
| `--debug`, `--iterative-build` | Debug build; app-only fast build without dmg, deb or msi |

### Choose output targets

`--targets` accepts per-platform values:

- macOS: `dmg` (default), `app`, `apple` (Apple Silicon only), `intel`, `universal` (both architectures)
- Linux: `deb`, `appimage`, `rpm`, `zst`, plus `deb-arm64`, `appimage-arm64`, `rpm-arm64`, `zst-arm64`; the default depends on the distribution (`deb, appimage` on Debian and Ubuntu)
- Windows: `x64` or `arm64`

```bash
pake https://weekly.tw93.fun --name Weekly --targets appimage --width 1200 --height 800
```

On Linux, `--no-bundle` skips packaging and leaves only the raw executable (`<name>-binary`), which helps on RPM distributions where the bundler aborts.

### Package a local build

```bash
pake ./dist --name InventoryScanner
```

The directory must contain `index.html` at its root. Only hash-based routing works; history-mode SPA routes are not supported, so build the front end with a hash router (for example `createHashRouter` in React Router). A single HTML file works too. `--use-local-file` is the explicit flag for local file packaging.

### Keep sign-in and external links working

Sites with single sign-on often open other domains. Use `--safe-domain accounts.northwind.example,login.microsoftonline.com` to keep those domains inside the app, `--new-window` to let the site open new windows for auth flows, and `--force-internal-navigation` to keep every link in the Pake window. Google OAuth and some other providers reject embedded WebViews regardless of flags; do not promise that flow works.

### Automation: JSON output and exit codes

Always pass `--json` when a script or agent runs Pake. Logs go to stderr, prompts are disabled, and stdout carries one JSON object:

```json
{"ok": true, "name": "GitHub", "platform": "linux", "arch": "x64",
 "outputs": [{"path": "/home/maria/Downloads/github.deb", "sizeBytes": 6291456, "format": "deb"}],
 "warnings": [], "error": null}
```

Exit codes: `0` success, `2` invalid input, `3` build failure, `4` missing environment or dependency setup failure, `1` unexpected. A failure carries `error.code` (`INVALID_INPUT`, `ENV_MISSING`, `BUILD_FAILED`, `UNEXPECTED`) and an `error.hint` saying how to fix it. On Linux multi-target builds `ok: true` can list fewer outputs than requested, with the failed formats in `warnings`, so check `outputs[].format`.

Confirmed on a real run (no Rust needed because validation happens first):

```text
$ pake "not a url" --name "" --json
{"ok":false,"name":null,...,"error":{"code":"INVALID_INPUT","message":"... Invalid URL","hint":"Run pake --help for the accepted options."}}
exit 2
```

### Declarative config

Option names in camelCase plus a `url` field, validated against `schema/pake.schema.json` in the repository. Unknown fields fail with `INVALID_INPUT`. CLI flags override config values. A relative `url` resolves against the working directory, not the config file.

```json
{
  "url": "https://status.northwind.example",
  "name": "NorthwindStatus",
  "identifier": "com.northwind.status",
  "width": 1100,
  "height": 760,
  "darkMode": true,
  "showSystemTray": true,
  "hideOnClose": true,
  "targets": "deb"
}
```

```bash
pake --config pake.json --json
```

## Examples

### Example 1: Desktop window for an internal status dashboard

**Request:** "Our ops team uses https://status.northwind.example all day. Give them a Linux app with a tray icon that stays running when the window is closed."

```bash
npm install -g pake-cli@3.18.0
pake https://status.northwind.example \
  --name NorthwindStatus \
  --identifier com.northwind.status \
  --icon ./assets/status.png \
  --show-system-tray --hide-on-close \
  --width 1100 --height 760 \
  --targets deb --json
```

**Result:** the JSON object lists one `deb` file in the Downloads folder (named `northwind-status`-style, lowercased with hyphens on Linux). Install with `sudo apt install ./<file>.deb` on the target machine. The first build is slow; rebuilding with a new size or icon is much faster.

### Example 2: Package a static front-end build as an installer

**Request:** "Wrap the Vite build of our warehouse scanner in `./dist` as a desktop app, and let me script it in CI."

```bash
# the app must use hash routing, and ./dist/index.html must exist
test -f ./dist/index.html || exit 1
pake ./dist --name WarehouseScanner --identifier com.harbor.scanner --json > build-result.json
echo "exit code: $?"
```

**Result:** exit code 0 and `build-result.json` with `"ok": true` and the installer path under `outputs`. On exit code 4, read `error.hint` (usually Rust or a system library is missing); on 3, rerun with `--debug` to see the Tauri build log on stderr.

## Guidelines

- Pake is a wrapper around a URL. The app loads whatever the site serves at runtime, so only package sites you trust, and tell users that updates to the site appear in the app without a new installer.
- Pake has no login handling. Cookies persist in the app; the app restores the last visited URL unless `--no-restore-last-url` is set. Do not bake credentials into flags or injected scripts.
- Pin the version (`pake-cli@3.18.0`) in CI so a flag change cannot break a build.
- Builds happen on the host OS. Plan one runner per target platform.
- Do not use Pake when the app needs native modules, a custom updater or deep OS integration: use the `tauri` or `electron` skills.
- Unsigned installers trigger Gatekeeper and SmartScreen warnings; code signing is outside Pake's scope.
- `--proxy-url` is baked into the app's WebView and does not proxy the icon download. `--camera` and `--microphone` add permission prompts on macOS only.
