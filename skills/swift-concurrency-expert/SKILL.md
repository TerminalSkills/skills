---
name: swift-concurrency-expert
description: >-
  Diagnoses and fixes Swift concurrency problems: data-race-safety errors in the Swift 6 language mode, actor isolation, Sendable, moving work off the main actor, and wrapping callback APIs in async functions. Reads the target's build settings first, because default isolation and the Swift 6.2 "approachable concurrency" features change what the same source means. Use when the user says "fix these Swift 6 concurrency errors", "sending risks causing data races", "not concurrency-safe", "migrate to Swift 6", "make this Sendable", "should this be an actor", "@MainActor everywhere", or asks for a review of async/await code.
license: Apache-2.0
compatibility: "Swift 6.0 or later toolchain (Xcode 16+ or swift.org); Swift 6.2 for default isolation, @concurrent and isolated conformances; Swift 6.4 for async defer and cancellation shields. Needs the project's build output to confirm fixes."
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: development
  tags: ["swift", "concurrency", "swift6", "actors", "sendable"]
---

# Swift Concurrency Expert

## Overview

Swift's data-race safety is a set of compile-time rules about isolation: every piece of mutable state belongs to one actor, one task, or nobody (immutable), and values may cross between those domains only when that cannot produce concurrent access. Almost every concurrency diagnostic says the same thing in different words: "this value can be reached from two domains at once". The job is to make the isolation true with the smallest change, and to avoid changes that only silence the compiler. This skill covers reading the configuration, mapping a diagnostic to its cause, choosing a fix, and confirming it with a build.

## Instructions

### 1. Read the configuration before reading the code

The same file compiles differently depending on five settings. Find them first and quote them in your answer.

| What | Xcode build setting | Package.swift (`swiftSettings`) | Compiler flag |
|---|---|---|---|
| Language mode | `SWIFT_VERSION = 6` | `.swiftLanguageMode(.v6)`, or tools version 6.0+ | `-swift-version 6` |
| Checking level in Swift 5 mode | `SWIFT_STRICT_CONCURRENCY = complete` | `.enableUpcomingFeature("StrictConcurrency")` | `-strict-concurrency=complete` |
| Default isolation (6.2) | `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor` | `.defaultIsolation(MainActor.self)` | `-default-isolation MainActor` |
| Async functions stay on the caller's actor (6.2) | `SWIFT_UPCOMING_FEATURE_NONISOLATED_NONSENDING_BY_DEFAULT` | `.enableUpcomingFeature("NonisolatedNonsendingByDefault")` | `-enable-upcoming-feature NonisolatedNonsendingByDefault` |
| Bundle of the 6.2 usability features | `SWIFT_APPROACHABLE_CONCURRENCY` | each feature by name | each feature by name |

`SWIFT_APPROACHABLE_CONCURRENCY` turns on `DisableOutwardActorInference`, `GlobalActorIsolatedTypesUsability`, `InferIsolatedConformances`, `InferSendableFromCaptures` and `NonisolatedNonsendingByDefault`.

```bash
swift --version
grep -rnE "SWIFT_VERSION|SWIFT_STRICT_CONCURRENCY|SWIFT_DEFAULT_ACTOR_ISOLATION|SWIFT_APPROACHABLE_CONCURRENCY|SWIFT_UPCOMING_FEATURE" \
  --include=project.pbxproj --include="*.xcconfig" .
grep -nE "swift-tools-version|swiftLanguageMode|defaultIsolation|enableUpcomingFeature|unsafeFlags" Package.swift
```

Settings are per target. An app target can be main-actor-by-default while the package it depends on is not.

### 2. Know what the two big switches do

- **Default isolation `MainActor`:** every declaration without an isolation annotation is treated as `@MainActor`. Exceptions: declarations inside an `actor`, declarations that already get isolation from a superclass or protocol, types nested in a `nonisolated` type, and anything marked `nonisolated`. Without the setting, unannotated code is `nonisolated`.
- **`NonisolatedNonsendingByDefault`:** a `nonisolated async` function runs on the actor of whoever called it. Without the feature it always leaves the caller's actor and runs on the global concurrent executor. With the feature on, write `@concurrent` on the function to leave the actor; with it off, write `nonisolated(nonsending)` to stay.

Turning either on changes where existing code runs. For the second, the compiler can add `@concurrent` everywhere to keep today's behaviour: build with `-enable-upcoming-feature NonisolatedNonsendingByDefault:migrate`, or run `swift package migrate --to-feature NonisolatedNonsendingByDefault` on a clean working tree.

### 3. Map the diagnostic to its cause

| Compiler says | What is true | Fixes, best first |
|---|---|---|
| `call to main actor-isolated instance method 'x()' in a synchronous nonisolated context` | A function with no isolation calls into actor state without waiting its turn | Isolate the caller to the same actor; or make the caller `async` and `await`; or `Task { @MainActor in … }` when nobody needs the result |
| `static property 'x' is not concurrency-safe because it is nonisolated global shared mutable state` | A global or static `var` reachable from any thread | `let` if it never changes; isolate it (`@MainActor`); move it into an actor or a `Mutex` |
| `conformance of 'T' to protocol 'P' crosses into main actor-isolated code and can cause data races` | An actor-isolated method is used to satisfy a requirement that anyone may call | Isolated conformance `T: @MainActor P` (6.2); mark the witnesses `nonisolated`; `@preconcurrency P` as a runtime-checked stopgap |
| `main actor-isolated conformance of 'T' to 'P' cannot be used in nonisolated context` | An isolated conformance is being used off its actor | Isolate the using code to that actor, or make the type and conformance `nonisolated` |
| `sending 'x' risks causing data races` | A non-Sendable value stays reachable here while an async callee uses it elsewhere | Keep the callee on the caller's actor (`nonisolated(nonsending)`); make the type Sendable; stop using the value afterwards |
| `passing closure as a 'sending' parameter risks causing data races…` | A `Task` closure captures something the current context still uses | Isolate the enclosing type to an actor; or take the value as a `sending` parameter |
| `capture of 'x' with non-Sendable type 'T' in a '@Sendable' closure` | A closure that may run concurrently holds a reference to unprotected state | Capture a Sendable copy in the capture list; isolate `T`; make `T` Sendable |
| `non-Sendable type 'T' of property 'p' cannot exit actor-isolated context` | An actor is handing out a reference to its internals | Do the work inside the actor; return a Sendable snapshot |

One real cause often produces many diagnostics. Fix the cause closest to the state, rebuild, and re-read what remains before touching anything else.

### 4. Choose the fix in this order

1. **Don't cross.** If the value is created and used in one place, keep the whole flow on one actor. Much code that looks concurrent is sequential.
2. **Make it immutable or a value.** A struct or enum whose stored properties are Sendable is Sendable. A `final class` with only `let` properties of Sendable type can declare `Sendable` and the compiler checks it.
3. **Isolate to an actor that already exists.** UI-facing state belongs on `@MainActor`. A global-actor-isolated class is Sendable because the actor protects it, unless it inherits from a non-Sendable class.
4. **Introduce an `actor`** when the state has its own life (a cache, a connection pool) and callers can `await`.
5. **Use `Mutex`** from the Synchronization module when access must stay synchronous and the critical section is short (iOS 18, macOS 15 and later).
6. **Transfer ownership with `sending`** when the caller will not touch the value again.
7. **Escape hatches, last:** `@preconcurrency import`, a `@preconcurrency` conformance, `MainActor.assumeIsolated`, `nonisolated(unsafe)`, `@unchecked Sendable`. Each one replaces a compile-time proof with a promise. Write the invariant in a comment next to it and list every one in your report.

### 5. Recurring jobs

**Run heavy work off the main actor (6.2):**

```swift
@concurrent
nonisolated func makeThumbnail(from data: Data, maxPixel: Int) async throws -> Data {
    try Task.checkCancellation()
    return try ThumbnailRenderer.render(data, maxPixel: maxPixel)
}
```

Parameters and the result cross a boundary, so they must be Sendable. On toolchains before 6.2, or with the feature off, a `nonisolated async` function already leaves the caller's actor and `@concurrent` is not needed.

**Wrap a completion-handler API:**

```swift
func fetchProfile(id: String) async throws -> Profile {
    try await withCheckedThrowingContinuation { continuation in
        legacyClient.fetchProfile(id: id) { result in
            continuation.resume(with: result)   // exactly once on every path
        }
    }
}
```

A continuation that is never resumed suspends its task forever; resuming a checked continuation twice traps. For callbacks that fire many times use `AsyncStream.makeStream(of:)` and finish the stream when the source stops.

**Structure and cancellation.** Prefer `async let` and task groups (`withThrowingTaskGroup`, `withDiscardingTaskGroup`) to loose `Task { }` values: children are cancelled and awaited with the parent. If you do create a `Task`, keep the handle and cancel it when its owner goes away. Long loops call `try Task.checkCancellation()`. From Swift 6.4, `defer` may contain `await`, and `withTaskCancellationShield { }` lets cleanup finish after cancellation (the shield needs the OS 27 runtime on Apple platforms). `Task.immediate`, which starts synchronously on the caller's executor until its first suspension, needs the OS 26 runtime.

**Actors are reentrant.** Every `await` inside an actor method lets other calls in. Re-read state after a suspension and never assume it is what you left (see Example 2).

### 6. Verify and report

Rebuild the same target with the same settings (`swift build`, or the project's `xcodebuild` command) and run its tests. A fix is done when the diagnostics are gone without new ones and without an escape hatch you cannot justify. For races the compiler cannot see (unchecked types, C or Objective-C code), run tests with Thread Sanitizer enabled in the scheme's Diagnostics; it works on macOS and in Simulator, not on devices.

Report in this shape:

```text
Target ReceiptsKit: Swift 6 mode, default isolation MainActor, NonisolatedNonsendingByDefault on
1. ReceiptStore.swift:31  "main actor-isolated conformance of 'Receipt' to 'Decodable'
   cannot be used in nonisolated context"
   Cause: Receipt is implicitly @MainActor; decoding runs in a @concurrent function.
   Fix: nonisolated struct Receipt: Decodable, Sendable.   Kind: compile-time checked
Escape hatches added: none.   Build: clean.   Tests: 42 passed.
```

## Examples

### Example 1: decoding blocks the main thread in a main-actor-by-default module

A package target is built in Swift 6 mode with `.defaultIsolation(MainActor.self)` plus the `InferIsolatedConformances` and `NonisolatedNonsendingByDefault` features. Loading a 30 MB receipts file freezes scrolling, because every line below runs on the main actor:

```swift
struct Receipt: Decodable { let id: String; let totalCents: Int }

final class ReceiptStore {
    private(set) var receipts: [Receipt] = []

    func reload(from url: URL) async throws {
        let (data, _) = try await URLSession.shared.data(from: url)
        receipts = try JSONDecoder().decode([Receipt].self, from: data)
    }
}
```

Moving the decode into a `@concurrent` function alone fails: `Receipt` is implicitly `@MainActor`, so its `Decodable` conformance is too, and the compiler reports that the main actor-isolated conformance cannot be used in a nonisolated context. The model type has no reason to be tied to the UI, so take it off the actor:

```swift
nonisolated struct Receipt: Decodable, Sendable { let id: String; let totalCents: Int }

final class ReceiptStore {                      // still implicitly @MainActor
    private(set) var receipts: [Receipt] = []

    func reload(from url: URL) async throws {
        let (data, _) = try await URLSession.shared.data(from: url)
        receipts = try await Self.decode(data)  // suspends; main actor is free meanwhile
    }

    @concurrent
    private static func decode(_ data: Data) async throws -> [Receipt] {
        try JSONDecoder().decode([Receipt].self, from: data)
    }
}
```

`Data` and `[Receipt]` are Sendable, so they cross in and out without further annotations. No escape hatch was needed.

### Example 2: a shared cache that raced, rewritten as a reentrancy-safe actor

`static var shared = AvatarCache()` on a class with a dictionary produced "not concurrency-safe because it is nonisolated global shared mutable state". Callers are already `async`, so an actor fits. The naive actor would still fetch the same avatar twice when two callers arrive before the first download ends; storing the in-flight task closes that gap:

```swift
actor AvatarCache {
    static let shared = AvatarCache()

    private var stored: [URL: Data] = [:]
    private var loading: [URL: Task<Data, Error>] = [:]

    func avatar(at url: URL) async throws -> Data {
        if let data = stored[url] { return data }
        if let running = loading[url] { return try await running.value }

        let task = Task { try await URLSession.shared.data(from: url).0 }
        loading[url] = task
        defer { loading[url] = nil }

        let data = try await task.value   // other callers may run here
        stored[url] = data
        return data
    }
}
```

`static let shared` is safe because an actor is Sendable. Both dictionaries are only touched between suspension points, on the actor.

### Example 3: a main-actor model that must be Equatable

```swift
@MainActor
final class CartModel: @MainActor Equatable {
    var lines: [CartLine] = []
    static func == (lhs: CartModel, rhs: CartModel) -> Bool { lhs.lines == rhs.lines }
}
```

Without `@MainActor` on the conformance (or `InferIsolatedConformances`), `==` is main-actor-isolated but `Equatable` expects a function anyone can call, and the Swift 6 language mode rejects it. The isolated conformance works everywhere on the main actor and is rejected at compile time anywhere else. Before Swift 6.2 the choices were a `nonisolated` `==` that cannot read `lines`, or `@preconcurrency Equatable`, which traps at run time when called off the main actor.

## Guidelines

- **Do not add `@MainActor` just to make an error disappear.** It is correct for UI state and wrong for parsing, hashing, image work or file I/O: the code compiles and the app hangs.
- **`@unchecked Sendable` and `nonisolated(unsafe)` turn off checking, they do not add safety.** Use them only around a real lock or queue, with the invariant written down. A class that inherits from a non-Sendable class cannot be made Sendable any other way; consider wrapping it in a `Mutex` instead.
- **`MainActor.assumeIsolated` and `@preconcurrency` conformances trap** when the assumption is false. They are migration tools, not designs.
- **`await MainActor.run { }` scattered through a type** means the type should be `@MainActor` itself.
- **Do not wait on other tasks with blocking primitives.** A semaphore or condition variable that one task waits on and another signals hides the dependency from the runtime, whose thread pool assumes every thread keeps making progress; the result can be a permanent stall. Use `await`, `Task.sleep(for:)` and continuations.
- **Bound fan-out.** Adding thousands of tasks to a group at once wastes memory; keep a fixed number running and add one as each finishes.
- **Migrate module by module.** Start with complete checking as warnings in Swift 5 mode, clear them, then switch the target to language mode 6. Usually the app target first, then the packages it uses.
- **Limits:** the advice here is checked against the language documentation, not against the user's compiler. Diagnostic wording varies between toolchains; match on meaning, and always confirm with a real build.
- **When not to use it:** dropped frames or slow views with no concurrency diagnostics are a profiling job, and code that only uses Dispatch queues with no plan to adopt async/await is out of scope.
