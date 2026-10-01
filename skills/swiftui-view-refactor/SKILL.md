---
name: swiftui-view-refactor
description: >-
  Restructures an existing SwiftUI view without changing what the user sees: splits an oversized body into small view types with narrow inputs, moves actions and business logic out of the view, replaces type erasure and duplicated branches, fixes state ownership, and migrates ObservableObject models to the Observable macro. Works in small steps that each build, and reports what moved and what could behave differently. Use when the user says "clean up this SwiftUI view", "this body is 300 lines", "split this view into subviews", "get the logic out of the view", "migrate to @Observable", "remove the AnyViews", or asks for a refactor of a SwiftUI file with no feature change.
license: Apache-2.0
compatibility: "SwiftUI projects in Xcode 15 or later. The Observation migration needs iOS 17 / macOS 14 as deployment target; everything else applies from iOS 15. Needs a working build to verify each step."
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: development
  tags: ["swiftui", "refactoring", "ios", "observation", "code-quality"]
---

# SwiftUI View Refactor

## Overview

A SwiftUI view grows by accretion: one more section in `body`, one more flag, one more closure with a network call in it. The result still works, but nobody can change it safely, previews stop being useful, and every state change recomputes the whole screen. Refactoring it means changing the structure while the pixels and the behaviour stay the same. In SwiftUI that takes care, because structure is behaviour: a view's position in the tree is its identity, and moving a view, a `@State` property or a `.task` can reset state or change when work runs. This skill gives a fixed order of small moves, the checks that keep behaviour intact, and the form of the final report.

## Instructions

### 1. Agree the boundary and set a safety net

- State the rule to the user: structure changes only. Bugs and design problems you notice are listed in the report, not fixed, unless they ask.
- Build the target first. A refactor that starts from a red build cannot be verified.
- Find the deployment target (it decides whether `@Observable` is available) and whether the project already has conventions for file layout, naming and state. Match them.
- Make sure the view has a `#Preview` for each state it can show (loaded, empty, error, busy). If there are none, add them before changing anything: they are the only quick way to see that nothing moved. Keep accessibility identifiers as they are, because UI tests depend on them.

### 2. Map the view before touching it

Write a short inventory. It decides where the cuts go.

```text
CheckoutView.swift: 212 lines, body 148 lines
Stored:   @ObservedObject cart: CartStore; @State promo, isPlacing, showError, errorText
Sections: lines list (reads cart.lines) | promo row (reads/writes promo, writes cart.discount)
          | total (reads cart.lines, cart.discount) | place-order button (reads isPlacing)
Effects:  Task in button action (network, mutates cart); alert bound to showError
Smells:   price maths in body; promo rule in a closure; AnyView in the button label
```

### 3. Apply the moves in this order

Each step is one kind of change. Build and look at the previews after each one.

**Step A: name the actions.** Replace multi-line closures in `body` (button actions, `.task`, `.onChange`, `.refreshable`) with calls to private methods on the same view. Nothing else moves, so this step cannot change behaviour, and `body` becomes readable.

**Step B: move logic that is not about display out of the view.** Calculations, validation rules, formatting decisions and network calls go to the model or a service type, where they can be unit-tested without SwiftUI. The view keeps only the thin method that calls them and updates view state.

**Step C: extract sections into view types.** For each section in the inventory create a `struct` conforming to `View`:

- Give it the least it needs: values (`let`), bindings (`@Binding`) for what it edits, closures for what it triggers. Not the parent's whole model, unless it really uses most of it.
- Extract leaves first, then the containers around them.
- Keep it `private` in the same file until something else needs it; move it to its own file when it is reused or the file is still too long.
- A computed property or `@ViewBuilder` function is enough for a fragment of a few lines with no state of its own. Prefer a type when the section has its own state or async work, deserves a preview, or reads data the rest of the screen does not: a separate view type is updated independently, so narrowing its inputs also narrows what SwiftUI recomputes.

**Step D: repair the structure.**

| Found | Change to | Why |
|---|---|---|
| `AnyView` used to return different views | `@ViewBuilder`, `if`/`switch`, or a generic parameter | Type erasure hides the structure SwiftUI uses for identity and diffing |
| The same view in both branches of an `if`, differing in modifiers | One view with conditional modifier values (`.opacity(isLocked ? 0.6 : 1)`, `.disabled(isLocked)`) | Each branch is a different identity; switching destroys the view's state and animates as a removal and insertion |
| Several Booleans driving mutually exclusive sheets or alerts | One optional enum with `sheet(item:)` | Removes impossible combinations |
| A child copying a parent's value into its own `@State` | `@Binding` or a plain `let` | Two sources of truth drift apart |
| Model built in `init` with `State(initialValue:)` or set in `onAppear` behind an optional | `@State private var model = Model()` when it needs no inputs; otherwise receive the model from the parent, or create it in `.task` | State storage is created once per view identity; later `init` arguments are ignored, which surprises readers |
| Values derived in `body` several times | A computed property on the model, or one `let` at the top of `body` | One definition, testable |

**Step E: migrate observation (only if asked or agreed, iOS 17+).**

| Before | After |
|---|---|
| `class Store: ObservableObject` | `@Observable class Store` |
| `@Published var items` | `var items` (use `@ObservationIgnored` to exclude a property) |
| `@StateObject private var store = Store()` | `@State private var store = Store()` |
| `@ObservedObject var store: Store` | `let store: Store`, or `@Bindable var store: Store` when the view needs `$store.property` |
| `@EnvironmentObject var store: Store` | `@Environment(Store.self) private var store` |
| `.environmentObject(store)` | `.environment(store)` |

Migrate one model type at a time; the old and new systems can coexist in one app. Behaviour differs in one important way: with `ObservableObject` a view updates when any published property changes, with `@Observable` only when a property its `body` reads changes. That is usually the goal, but check views that depended on the broader updates.

### 4. Check that behaviour survived

After the last step, and after any step that moved state or effects, go through this list:

1. **State kept its home.** A `@State` or `@FocusState` property moved into an extracted view now belongs to that view's identity. If the view sits inside an `if`, the state resets whenever the branch flips.
2. **Effects fire at the same time.** A `.task` or `.onAppear` moved from the screen to a section runs when that section appears, and a `.task` is cancelled when it disappears. Inside lazy containers that is on scroll, not on screen load.
3. **Modifiers still cover the same views.** `.environment`, `.disabled`, `.animation`, `.navigationDestination`, `.toolbar` and `.alert` apply to the subtree they are attached to; an extracted view may now be outside it.
4. **Order of children is unchanged** inside stacks, lists and `ForEach`, and `ForEach` ids are the same.
5. **Previews match** before and after, in every state. Tests pass.

### 5. Report

```text
Refactor of CheckoutView.swift (212 → 96 lines; body 148 → 14)
Moved
  OrderLinesSection, PromoCodeField, TotalRow, PlaceOrderButton   new private views, same file
  applyPromo(), placeOrder()                                      private methods on CheckoutView
  subtotal, total, applyPromo(_:), placeOrder()                   CartStore (unit-testable)
Structure fixes
  AnyView in button label → if/else in a ViewBuilder
Left alone, with reasons
  showError + errorText pair (works; an optional error enum would be cleaner)
Noticed, not changed
  Place-order button stays enabled while a request is running: a double tap sends two orders
Verification: build clean; previews "Filled", "Empty", "Placing" identical before/after; 31 tests pass
```

## Examples

### Example 1: a checkout screen with everything in `body`

Before (shortened), the button and total as found:

```swift
let subtotal = cart.lines.reduce(Decimal(0)) { $0 + $1.unitPrice * Decimal($1.quantity) }
Text("Total \((subtotal * (1 - cart.discount)).formatted(.currency(code: "EUR")))")
Button {
    isPlacing = true
    Task {
        do { try await cart.api.placeOrder(cart.lines); cart.lines = [] }
        catch { errorText = error.localizedDescription; showError = true }
        isPlacing = false
    }
} label: { isPlacing ? AnyView(ProgressView()) : AnyView(Text("Place order")) }
```

After steps A to D:

```swift
struct CheckoutView: View {
    @ObservedObject var cart: CartStore
    @State private var promo = ""
    @State private var isPlacing = false
    @State private var showError = false
    @State private var errorText = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                OrderLinesSection(lines: cart.lines)
                PromoCodeField(code: $promo, onApply: applyPromo)
                TotalRow(total: cart.total)
                PlaceOrderButton(isPlacing: isPlacing, action: placeOrder)
            }
        }
        .alert(errorText, isPresented: $showError) { Button("OK") {} }
    }

    private func applyPromo() {
        do { try cart.applyPromo(promo) } catch { show(error) }
    }

    private func placeOrder() {
        isPlacing = true
        Task {
            do { try await cart.placeOrder() } catch { show(error) }
            isPlacing = false
        }
    }

    private func show(_ error: Error) {
        errorText = error.localizedDescription
        showError = true
    }
}

private struct PlaceOrderButton: View {
    let isPlacing: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            if isPlacing { ProgressView() } else { Text("Place order") }
        }
    }
}

extension CartStore {
    var subtotal: Decimal { lines.reduce(0) { $0 + $1.unitPrice * Decimal($1.quantity) } }
    var total: Decimal { subtotal * (1 - discount) }
}
```

The price rule now has one definition and a unit test can cover it. `TotalRow` takes a `Decimal`, so it is recomputed only when the total changes. The enabled-while-busy button was kept as it was and reported.

### Example 2: moving a settings model to Observation

```swift
// Before
final class ReaderSettings: ObservableObject {
    @Published var fontSize = 17.0
    @Published var usesSerif = false
    @Published var lastSyncedAt: Date?
}

struct FontControls: View {
    @ObservedObject var settings: ReaderSettings
    var body: some View {
        Slider(value: $settings.fontSize, in: 12...28)
        Toggle("Serif font", isOn: $settings.usesSerif)
    }
}

// After
@Observable final class ReaderSettings {
    var fontSize = 17.0
    var usesSerif = false
    var lastSyncedAt: Date?
}

struct FontControls: View {
    @Bindable var settings: ReaderSettings
    var body: some View {
        Slider(value: $settings.fontSize, in: 12...28)
        Toggle("Serif font", isOn: $settings.usesSerif)
    }
}
```

The owner changes from `@StateObject private var settings = ReaderSettings()` to `@State private var settings = ReaderSettings()`. Reported difference: `FontControls` no longer updates when `lastSyncedAt` changes, because its `body` does not read it.

### Example 3: one identity instead of two

```swift
// Before: flipping isLocked swaps one editor for another; cursor and scroll position are lost
if note.isLocked {
    NoteEditor(note: note).disabled(true).opacity(0.6)
} else {
    NoteEditor(note: note)
}

// After: the same editor in both modes
NoteEditor(note: note)
    .disabled(note.isLocked)
    .opacity(note.isLocked ? 0.6 : 1)
```

This one does change behaviour, for the better: the editor's state survives locking. Say so in the report and get agreement before including it in a structure-only refactor.

## Guidelines

- **Small steps, each verified.** Extracting four views, changing state ownership and migrating observation in a single edit leaves no way to find which change broke something.
- **Do not add a view model because a view is long.** Length is solved by extraction. Introduce a model type when there is logic to test or share, and keep per-view display state (`isExpanded`, focus, scroll position) in the view.
- **Do not turn a screen into twenty computed properties.** That shortens `body` on paper while every fragment still shares the screen's state and is recomputed with it.
- **Narrow inputs are the point.** An extracted view that takes the whole store has moved code without reducing coupling.
- **`@State` initial values:** built with Xcode 26 or earlier, the initial-value expression of `@State` runs every time the view is initialised and only the first result is kept, so do not put expensive or side-effecting construction there. Built with Xcode 27 or later, a class-typed initial value is created once.
- **Leave unrelated code alone:** no renaming, reformatting or reordering of members beyond what the project's convention asks for. It inflates the diff and hides the real change.
- **Limits:** this skill reasons about structure. It cannot see the screen; a human has to compare previews or run the app. Timing-sensitive behaviour (animations, focus, `task` restarts) is the likeliest thing to change unnoticed.
- **When not to use it:** when the user wants new behaviour or a redesign, when the problem is frame rate (profile first), or when the view is generated code.
