---
name: chrome-devtools-mcp
description: >-
  Lets a coding agent drive a real Chrome browser with DevTools: record performance traces, read console and network logs, run Lighthouse audits, take screenshots and click through pages. Use when asked to "debug this page in Chrome", "why is LCP slow", "check the console errors", "profile this page", "run Lighthouse from the agent", "set up Chrome DevTools MCP" or "install chrome-devtools-mcp". Covers MCP client setup, the chrome-devtools CLI, safe launch flags and when to pick Playwright MCP instead.
license: Apache-2.0
compatibility: "Node.js 20.19+ (or 22.12+), npm, current stable Google Chrome, an MCP client such as Claude Code, Codex, Gemini CLI or Cursor"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: "chrome-devtools, mcp, performance, debugging, lighthouse"
  repository: https://github.com/ChromeDevTools/chrome-devtools-mcp
---

# Chrome DevTools MCP — give your agent the DevTools panel

## Overview

`chrome-devtools-mcp` is an official Google (ChromeDevTools) MCP server, published on npm, that starts or attaches to Chrome and exposes what DevTools can do as tools: performance traces with insights, network and console inspection (with source-mapped stack traces), Lighthouse audits, screenshots, device and network emulation, heap snapshots, and Puppeteer-based input automation that waits for results. The same package ships a `chrome-devtools` command-line client, so the same tools can be scripted from a shell.

Pick it when the question is "what is the page doing and why is it slow or broken" in Chrome. Pick `playwright-mcp` when you need cross-browser runs (Firefox, WebKit), test authoring, or a tool built around the accessibility tree for driving flows; the two overlap on clicking and screenshots, but only this one records DevTools performance traces and runs Lighthouse. This skill describes version 1.12.0 (Apache-2.0), checked against its `--help` output and docs.

## Instructions

### Install in an MCP client

The server starts the browser lazily, the first time a tool needs one. Claude Code:

```bash
claude mcp add chrome-devtools --scope user -- npx -y chrome-devtools-mcp@1.12.0 --isolated --no-usage-statistics
```

Any other client takes the standard JSON entry:

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@1.12.0", "--isolated", "--no-usage-statistics"]
    }
  }
}
```

The README uses `@latest`; pinning a version keeps tool names stable between sessions. Requirements are Node.js 20.19+ (or 22.12+, or 23+) and a current stable Chrome. A first smoke test is the prompt "Check the performance of https://developers.chrome.com": the browser opens and a trace is recorded.

### Launch options worth knowing

Run `npx chrome-devtools-mcp@1.12.0 --help` for the full list. The ones that matter day to day:

| Option | Effect |
|--------|--------|
| `--headless` | No visible window (default is a visible window). |
| `--isolated` | Temporary profile, deleted when the browser closes. Without it, the profile persists in `$HOME/.cache/chrome-devtools-mcp/chrome-profile` and keeps cookies between runs. |
| `--channel canary` | Use Chrome `stable` (default), `beta`, `dev` or `canary`. |
| `--executablePath` | Use a specific Chrome binary. |
| `--viewport 1280x720` | Initial window size. |
| `--browserUrl http://127.0.0.1:9222` | Attach to a Chrome you already started with remote debugging. |
| `--wsEndpoint` | Same, over WebSocket (`--wsHeaders` adds auth headers). |
| `--slim` | Only three tools: navigate, run script, screenshot. |
| `--no-performance-crux` | Do not send trace URLs to the CrUX API for field data. |
| `--no-usage-statistics` | Opt out of Google usage statistics (also off when `CI` is set). |
| `--redactNetworkHeaders` | Redact sensitive headers in network output. |
| `--no-javascript-evaluation` | Disable `evaluate_script` and `initScript`; not a sandbox. |
| `--allowedUrlPattern` / `--blockedUrlPattern` | Restrict which URLs the browser can reach (the allow-list needs Chrome 149+). |
| `--no-category-network` (and other `--no-category-*`) | Drop a tool category to shrink the tool list. |

Environment variables: `CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS` and `CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS` turn off telemetry and the npm update check.

### The tools

Tools are grouped by category. Page-scoped tools take a `pageId` (from `list_pages`).

- Navigation: `list_pages`, `new_page`, `select_page`, `navigate_page` (url, back, forward, reload), `close_page`, `wait_for`.
- Inspection: `take_snapshot` (text tree of the page where each element has a `uid`), `take_screenshot` (optional `filePath`), `evaluate_script`, `list_console_messages`, `get_console_message`, `get_css_styles`.
- Input: `click`, `fill`, `fill_form`, `type_text`, `press_key`, `hover`, `drag`, `upload_file`, `handle_dialog`. They address elements by the `uid` from the latest snapshot, so take a fresh snapshot after the page changes.
- Network: `list_network_requests` (filter by `resourceTypes`, page with `pageSize`), `get_network_request` by `reqid`.
- Performance: `performance_start_trace` (`reload`, `autoStop`, `filePath`), `performance_stop_trace`, `performance_analyze_insight` (`insightName`, `insightSetId`).
- Audit: `lighthouse_audit` with `device` (desktop or mobile) and `mode` (navigation or snapshot).
- Emulation: `emulate` (`networkConditions` such as "Slow 4G", `cpuThrottlingRate`, `viewport`, `colorScheme`, `geolocation`, `userAgent`), `resize_page`.
- Memory: `take_heapsnapshot` and the heap-snapshot analysis tools; if they are missing from your client, start the server with `--memoryDebugging`.

### Performance workflow

1. Open the page and set realistic conditions: `new_page`, then `emulate` with `networkConditions: "Slow 4G"` and `cpuThrottlingRate: 4`.
2. `performance_start_trace` with `reload: true` and `autoStop: true` (navigate to the right URL first). The result lists lab metrics (LCP with its breakdown, CLS), CrUX field data if the URL has any, and the available insights per insight set (for example `NAVIGATION_0`).
3. Ask for detail with `performance_analyze_insight`, passing the `insightSetId` and an `insightName` exactly as listed (`LCPBreakdown`, `DocumentLatency`, ...).
4. Save the raw trace with `filePath: "trace.json.gz"` when you want to keep it or open it in the DevTools Performance panel.

### Debugging workflow

Reproduce, then read evidence: `take_snapshot`, perform the clicks, `list_console_messages` (filter `types` to errors), `list_network_requests`, and `get_network_request` for the failing `reqid`. Console messages and network requests are kept for the last three navigations by default (`--maxNavigationSaved` raises it up to 25).

### The command-line client

The package installs a `chrome-devtools` command. It talks to a background daemon that starts the browser on the first call, runs headless and isolated by default, and keeps state between commands:

```bash
npm i chrome-devtools-mcp@1.12.0 -g
chrome-devtools status
chrome-devtools new_page "http://127.0.0.1:4321/products/trail-shoes"
chrome-devtools take_snapshot 2
chrome-devtools list_console_messages 2 --types error
chrome-devtools emulate 2 --networkConditions "Slow 4G" --cpuThrottlingRate 4
chrome-devtools performance_start_trace 2 --reload true --autoStop true
chrome-devtools performance_analyze_insight 2 NAVIGATION_0 LCPBreakdown
chrome-devtools list_network_requests 2
chrome-devtools get_network_request 2 --reqid 6
chrome-devtools lighthouse_audit 2 --mode navigation --device mobile
chrome-devtools take_screenshot 2 --filePath ./artifacts/product-page.png
chrome-devtools stop
```

The page id is the first positional argument of page-scoped commands. A fresh daemon has `about:blank` as page 1, so the page you open is usually page 2; read the `## Pages` list in the output. Required arguments are positional (for `performance_analyze_insight`: page id, insight set id, insight name); optional ones are flags. Add `--output-format=json` for machine-readable output. Always run `chrome-devtools stop` when finished.

## Examples

### Example 1: find why a product page has a slow LCP

Request: "The trail-shoes page feels slow on phones. Find what delays the largest paint, our dev server is on port 4321."

```bash
chrome-devtools new_page "http://127.0.0.1:4321/products/trail-shoes"
chrome-devtools emulate 2 --networkConditions "Slow 4G" --cpuThrottlingRate 4
chrome-devtools performance_start_trace 2 --reload true --autoStop true --filePath ./artifacts/trail-shoes-trace.json.gz
chrome-devtools performance_analyze_insight 2 NAVIGATION_0 LCPBreakdown
chrome-devtools stop
```

The trace summary prints the LCP element and its breakdown into TTFB and render delay, plus the list of insights with their names. The `performance_analyze_insight` call takes the insight set id and the insight name from that list (`NAVIGATION_0`, `LCPBreakdown`) and returns the breakdown in detail. The agent proposes the fix (for instance preloading the hero image or removing a render-blocking stylesheet) from the evidence rather than from a Lighthouse checklist. After the fix it repeats the same trace and compares the numbers.

### Example 2: a checkout button does nothing

Request: "Clicking Pay on /checkout shows nothing. Find out why."

```bash
chrome-devtools new_page "http://127.0.0.1:4321/checkout"
chrome-devtools take_snapshot 2
chrome-devtools click 2 1_14
chrome-devtools list_console_messages 2 --types error
chrome-devtools list_network_requests 2
chrome-devtools get_network_request 2 --reqid 6
```

The snapshot gives the uid of the Pay button (here `1_14`). After the click the console lists the error with a source-mapped stack trace, and the network list shows the request that failed, for example a `POST /api/orders` with status 422. `get_network_request` with that `reqid` (here 6) shows the response body, and the agent fixes the payload validation in the repository.

## Guidelines

- Treat the browser as fully readable by the model: the server exposes page content, cookies and DevTools data to the client. Do not point it at a personal profile. Use `--isolated`, and never use `--autoConnect` or `--browserUrl` against the Chrome you browse with every day.
- The default profile directory persists logins between runs; delete it or use `--isolated` before testing with someone else's account.
- Performance traces send the page URL to the CrUX API unless you pass `--no-performance-crux`; do this for internal or staging hostnames. Usage statistics are on by default, so pass `--no-usage-statistics` in company setups.
- `--no-javascript-evaluation`, `--allowedUrlPattern` and `--redactNetworkHeaders` reduce exposure but are not a sandbox; the model can still click and type.
- Tools that write files (`filePath` on traces, screenshots and snapshots) are limited to the OS temp directory when the MCP client does not offer roots. Allow a project directory with `--workspace=/home/dev/shop` (repeatable). The `chrome-devtools` CLI is unrestricted by default.
- Chrome keeps its profile lock in a socket under the temp directory; with a very long `TMPDIR` path it fails at launch with "Socket path too long" and the server reports `Target closed`. Use a short `TMPDIR`.
- Lab numbers from a throttled local trace differ from field data. Quote both, and re-run twice before drawing conclusions from one trace.
- Only Google Chrome and Chrome for Testing are officially supported; other Chromium browsers may work.
- Do not use it for cross-browser testing, long-lived test suites, or large-scale scraping: use `playwright-mcp` or `playwright-testing`.
- The package also bundles its own agent skills (`chrome-devtools`, `chrome-devtools-cli`, `debug-optimize-lcp`, `memory-leak-debugging`, `a11y-debugging`, among others); they describe a specific version, so refresh them whenever you update the package.
