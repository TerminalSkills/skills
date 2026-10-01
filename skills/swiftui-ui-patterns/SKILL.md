---
name: swiftui-ui-patterns
description: >-
  Builds SwiftUI screens and app structure from a small set of proven patterns: who owns each piece of state, a tab-and-navigation-stack app shell, enum-driven routes and sheets, async loading with explicit phases, searchable lists, form sheets and previews for every state. States the minimum OS for each API and gives the fallback for older targets. Use when the user says "build this screen in SwiftUI", "set up navigation for my app", "TabView with NavigationStack", "how should I pass this model down", "show a sheet from a list row", "handle loading and error states", "add deep links", or starts a new SwiftUI app.
license: Apache-2.0
compatibility: "SwiftUI with Xcode 16 or later. Patterns are written for iOS 17+ / macOS 14+ (Observation); the Tab API needs iOS 18 / macOS 15. Fallbacks for iOS 16 are noted."
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: development
  tags: ["swiftui", "ios", "navigation", "state-management", "ui-patterns"]
---

# SwiftUI UI Patterns

## Overview

Most SwiftUI screens are assembled from the same few decisions: where each piece of state lives, how the user moves between screens, how modal presentations are triggered, and what the view shows while data is loading, missing or broken. Getting these right once makes the rest of the view code short. This skill gives one pattern for each decision, with the API availability checked against Apple's documentation, and two complete examples to copy the shape from. It deliberately leaves out component catalogues: for a single control, read its documentation page.

## Instructions

### 1. Look before writing

- **Deployment target** decides which column of the tables below applies. Find it in the project settings or `Package.swift` (`platforms:`).
- **House style.** Search for the nearest existing screen and match it: `grep -rnE "NavigationStack|NavigationSplitView|TabView|\.sheet\(" --include="*.swift" .` Do not introduce a second navigation or state style into a project that already has one.
- **Xcode version.** With Xcode 27 or later `@State` is a macro that creates a class-typed initial value once. With Xcode 26 or earlier it is a property wrapper, and the initial-value expression runs every time the view is initialised (only the first result is kept). On older Xcode, keep model initialisers cheap or create the model in `.task`.

### 2. Decide who owns each piece of state

Pick the owner first, then the declaration follows.

| The data is | Owner writes | A child that receives it writes | Before iOS 17 |
|---|---|---|---|
| A value used by one view (toggle, text, selection) | `@State private var` | `@Binding var` if it edits, `let` if it reads | same |
| A reference model created by this view | `@State private var model = CartModel()` on an `@Observable` class | `let model: CartModel` to read; `@Bindable var model` when it needs `$model.field` | `@StateObject` / `@ObservedObject` on an `ObservableObject` |
| A service shared by many screens | `.environment(client)` near the root | `@Environment(LibraryClient.self) private var client` | `.environmentObject` / `@EnvironmentObject` |
| A system value (dismiss, locale, color scheme) | provided by SwiftUI | `@Environment(\.dismiss) private var dismiss` | same |

Rules: state is `private` and lives in the highest view that needs it, no higher. Pass leaf views the values they display, not the whole model. Reading a type from the environment that nobody injected throws at run time; declare it optional (`private var client: LibraryClient?`) when it may be absent. Plain values in `@State` are enough for most screens; add a model class when logic must be shared or tested.

### 3. App shell: tabs, each with its own stack

One `TabView`; each tab owns a `NavigationStack` and its own path, so switching tabs keeps each history.

- iOS 18+: `Tab("Library", systemImage: "books.vertical", value: AppTab.library) { … }` inside `TabView(selection:)`. A search tab is `Tab(value: AppTab.search, role: .search) { … }`. Add `.tabViewStyle(.sidebarAdaptable)` to get a sidebar on iPad.
- iOS 16–17: the same structure with `.tabItem { Label(…) }.tag(…)` on each child. `tabItem` is deprecated in the 27.2 SDKs, so isolate it behind an availability check.
- iPad or Mac apps organised around a sidebar and detail use `NavigationSplitView` in place of tabs.
- `NavigationView` is deprecated; do not write new code with it.

### 4. Navigation: values, not views

Describe destinations as data. Declare a `Hashable` route enum per stack, bind the stack to an array of routes, and map routes to views in one place.

```swift
enum LibraryRoute: Hashable {
    case shelf(Shelf.ID)
    case book(Book.ID)
}
```

- Push from a row with `NavigationLink(book.title, value: LibraryRoute.book(book.id))`, or from code with `path.append(.book(id))`.
- Pop to root with `path.removeAll()`; a deep link is `path = [.shelf(2), .book(4821)]`.
- Put `navigationDestination(for:)` on the stack's root content. Apple's documentation warns against placing it inside lazy containers such as `List` or `LazyVStack`, where the stack may not see it.
- Use `NavigationPath` only when one stack must hold unrelated route types; a typed array is easier to inspect and restore.
- Store identifiers in routes, not whole models, so a path can be rebuilt from a URL.

### 5. Presentations: one optional enum per presenter

Several Boolean flags for mutually exclusive sheets allow impossible states. Use one optional `Identifiable` enum and `sheet(item:)`:

```swift
enum LibrarySheet: Identifiable {
    case addBook
    case editShelf(Shelf.ID)
    var id: String {
        switch self {
        case .addBook: "addBook"
        case .editShelf(let id): "editShelf-\(id)"
        }
    }
}
```

- The presenter sets `sheet = .editShelf(shelf.id)`; setting `nil` dismisses. If the item changes while shown, SwiftUI replaces the sheet.
- Inside the sheet, close with `@Environment(\.dismiss)`. Wrap sheet content in its own `NavigationStack` when it needs a title and toolbar buttons, with `ToolbarItem(placement: .cancellationAction)` and `.confirmationAction`.
- Size with `.presentationDetents([.medium, .large])` (iOS 16+). Block swipe-to-dismiss while there are unsaved edits with `.interactiveDismissDisabled(hasChanges)`.
- Alerts follow the same idea with `alert(_:isPresented:presenting:actions:message:)`; built with the Xcode 27 SDK, `alert(_:item:actions:message:)` takes the optional item directly. Destructive choices go in `confirmationDialog`.

### 6. Loading: make every phase a case

A screen that loads data has at least three faces. Model them, so none can be forgotten:

```swift
enum LoadPhase<Value> {
    case loading
    case loaded(Value)
    case failed(String)
}
```

- Start work in `.task { }`: it runs when the view appears and is cancelled when it disappears. `.task(id: value)` cancels and restarts when `value` changes; use it for anything keyed by an identifier or a search term.
- Never start requests in `init` or `body`.
- Cancellation is not an error to show. Catch `CancellationError` separately and leave the phase alone.
- `.refreshable { await load() }` gives pull-to-refresh on lists.
- Empty and failed states use `ContentUnavailableView` (iOS 17+), with `ContentUnavailableView.search(text:)` for "no results".

### 7. Lists, search and forms

- `List(items) { … }` or `ForEach(items)` over `Identifiable` data with ids that come from the data. Keep one row view type per collection.
- `.searchable(text: $query)` works on a navigation container or on a view inside one; where you put it decides which column or screen shows the field, so attach it to the screen whose content it filters.
- Row actions: `.swipeActions(edge: .trailing) { Button(role: .destructive) { … } }`.
- Forms: `Form` with `Section`s, `LabeledContent("Pages", value: …)` for read-only rows, `@FocusState` with `.focused($focus, equals: .title)` to move between fields, `.submitLabel(.next)` and `.onSubmit` to advance.
- Every icon-only button gets an `accessibilityLabel`.

### 8. Previews are part of the screen

One `#Preview` per phase, named, each injecting what the view reads from the environment:

```swift
#Preview("Loaded") {
    NavigationStack { ShelfScreen(shelfID: 3) }
        .environment(LibraryClient.stub(books: Book.samples))
}

#Preview("Request fails") {
    NavigationStack { ShelfScreen(shelfID: 3) }
        .environment(LibraryClient.stub(failing: true))
}
```

When many previews share setup (a seeded model container, for example), move it into a `PreviewModifier` (iOS 18 SDK) and attach it with `#Preview(traits: .modifier(SampleLibrary()))`.

### 9. Finish

Build, open each preview, and check: large Dynamic Type sizes, dark appearance, VoiceOver labels on icon buttons, back navigation and sheet dismissal from every state. Report which minimum OS the code needs and which fallbacks were added.

## Examples

### Example 1: app shell with per-tab navigation, sheets and a deep link

Request: "New reading-tracker app, iOS 18. Tabs for Library and Settings plus search, and `inkwell://book/4821` should open that book."

```swift
import SwiftUI

enum AppTab: Hashable { case library, settings, search }

@Observable final class AppNavigation {
    var tab: AppTab = .library
    var libraryPath: [LibraryRoute] = []

    func open(_ url: URL) {
        guard url.scheme == "inkwell", url.host() == "book",
              let id = Int(url.lastPathComponent) else { return }
        tab = .library
        libraryPath = [.book(id)]
    }
}

struct RootView: View {
    @State private var navigation = AppNavigation()

    var body: some View {
        @Bindable var navigation = navigation
        TabView(selection: $navigation.tab) {
            Tab("Library", systemImage: "books.vertical", value: AppTab.library) {
                LibraryTab(navigation: navigation)
            }
            Tab("Settings", systemImage: "gearshape", value: AppTab.settings) {
                NavigationStack { SettingsScreen() }
            }
            Tab(value: AppTab.search, role: .search) {
                NavigationStack { SearchScreen() }
            }
        }
        .onOpenURL { navigation.open($0) }
    }
}

struct LibraryTab: View {
    @Bindable var navigation: AppNavigation
    @State private var sheet: LibrarySheet?

    var body: some View {
        NavigationStack(path: $navigation.libraryPath) {
            ShelfList(onAdd: { sheet = .addBook }, onEdit: { sheet = .editShelf($0) })
                .navigationTitle("Library")
                .navigationDestination(for: LibraryRoute.self) { route in
                    switch route {
                    case .shelf(let id): ShelfScreen(shelfID: id)
                    case .book(let id): BookScreen(bookID: id)
                    }
                }
        }
        .sheet(item: $sheet) { sheet in
            switch sheet {
            case .addBook: AddBookSheet()
            case .editShelf(let id): EditShelfSheet(shelfID: id)
            }
        }
    }
}
```

Result: each tab keeps its own history; the URL selects the Library tab and replaces its path with the book; two sheets can never be up at once. `ShelfList` receives closures and knows nothing about sheets or paths.

### Example 2: a screen with loading, failure, empty search and refresh

```swift
struct ShelfScreen: View {
    let shelfID: Shelf.ID
    @Environment(LibraryClient.self) private var client
    @State private var phase: LoadPhase<[Book]> = .loading
    @State private var query = ""

    var body: some View {
        content
            .navigationTitle("Shelf")
            .searchable(text: $query)
            .task(id: shelfID) { await load() }
            .refreshable { await load() }
    }

    @ViewBuilder private var content: some View {
        switch phase {
        case .loading:
            ProgressView()
        case .failed(let message):
            ContentUnavailableView {
                Label("Couldn't load this shelf", systemImage: "wifi.exclamationmark")
            } description: {
                Text(message)
            } actions: {
                Button("Try Again") { Task { await load() } }
            }
        case .loaded(let books):
            let shown = query.isEmpty ? books
                : books.filter { $0.title.localizedCaseInsensitiveContains(query) }
            List(shown) { book in
                NavigationLink(book.title, value: LibraryRoute.book(book.id))
            }
            .overlay {
                if shown.isEmpty { ContentUnavailableView.search(text: query) }
            }
        }
    }

    private func load() async {
        do {
            phase = .loaded(try await client.books(inShelf: shelfID))
        } catch is CancellationError {
            return                                  // view left or shelf changed
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }
}
```

Result: the view shows a spinner first, then one of three outcomes; pulling down reloads; changing `shelfID` cancels the old request. Filtering in `body` is acceptable here because a shelf holds tens of books; for thousands, move it into a model.

## Guidelines

- **One source of truth.** Copying a parent's value into a child's `@State` creates a second copy that stops following the parent. Pass a binding or the value.
- **Flags multiply.** `showAdd`, `showEdit`, `showShare` as separate Booleans is the commonest source of sheets that will not open or will not close. One optional enum per presenter.
- **Avoid `AnyView`** to make branches type-check; use `@ViewBuilder`, `Group` or a `switch`.
- **Prefer `.task` to `onAppear` plus `Task { }`:** the modifier cancels for you. An unstructured task started in a button action is not cancelled when the view goes away; keep it short or keep its handle.
- **`URLSession` reports cancellation as `URLError.cancelled`,** not `CancellationError`. Translate it in the client so views handle one case.
- **Environment is for shared services, not for everything.** A dependency used by one feature is clearer as an initialiser parameter, and makes previews simpler.
- **Mind availability.** `Tab`, `.sidebarAdaptable` and `PreviewModifier` need the 18 releases; `@Observable`, `@Bindable`, `ContentUnavailableView` and `#Preview` need 17; `NavigationStack` and detents need 16. Say which you used.
- **Limits:** the examples follow the documentation but were not compiled for this answer; build before claiming the screen works. Visual quality, motion and platform conventions still need a look on a device.
- **When not to use it:** restructuring an existing oversized view (a refactoring job), frame-rate problems (a profiling job), or adopting Liquid Glass. For UIKit-hosted screens these patterns apply only inside the SwiftUI parts.
