---
name: macos-menubar-tuist-app
description: >-
  Builds macOS menubar apps with Tuist and SwiftUI. Use when: creating LSUIElement menubar utilities, defining Tuist manifests, or building menubar apps without Xcode-first workflows.
license: MIT
compatibility: "macOS with Xcode and Tuist 4.x; MenuBarExtra needs macOS 13+, @Observable needs macOS 14+"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/tuist/tuist
  tags: [macos, menubar, tuist, swift, desktop-app]
  use-cases:
    - "Create a macOS menubar utility with Tuist"
    - "Build and run menubar apps with script-based launch flows"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---
# macos-menubar-tuist-app

## Overview

Build and maintain macOS menubar apps with a Tuist-first workflow and stable launch scripts. Preserve strict architecture boundaries so networking, state, and UI remain testable and predictable.

Tuist generates the Xcode project and workspace from Swift manifests (`Tuist.swift`, `Project.swift`), so the generated `.xcodeproj` is never edited or committed. The app itself is a SwiftUI `MenuBarExtra` scene with `LSUIElement` set in its Info.plist, which makes it an agent app that does not appear in the Dock.

## Instructions

### Install Tuist

```bash
# mise pins the version per project in mise.toml (recommended for teams)
mise use tuist@4.210.0

# or Homebrew (macOS only)
brew tap tuist/tuist
brew install --formula tuist

tuist version
```

Project generation needs macOS with Xcode. On Linux, Tuist installs only through mise and commands that depend on Xcode, such as `tuist generate`, are unavailable.

### Core Rules

- Keep the app menubar-only unless explicitly told otherwise. Use `LSUIElement = true` by default.
- Keep transport and decoding logic outside views. Do not call networking from SwiftUI view bodies.
- Keep state transitions in a store layer (`@Observable` or equivalent), not in row/view presentation code.
- Keep model decoding resilient to API drift: optional fields, safe fallbacks, and defensive parsing.
- Treat Tuist manifests as the source of truth. Do not rely on hand-edited generated Xcode artifacts; edit manifests with `tuist edit` and regenerate.
- Prefer script-based launch for local iteration so the previous instance is stopped before the new build starts. `tuist run StatusPulse` (a scheme of the generated project) is the one-off alternative.
- Prefer `tuist xcodebuild build` over raw `xcodebuild` in local run scripts when building generated projects. It forwards every argument to `xcodebuild` and adds build insights when the project is connected to a Tuist server.

### Expected File Shape

Use this placement by default:

- `Tuist.swift`: marks the project root; `let tuist = Tuist(project: .tuist())` is enough
- `Project.swift`: app target, settings, resources, `Info.plist` keys
- `Sources/*Model*.swift`: API/domain models and decoding
- `Sources/*Client*.swift`: requests, response mapping, transport concerns
- `Sources/*Store*.swift`: observable state, refresh policy, filtering, caching
- `Sources/*Menu*View*.swift`: menu composition and top-level UI state
- `Sources/*Row*View*.swift`: row rendering and lightweight interactions
- `run-menubar.sh`: canonical local restart/build/launch path
- `stop-menubar.sh`: explicit stop helper when needed

### Workflow

1. Confirm Tuist ownership
- Verify `Tuist.swift` and `Project.swift` (or workspace manifests) exist.
- Read existing run scripts before changing launch behavior.

2. Probe backend behavior before coding assumptions
- Use `curl` to verify endpoint shape, auth requirements, and pagination behavior.
- If endpoint ignores `limit/page`, implement full-list handling with local trimming in the store.

3. Implement layers from bottom to top
- Define/adjust models first.
- Add or update client request/decoding logic.
- Update store refresh, filtering, and cache policy.
- Wire views last.

4. Keep app wiring minimal
- Keep app entry focused on scene/menu wiring and dependency injection.
- Avoid embedding business logic in `App` or menu scene declarations.

5. Standardize launch ergonomics
- Ensure run script restarts an existing instance before relaunching.
- Ensure run script does not open Xcode as a side effect.
- Use `tuist generate --no-open` when generation is required.
- When the run script builds the generated project, prefer `tuist xcodebuild build ...` instead of invoking raw `xcodebuild` directly.

### Validation Matrix

Run validations after edits:

```bash
tuist generate --no-open
tuist xcodebuild build -workspace StatusPulse.xcworkspace -scheme StatusPulse -configuration Debug
```

If launch workflow changed:

```bash
./run-menubar.sh
```

If shell scripts changed:

```bash
bash -n run-menubar.sh
bash -n stop-menubar.sh
./run-menubar.sh
```

## Examples

### Example 1: Scaffold a menubar-only app

**Request:** "Create a menubar app called StatusPulse that shows open incidents, managed by Tuist, with no Dock icon."

```swift
// Tuist.swift
import ProjectDescription

let tuist = Tuist(project: .tuist())
```

```swift
// Project.swift
import ProjectDescription

let project = Project(
    name: "StatusPulse",
    targets: [
        .target(
            name: "StatusPulse",
            destinations: .macOS,
            product: .app,
            bundleId: "dev.northwind.StatusPulse",
            deploymentTargets: .macOS("14.0"),
            infoPlist: .extendingDefault(with: [
                "LSUIElement": true,   // agent app: not shown in the Dock
            ]),
            sources: ["Sources/**"],
            dependencies: []
        ),
    ]
)
```

```swift
// Sources/StatusPulseApp.swift
import SwiftUI

@main
struct StatusPulseApp: App {
    @State private var store = IncidentStore(client: StatusClient())

    var body: some Scene {
        MenuBarExtra("StatusPulse", systemImage: "waveform.path.ecg") {
            IncidentMenuView(store: store)   // views render store state only
        }
        .menuBarExtraStyle(.window)          // popover-style panel; omit for a plain menu
    }
}
```

```bash
tuist generate --no-open
```

**Result:** `StatusPulse.xcodeproj` and `StatusPulse.xcworkspace` appear next to `Project.swift`, and the Info.plist is synthesized under `Derived/`. Once launched, the app shows only the waveform icon in the menubar. Add `*.xcodeproj`, `*.xcworkspace` and `Derived/` to `.gitignore`.

### Example 2: Restart-safe run script

**Request:** "Give me one command that rebuilds and relaunches the menubar app without opening Xcode."

```bash
#!/usr/bin/env bash
# run-menubar.sh
set -euo pipefail

APP_NAME="StatusPulse"
DERIVED_DATA="$PWD/.build/DerivedData"

pkill -x "$APP_NAME" 2>/dev/null || true     # stop the running instance, if any
tuist generate --no-open
tuist xcodebuild build \
  -workspace "$APP_NAME.xcworkspace" \
  -scheme "$APP_NAME" \
  -configuration Debug \
  -derivedDataPath "$DERIVED_DATA"
open "$DERIVED_DATA/Build/Products/Debug/$APP_NAME.app"
```

**Result:** `./run-menubar.sh` ends with xcodebuild's `** BUILD SUCCEEDED **` and the icon reappears in the menubar; a build error stops the script before `open` because of `set -e`. `stop-menubar.sh` is the single line `pkill -x StatusPulse`. The build output lands in `.build/`, so add that to `.gitignore` too.

## Guidelines

### Failure Patterns and Fix Direction

- `tuist run` cannot resolve the macOS destination:
Use run/stop scripts as canonical local run path.

- Menu UI is laggy or inconsistent after refresh:
Move derived state and filtering into the store; keep views render-only.

- API payload changes break decode:
Relax model decoding with optional fields and defaults, then surface missing data safely in UI.

- Feature asks for quick UI patch:
Trace root cause in model/client/store before changing row/menu presentation.

- The app launches but nothing shows in the Dock:
That is `LSUIElement` working. The only way in is the menubar icon, so give the menu a Quit item (`NSApplication.shared.terminate(nil)`).

### Completion Checklist

- Preserve menubar-only behavior unless explicitly changed.
- Keep network and state logic out of SwiftUI view bodies.
- Keep Tuist manifests and run scripts aligned with actual build/run flow.
- Run the validation matrix for touched areas.
- Report concrete commands run and outcomes.

### Limits

- `MenuBarExtra` requires macOS 13 and `@Observable` macOS 14; for older targets use `NSStatusItem` and `ObservableObject`.
- API tokens belong in the Keychain or an environment variable read at launch, never in `Project.swift` or source files.
- Do not use this workflow for apps that need a Dock icon and regular windows; drop `LSUIElement` and use a `WindowGroup` scene instead.
