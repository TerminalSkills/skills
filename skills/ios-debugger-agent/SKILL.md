---
name: ios-debugger-agent
description: >-
  Builds an iOS app, installs and launches it on a simulator, then collects evidence about a runtime problem: unified logs, console output, screenshots, the accessibility tree, crash reports and an LLDB session. Works with Apple's command-line tools (xcodebuild, simctl, devicectl, lldb) and with Xcode's own MCP server when it is connected. Use when the user says "run the app on the simulator", "why does this screen stay blank", "it crashes on launch", "tap through the checkout flow and show me what happens", "capture the logs", "attach the debugger" or "take a screenshot of the simulator".
license: Apache-2.0
compatibility: "macOS with Xcode 16 or later and an installed iOS simulator runtime; the Xcode MCP route needs Xcode 26.3 or later with the project open. Works in Claude Code, Codex, Gemini CLI and Cursor."
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: development
  tags: ["ios", "simulator", "debugging", "xcode", "lldb"]
---

# iOS Debugger Agent

## Overview

Debugging an iOS app from an agent session means doing by command what a developer does with the Run button and the debug area: produce a simulator build, put it on a device, start it, watch what it prints, look at the screen, poke at the interface and stop in the debugger when needed. This skill gives the order of operations, the exact commands, and the shape of the report, so that every claim about the app ("the list is empty because the response failed to decode") is backed by something that was observed in this session.

Two control routes exist. Apple's command-line tools are always there and cover building, installing, launching, logs, screenshots, deep links and LLDB. Xcode's MCP server (`xcrun mcpbridge`) can add what the command line lacks, most importantly synthesized touches; use it when it is connected.

## Instructions

### 1. Pin down the problem and the project

Ask only for what cannot be read from the repository: the symptom, the steps that trigger it, and whether a simulator the user already has open may be reused. Then look up the rest.

```bash
xcodebuild -version                                   # Xcode in use
ls -d *.xcworkspace *.xcodeproj 2>/dev/null           # a workspace wins over a project
xcodebuild -list -workspace Larkspur.xcworkspace      # schemes
xcodebuild -showdestinations -workspace Larkspur.xcworkspace -scheme Larkspur
xcrun simctl list devices                             # names, UDIDs, (Booted) or (Shutdown)
```

Pick one simulator and refer to it by UDID from then on. The alias `booted` is convenient but picks an arbitrary device when several are running.

```bash
UDID=8F2C61B4-3D7A-4E0B-9C15-6A2E7D94B310   # iPhone 17, from the list above
```

### 2. Choose the control route

| Situation | Route |
|-----------|-------|
| The session lists tools from an Xcode MCP server | Use those tools for build, run, touch input and the debugger console; fall back to the commands below for anything missing |
| No such server, user works in Xcode | Offer to connect it (below), or continue with the command line |
| Headless machine, CI, or Xcode closed | Command line only |

Connecting Xcode's server is a one-time step the user approves: in Xcode, Settings, Intelligence, turn on "Allow external agents to use Xcode tools", keep the project open, then register the bridge.

```bash
claude mcp add --transport stdio xcode -- xcrun mcpbridge   # Claude Code
codex mcp add xcode -- xcrun mcpbridge                      # Codex
```

The server arrived in Xcode 26.3. The Xcode 27 release notes say agents can boot simulators, install and launch apps, synthesize touch events and capture screenshots, and that the server gained tools to switch schemes and run destinations and to read the debugger console. The tools on offer depend on the Xcode version, so read the tool list the server reports instead of guessing a name, and fall back to the commands below for whatever is not in it.

### 3. Build for the simulator

Keep derived data inside the workspace folder so the product path is predictable and old builds from Xcode cannot be confused with this one.

```bash
xcodebuild build \
  -workspace Larkspur.xcworkspace -scheme Larkspur -configuration Debug \
  -destination "platform=iOS Simulator,id=$UDID" \
  -derivedDataPath .build/DerivedData -quiet
```

`-quiet` prints only warnings and errors; a non-zero exit status means the build failed. On failure, quote the first error with its file and line, fix or report it, and do not continue to launch an older binary. Read the product location and bundle identifier from the build settings instead of assuming them:

```bash
xcodebuild -showBuildSettings \
  -workspace Larkspur.xcworkspace -scheme Larkspur -configuration Debug \
  -destination "platform=iOS Simulator,id=$UDID" -derivedDataPath .build/DerivedData \
  | grep -E ' (TARGET_BUILD_DIR|WRAPPER_NAME|PRODUCT_BUNDLE_IDENTIFIER) = '
```

`TARGET_BUILD_DIR` joined with `WRAPPER_NAME` is the `.app` to install.

### 4. Boot, install, launch

```bash
xcrun simctl boot "$UDID"          # reports an error if it is already booted; that is fine
# the .app path is TARGET_BUILD_DIR/WRAPPER_NAME from step 3
xcrun simctl install "$UDID" .build/DerivedData/Build/Products/Debug-iphonesimulator/Larkspur.app
xcrun simctl launch --terminate-running-process "$UDID" app.larkspur.ios
```

`launch` prints the bundle identifier and the process ID. Useful variations:

- `--console-pty` connects the app's standard output and error to the terminal and blocks until the app exits. Run it as a background command writing to a file, so `print` output and Swift runtime failures are captured.
- `--stdout="$PWD/run/stdout.log" --stderr="$PWD/run/stderr.log"` writes the streams to files without blocking. Give absolute paths; the help text does not say what a relative one resolves against.
- Anything after the bundle identifier is passed as launch arguments. `-hasSeenOnboarding YES` overrides that `UserDefaults` key for this run only.
- `--wait-for-debugger` holds the process at start until LLDB attaches (step 7).

A window does not have to be visible for the device to run or for screenshots to work.

### 5. Collect evidence

Start log capture before reproducing, in the background, and note its PID so it can be stopped later.

```bash
mkdir -p run
xcrun simctl spawn "$UDID" log stream --level debug \
  --predicate 'subsystem == "app.larkspur.ios"' > run/unified.log &
echo $! > run/log.pid
```

If the app does not use `Logger` with its own subsystem, filter by process instead: `--predicate 'process == "Larkspur"'`. For something that already happened, read history with `xcrun simctl spawn "$UDID" log show --last 5m --info --debug` and the same predicate; without those two flags `show` prints default-level messages only.

| Evidence | Command |
|----------|---------|
| What is on screen | `xcrun simctl io "$UDID" screenshot run/01-after-launch.png`, then open the image |
| A recording of a flow | `xcrun simctl io "$UDID" recordVideo run/flow.mp4` in the background; stop it with an interrupt signal to its PID |
| Files, defaults, databases | `xcrun simctl get_app_container "$UDID" app.larkspur.ios data` prints the data container path |
| Crash reports | `xcrun devicectl device info files --device "$UDID" --domain-type systemCrashLogs` (Xcode 27), or the `DiagnosticReports` folder under the path from `xcrun devicectl device info mountpoint --device "$UDID"`. On older Xcode a simulator app's crash report is a `.ips` file in the Mac's `~/Library/Logs/DiagnosticReports` |
| Everything, for a bug report | `xcrun simctl diagnose` |

Take a screenshot after every step that should change the screen and look at it; do not infer the screen from logs.

### 6. Drive the interface

`simctl` cannot tap. Use the first option that fits.

1. **Xcode MCP touch tools** when the server is connected and its tool list has them.
2. **State changes that need no touch:**

   ```bash
   xcrun simctl openurl "$UDID" "larkspur://lists/weekly-shop"       # deep link or universal link
   xcrun simctl privacy "$UDID" grant photos app.larkspur.ios        # also: revoke, reset
   xcrun simctl ui "$UDID" appearance dark
   xcrun simctl push "$UDID" app.larkspur.ios run/price-drop.apns    # JSON payload with an "aps" key
   xcrun simctl status_bar "$UDID" override --time "9:41" --batteryLevel 100
   ```

3. **A temporary UI test** when the project has a UI test target. XCUIAutomation finds elements by accessibility identifier or label, performs the gesture and can print the whole element tree.

   ```swift
   // LarkspurUITests/DebugProbe.swift  (delete when finished)
   import XCTest

   final class DebugProbe: XCTestCase {
       @MainActor func testReproduce() {
           let app = XCUIApplication()
           app.launchArguments = ["-hasSeenOnboarding", "YES"]
           app.launch()
           app.buttons["addItemButton"].tap()
           app.textFields["itemNameField"].tap()
           app.textFields["itemNameField"].typeText("Oat milk")
           app.buttons["Save"].tap()
           XCTAssertTrue(app.staticTexts["Oat milk"].waitForExistence(timeout: 3))
           print(app.debugDescription)                                   // accessibility tree
           add(XCTAttachment(screenshot: XCUIScreen.main.screenshot()))
       }
   }
   ```

   ```bash
   xcodebuild test -workspace Larkspur.xcworkspace -scheme Larkspur \
     -destination "platform=iOS Simulator,id=$UDID" -derivedDataPath .build/DerivedData \
     -only-testing:LarkspurUITests/DebugProbe/testReproduce \
     -resultBundlePath run/probe.xcresult
   ```

   `xcodebuild` exits with an error when the result bundle path already exists, so delete `run/probe.xcresult` before a rerun.

4. **Ask the user** to perform the gesture while the log capture runs, when none of the above is available.

### 7. Stop in the debugger

Simulator apps are processes on the Mac, so LLDB attaches by process ID.

```bash
xcrun simctl launch --wait-for-debugger "$UDID" app.larkspur.ios     # prints the PID, e.g. 48213
xcrun lldb -p 48213
```

Inside LLDB: `breakpoint set --file CartViewModel.swift --line 88`, `continue`, then at the stop `bt` for the call stack, `frame variable` (alias `v`) for locals, `p` or `po` to evaluate an expression, and `detach` to leave the app running. For an app that hangs, one non-interactive command is enough:

```bash
xcrun lldb -p 48213 --batch -o 'thread backtrace all' -o 'detach' > run/threads.txt
```

For memory corruption or data races, rebuild with `-enableAddressSanitizer YES` or `-enableThreadSanitizer YES` on the `xcodebuild` line and reproduce again. Thread Sanitizer runs on simulators, not on physical iOS devices.

### 8. Clean up and report

Stop background captures by PID (`kill "$(cat run/log.pid)"`), delete the probe test, and clear overrides (`xcrun simctl status_bar "$UDID" clear`). Leave the simulator booted unless the user asked otherwise. Report in this shape:

```text
Build:    Larkspur (Debug) for iPhone 17, iOS 26.2 — succeeded, 0 errors, 2 warnings
Launch:   app.larkspur.ios, pid 48213
Steps:    1. launched  2. opened larkspur://lists/weekly-shop
Observed: screen shows the empty-state illustration (run/02-list.png)
Evidence: run/unified.log line 42 — "decode failed: keyNotFound(updatedAt)"
Cause:    ListDTO requires updatedAt; the API omits it for lists never edited
Next:     make updatedAt optional in ListDTO.swift:17 and rerun step 2
```

## Examples

### Example 1: a screen that stays empty

**Request:** "Run Larkspur on the simulator and find out why the weekly shop list is blank."

```bash
xcodebuild build -workspace Larkspur.xcworkspace -scheme Larkspur -configuration Debug \
  -destination "platform=iOS Simulator,id=$UDID" -derivedDataPath .build/DerivedData -quiet
xcrun simctl boot "$UDID"
xcrun simctl install "$UDID" .build/DerivedData/Build/Products/Debug-iphonesimulator/Larkspur.app
mkdir -p run
xcrun simctl spawn "$UDID" log stream --level debug \
  --predicate 'subsystem == "app.larkspur.ios"' > run/unified.log &
xcrun simctl launch --terminate-running-process "$UDID" app.larkspur.ios
xcrun simctl openurl "$UDID" "larkspur://lists/weekly-shop"
xcrun simctl io "$UDID" screenshot run/02-list.png
grep -n -i -B1 -E "error|failed" run/unified.log
```

**Result:**

```text
41-2026-09-28 10:12:44.301577+0200 0x5f3a1 Default 0x0 48213 0 Larkspur: [app.larkspur.ios:network] GET /v2/lists/weekly-shop -> 200 (1.2 kB)
42:2026-09-28 10:12:44.318204+0200 0x5f3a1 Error   0x0 48213 0 Larkspur: [app.larkspur.ios:sync] decode failed: keyNotFound(CodingKeys(stringValue: "updatedAt"))
```

The request succeeded, so the network is not the problem; decoding threw and the view model fell back to its empty state. The report names `ListDTO.updatedAt` as the cause and attaches the screenshot.

### Example 2: a crash right after launch

**Request:** "The app dies on start since my last commit. What is it?"

```bash
xcrun simctl launch --console-pty --terminate-running-process "$UDID" app.larkspur.ios \
  > run/console.log 2>&1
tail -n 5 run/console.log
```

**Result:**

```text
app.larkspur.ios: 48977
Larkspur/AppEnvironment.swift:23: Fatal error: Unexpectedly found nil while unwrapping an Optional value
```

Line 23 force-unwraps `Bundle.main.object(forInfoDictionaryKey: "LarkspurAPIBaseURL")`. `git diff HEAD~1 -- Larkspur/Info.plist` shows the key was renamed to `APIBaseURL` in the last commit. The fix is to read the new key; after rebuilding, the same launch command prints only the PID and the screenshot shows the home screen.

## Guidelines

- Never run `simctl erase`, `simctl delete` or `simctl shutdown all` on your own. They wipe or stop devices the user may depend on; ask first and name the device.
- Rebuild after every source change and reinstall before relaunching. A launch without a fresh install runs the previous binary and produces misleading evidence.
- One device, one UDID, for the whole session. Mixing `booted` with a UDID is how logs end up coming from a different simulator than the screenshots.
- `--console-pty` and `log stream` do not return. Run them in the background, write to files, and stop them by PID; never by process name, which could match the user's own tools.
- Logs and screenshots can contain account data. Keep them in a git-ignored folder such as `run/` and quote only the lines that matter.
- A temporary UI test relaunches the app with a clean process, so it does not show state that only exists in a long-running session; use logs and screenshots for that.
- A simulator is not a device: performance, memory limits, push delivery, camera and other hardware features differ. Say so when the symptom could be device-only, and switch to `xcrun devicectl` with a paired device (`devicectl list devices`, `devicectl device install app`, `devicectl device process launch --console`).
- The Xcode MCP server acts on the project that is open in Xcode. If the user has a different branch or workspace open there, the results describe that one.
- Do not use this skill for build-system failures with no runtime component, for App Store signing problems, or on Linux and Windows hosts, where none of these tools exist.
