---
name: swift
description: >-
  Swift is Apple's compiled, memory-safe programming language, and its toolchain (swift build, swift test, swift run, Swift Package Manager) builds command-line tools and servers on Linux and macOS as well as apps. Use when someone asks to "install Swift on Linux", "create a Swift package", "add a dependency to Package.swift", "run Swift tests", "build a Swift CLI tool", "build a static Linux binary from Swift", or "pin a Swift version with swiftly". Covers swiftly, Package.swift, Swift Testing and XCTest, and the Static Linux SDK.
license: Apache-2.0
compatibility: "Linux (x86_64 or aarch64, Ubuntu 22.04/24.04 and other supported distros) or macOS 13+; about 1.1 GB for the toolchain; Swift 6.x"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: "swift, swiftpm, swiftly, command-line, linux"
  repository: https://github.com/swiftlang/swift
---

# Swift — toolchain and Swift Package Manager for command-line and server code

## Overview

Swift is a compiled language with strong typing, value types and structured concurrency. Most people meet it through Xcode and iOS, but the same toolchain runs on Linux and macOS from the terminal, which is the part this skill covers: installing a toolchain, creating a package, resolving dependencies, building, testing, running and shipping a binary. The current stable release at the time of writing is Swift 6.4.2.

One command, `swift`, fronts everything: `swift package` manages the project, `swift build` compiles, `swift run` builds and runs an executable, `swift test` runs tests, and `swift sdk` installs cross-compilation SDKs. A project is a Swift package described by a `Package.swift` manifest, which is itself Swift code.

For SwiftUI views, performance audits and concurrency review of app code, use the existing skills `swiftui-ui-patterns`, `swiftui-performance-audit`, `swiftui-view-refactor`, `swiftui-liquid-glass` and `swift-concurrency-expert`. This skill is about the toolchain and SwiftPM.

## Instructions

### Install a toolchain with swiftly (Linux)

swiftly is the official toolchain manager. Download the archive for the machine's architecture, unpack it, and let it set itself up. Never pipe the download into a shell; each step is a separate command:

```bash
curl -O https://download.swift.org/swiftly/linux/swiftly-$(uname -m).tar.gz
tar zxf swiftly-$(uname -m).tar.gz
./swiftly init --quiet-shell-followup
. "${SWIFTLY_HOME_DIR:-$HOME/.local/share/swiftly}/env.sh"
hash -r
swift --version
```

`swiftly init` installs itself, writes `env.sh`, edits the shell profile, and installs the latest stable toolchain (about 1 GB, signature verified by default). For automation use `swiftly init --assume-yes --no-modify-profile` (add `--skip-install` to install the toolchain separately). swiftly may print an `apt-get -y install ...` line for missing system packages (it named `gnupg2` and `libz3-dev` on Ubuntu 24.04); the agent cannot run that without root, so show it to the user.

On macOS, Xcode ships a Swift toolchain. For toolchains from swift.org, download `https://download.swift.org/swiftly/darwin/swiftly.pkg`, run `installer -pkg swiftly.pkg -target CurrentUserHomeDirectory`, then `~/.swiftly/bin/swiftly init`.

### Manage versions

```bash
swiftly list-available            # releases and snapshots that can be installed
swiftly install 6.3               # latest 6.3.x patch; also "latest", "6.4.2", "main-snapshot"
swiftly use 6.3                   # switch the in-use toolchain
swiftly use --global-default 6.4.2
swiftly list                      # installed toolchains
swiftly update latest
swiftly uninstall 6.3.3
```

A `.swift-version` file containing a version such as `6.4.2` in the project root pins the toolchain for that directory; `swiftly use` with no argument prints which one is active. `swiftly run swift build +6.3` runs one command against another installed toolchain without switching. Official Docker images are the alternative on CI.

### Create a package

```bash
mkdir logscan && cd logscan || exit 1
swift package init --name logscan --type executable
```

Types: `library` (the default), `executable`, `tool` (executable with Swift Argument Parser), `build-tool-plugin`, `command-plugin`, `macro`, `empty`. Pass `--enable-swift-testing` or `--enable-xctest` to choose the test framework; recent toolchains generate a test target by default. The layout is `Sources/<Target>/` and `Tests/<Target>Tests/`.

### Package.swift: targets and dependencies

```swift
// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "logscan",
    platforms: [.macOS(.v13)],
    products: [.executable(name: "logscan", targets: ["logscan"])],
    dependencies: [
        .package(url: "https://github.com/apple/swift-argument-parser", from: "1.8.0"),
    ],
    targets: [
        .target(name: "LogScanCore"),
        .executableTarget(
            name: "logscan",
            dependencies: [
                "LogScanCore",
                .product(name: "ArgumentParser", package: "swift-argument-parser"),
            ]
        ),
        .testTarget(name: "LogScanCoreTests", dependencies: ["LogScanCore"]),
    ]
)
```

The first line is the minimum toolchain, and it matters: `swift-tools-version: 6.0` or higher switches the package to the Swift 6 language mode with strict concurrency checking. Put logic in a library target and keep the executable thin, so tests can import it (test targets can import library targets, and `@testable import` reaches internal symbols).

The manifest can also be edited from the command line:

```bash
swift package add-dependency https://github.com/apple/swift-argument-parser --from 1.8.0
swift package add-target-dependency ArgumentParser logscan --package swift-argument-parser
swift package resolve              # fetch and pin; writes Package.resolved
swift package update               # move to the newest versions the ranges allow
swift package show-dependencies
```

Commit `Package.resolved` for applications; libraries usually do not.

### Build, run, test

```bash
swift build                        # debug build into .build/
swift build -c release             # optimized build
swift build -c release --show-bin-path   # print where the binaries are
swift run logscan app.log --level ERROR  # build if needed, then run
swift test                         # all tests
swift test --filter countsEachLevel      # tests matching a regular expression
swift test --parallel
swift test --list-tests
swift test --enable-code-coverage
```

Do not hard-code `.build/release/<name>`: with the current build system the path is `.build/out/Products/Release-linux-x86_64/`. Always ask `--show-bin-path`.

### Tests: Swift Testing and XCTest

Swift Testing (the `Testing` module, bundled with the toolchain) uses macros, and `swift test` runs both it and XCTest in the same invocation:

```swift
import Testing
@testable import LogScanCore

@Test func countsEachLevel() {
    let counts = countLevels(in: "ERROR disk full\nWARN slow\nERROR timeout\n", levels: ["ERROR", "WARN"])
    #expect(counts["ERROR"] == 2)
    #expect(counts["WARN"] == 1)
}

@Test(arguments: ["ERROR", "WARN", "INFO"])
func emptyInputGivesZero(level: String) {
    #expect(countLevels(in: "", levels: [level])[level] == 0)
}
```

`#expect` records a failure and continues; `#require` stops the test. Parameterized tests (`arguments:`) report each case separately. XCTest code (`final class ...: XCTestCase` with `XCTAssertEqual`) keeps working and is the right choice only in older packages or where UI/performance metrics are needed.

### Ship a static Linux binary

The Static Linux SDK links the Swift runtime and the C library (musl) into one binary that runs on any Linux distribution of the same CPU architecture. Copy the exact `swift sdk install` command, with its URL and `--checksum`, from https://www.swift.org/install/linux/ (the checksum changes with every release; never skip it), then build:

```bash
swift sdk install https://download.swift.org/swift-6.4.2-release/static-sdk/swift-6.4.2-RELEASE/swift-6.4.2-RELEASE_static-linux-0.1.0.artifactbundle.tar.gz --checksum 3786b179936d9cc9e266dd506bd1654176358d7b25288e243359f4d17cc4dc5a
swift sdk list
swift build -c release --swift-sdk x86_64-swift-linux-musl
```

The SDK version must match the installed toolchain version exactly. Use `aarch64-swift-linux-musl` for ARM. SDKs for WebAssembly and Android are published on the same page under the same mechanism.

## Examples

### 1. Set up Swift on a fresh Ubuntu box and run a first program

Request: "Install Swift on this Ubuntu server and prove it works."

```bash
curl -O https://download.swift.org/swiftly/linux/swiftly-$(uname -m).tar.gz
tar zxf swiftly-$(uname -m).tar.gz
./swiftly init --quiet-shell-followup
. "${SWIFTLY_HOME_DIR:-$HOME/.local/share/swiftly}/env.sh" && hash -r
mkdir hello && cd hello || exit 1
swift package init --name hello --type executable
swift run hello
```

Result: swiftly downloads about 1 GB, verifies the signature, and reports `Swift 6.4.2 is installed successfully!`. `swift --version` prints `Swift version 6.4.2 (swift-6.4.2-RELEASE)` and `swift run hello` prints `Hello, world!`. If swiftly lists missing packages, relay its `apt-get` line to the user.

### 2. A log-counting CLI with a dependency, tests and a static binary

Request: "Build a `logscan` command that counts ERROR and WARN lines in a file, test the counting, and give me one binary I can copy to our servers."

With the `Package.swift` above, `LogScanCore` holds `countLevels(in:levels:)`, and `Sources/logscan/Logscan.swift` is a `@main struct Logscan: ParsableCommand` with `@Argument var path: String` and `@Option(name: .shortAndLong) var level: [String] = ["ERROR", "WARN"]`. Then:

```bash
swift test
swift run logscan app.log -l ERROR -l WARN
swift build -c release --swift-sdk x86_64-swift-linux-musl
file "$(swift build -c release --swift-sdk x86_64-swift-linux-musl --show-bin-path)/logscan"
```

Result: the test run ends with `Test run with 2 tests in 0 suites passed`; for a file with two ERROR lines and one WARN line the tool prints `ERROR: 2` and `WARN: 1`; `file` reports `ELF 64-bit LSB executable, x86-64, statically linked`. The binary is about 59 MB because the whole runtime is included; copy it with `scp`.

### 3. Add a dependency to an existing package from the command line

Request: "Add swift-argument-parser to the Greeter package and use it from the Greeter target."

```bash
swift package add-dependency https://github.com/apple/swift-argument-parser --from 1.8.0
swift package add-target-dependency ArgumentParser Greeter --package swift-argument-parser
swift package show-dependencies
swift build
```

Result: `Package.swift` gains `.package(url: "https://github.com/apple/swift-argument-parser", from: "1.8.0")` and a `.product(name: "ArgumentParser", package: "swift-argument-parser")` entry in the Greeter target; `show-dependencies` lists `swift-argument-parser` resolved at 1.8.2. The edit rewrites the manifest, so review the diff.

## Guidelines

- Check `swift --version` and the `swift-tools-version` line before debugging: many errors are a manifest that needs a newer toolchain than the one installed.
- The toolchain is about 1 GB and downloads take minutes. Run `swiftly install` in the background or with a generous timeout, and keep `TMPDIR` on a disk with space.
- `swift build` fetches dependencies from GitHub on first run, so it needs network access. Pin versions with `from:`, `.upToNextMinor(from:)` or `exact:`, and commit `Package.resolved` for applications.
- Darwin-only frameworks (SwiftUI, UIKit, AppKit) do not exist on Linux. Server and CLI code must stick to the standard library, Foundation and portable packages; guard platform code with `#if canImport(Darwin)` or `#if os(Linux)`.
- Never edit `.build/` by hand, and never commit it; it is already in the generated `.gitignore`. After a toolchain change that leaves odd build errors, `swift package clean` or deleting `.build/` is safe because it is only cache.
- A package build runs manifest and plugin code from dependencies. Review new third-party packages before adding them, and prefer well-known organizations.
- Run only commands you have verified for the installed version: flags move between releases, so `swift build --help` and `swiftly help <command>` are the source of truth.
- Not for iOS/macOS app UI work (use the SwiftUI skills) or for projects that need an Xcode project file, signing or App Store tooling.
