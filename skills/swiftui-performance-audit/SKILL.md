---
name: swiftui-performance-audit
description: >-
  Finds out why a SwiftUI screen is slow and what to change: classifies the symptom as a hang, a hitch or excessive updates, audits the code for the usual causes, reads Instruments evidence (the SwiftUI instrument, Time Profiler, Hangs, Hitches), proposes targeted fixes and checks them with a second measurement. Use when the user says "my list scrolls badly", "typing lags in this view", "the app freezes when I open this screen", "why does this view re-render so often", "audit this SwiftUI code for performance", or shares an Instruments trace or screenshots of one.
license: Apache-2.0
compatibility: "SwiftUI apps on Apple platforms. Measuring needs Xcode with Instruments and a physical device; the SwiftUI instrument with update causes needs Instruments 26. Code review alone works from source."
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: development
  tags: ["swiftui", "performance", "instruments", "profiling", "ios"]
---

# SwiftUI Performance Audit

## Overview

SwiftUI is slow in two ways. Either one update takes too long (a `body`, a layout pass or an image decode that does not fit in a frame), or there are too many updates (views recomputed because something they depend on changed, although nothing they show did). Both end as work on the main thread, and the person sees a frozen control or stuttering motion. An audit names which of the two is happening, on which view, caused by which dependency or call, and proves the fix with the same measurement taken before and after. Guessing from code alone is allowed as a first pass, but it must be labelled as a hypothesis until a trace confirms it.

## Instructions

### 1. Name the symptom and the conditions

Ask for, or find in the report: the exact interaction (for example "typing in the search field on Orders"), device model and OS version, build configuration, how much data is on screen, and whether it was always slow or regressed.

| What the person sees | Term | Numbers to hold on to | First tool |
|---|---|---|---|
| A tap, keystroke or screen opening responds late | Hang: the main run loop is busy | Under 100 ms is rarely noticed; Apple's tools start reporting at 250 ms | Hangs instrument with Time Profiler |
| Scrolling or animation stutters | Hitch: a frame arrived late | A frame has 16.7 ms at 60 Hz and 8.3 ms at 120 Hz. Organizer hitch rate: up to 10 ms/s good, up to 25 warning, up to 50 critical | Hitches instrument, SwiftUI instrument |
| CPU busy or battery drain while nothing seems to change | Excess updates | Count of body updates per interaction | SwiftUI instrument, Update Groups lane |
| Memory climbs while scrolling | Usually full-size images | Peak memory before and after | Allocations template |

A hitch caused by the app's main thread missing its deadline is a commit hitch; one caused by a frame that is too expensive to draw (many layers, blurs, shadows, glass) is a render hitch. They have different fixes, so note which one the Hitches instrument reports.

### 2. Audit the code for the usual causes

Read the slow view, the views it contains, and the model types it reads. Check each of these and cite the line when you find one.

| Cause | What it looks like in code | Fix |
|---|---|---|
| Work inside `body` | Sorting, filtering, grouping, string formatting, creating a `DateFormatter` or `NumberFormatter`, reading files, decoding images in `body`, in a view `init`, or in `onAppear` | Compute once in the model when inputs change; store the result; format with `formatted()` styles or a shared formatter |
| Dependencies wider than needed | An `ObservableObject` with many `@Published` properties observed by many views; a whole model passed to a row that shows two fields; frequently changing values (scroll offset, timers, geometry) placed in the environment | Adopt `@Observable` (iOS 17+), which only invalidates views whose `body` read the changed property; pass plain values to leaf views; keep fast-changing values out of the environment |
| Unstable identity | `ForEach(items, id: \.self)` on values that are not unique or are expensive to hash; ids made from array indices for data that reorders; `.id(UUID())`; `if`/`else` that swaps whole subtrees; `AnyView` | `Identifiable` with a stable id from the data; keep one view and vary its modifiers |
| Variable row count per element | An `if` inside `ForEach` content that sometimes yields no view | Filter the collection before `ForEach`, so `List` can count rows without building them |
| Eager containers | `VStack` or `HStack` in a `ScrollView` with hundreds of children | `List`, `LazyVStack`, `LazyVGrid`, after profiling shows the load cost |
| Layout feedback | `GeometryReader` around large content; `onGeometryChange` or scroll callbacks writing state every frame | Update state only when the value crosses a threshold; move the dependent view into a small sibling |
| Stored closures | A view storing an escaping `@ViewBuilder` closure that captures the parent's state | Call the builder in `init` and store the resulting view |
| Images | Photos decoded at full size for small cells; decoding on the main thread | `byPreparingThumbnail(ofSize:)` or `preparingThumbnail(of:)` off the main actor, sized in pixels |
| Expensive rendering | Blur, shadow or glass on every cell; animating a large container | Apply effects to one parent; animate with `animation(_:value:)` on the smallest view that changes |

To see why one view's `body` runs, add `let _ = Self._printChanges()` as the first line of `body` in a debug build. It prints which property changed, or that the view value itself did. The underscore means it is a debugging aid that may disappear, and Apple says never to ship a call to it. Remove it before committing.

### 3. Get a measurement

Code review produces suspects. A trace turns them into findings. Ask the user to record this (the agent cannot drive Instruments):

1. Use a physical device, not the simulator, and the Profile action (Product > Profile) so the app is built the way it ships.
2. In Instruments choose the **SwiftUI** template, press Record, perform the slow interaction three or more times, stop.
3. In the SwiftUI track read the lanes: **Update Groups** (when SwiftUI was busy), **Long View Body Updates** (orange above 500 µs, red above 1,000 µs), **Long Platform View Updates** (hosted UIKit or AppKit views), **Other Long Updates** (layout, text).
4. For a long update: set the inspection range on it and read the Time Profiler call tree for that range to find the function inside `body` that takes the time.
5. For too many updates: select an update group, open the summary of all updates to get counts per view, then **Show Causes** on a view to see the cause-and-effect graph: which state change, observable property or environment value triggered each update.
6. Send back: the update counts and durations for the top views, the heaviest frames of the call tree, and the Hitches or Hangs entries with their durations.

If the user cannot record, deliver the code audit with every item marked "unconfirmed" and say which single measurement would confirm it.

### 4. Fix the biggest cause first, one change at a time

Order findings by measured cost (duration × count), not by how easy they are. Make one change, measure again, then decide on the next. Typical moves:

- Narrow what a view reads: split a large view so the part that changes often is its own small `View` with its own inputs.
- Move derivation out of `body` into the model, recomputed when its inputs change.
- Move heavy work off the main actor and publish only the result back.
- Give lists stable identity and a constant number of rows per element.
- Use `equatable()` only when the view's inputs are cheap to compare and the trace shows the parent invalidating it needlessly.

### 5. Verify and protect

Re-record the same interaction on the same device and build configuration and put the numbers side by side. For screens that matter, suggest a UI performance test so the regression is caught next time:

```swift
import XCTest

final class OrdersScrollPerformanceTests: XCTestCase {
    func testScrollingOrders() {
        let app = XCUIApplication()
        app.launch()
        app.buttons["Orders"].tap()
        measure(metrics: [XCTOSSignpostMetric.scrollingAndDecelerationMetric]) {
            app.swipeUp(velocity: .fast)
            app.swipeDown(velocity: .fast)
        }
    }
}
```

On the 26 releases and later, `XCTHitchMetric(application: app)` can be added to the metrics array to count hitches directly.

### 6. Report

```text
SwiftUI performance audit: Orders search (iPhone 14, iOS 26.1, Release)
Symptom: typing lags, about 0.3 s per character with 4,200 orders. Class: hang.

#  Finding                                   Evidence                          Status
1  Filter and sort of all orders in body     OrdersScreen.body 38 ms/update    confirmed (trace)
2  Every row observes the whole store        26 row updates per sync tick      confirmed (trace)
3  DateFormatter created per row update      3rd heaviest frame in call tree   confirmed (trace)
4  id: \.self hashes the full Order          code only                         unconfirmed

Changes made: 1, 2, 3.   Not changed: 4 (re-measure first).
            body per keystroke   long body updates in 10 s   row updates per sync tick
Before      38 ms                214                         26
After       0.4 ms               3                           0
```

## Examples

### Example 1: search field lags on a long list

The user reports lag while typing on a screen with 4,200 orders, worse while a background sync is running. Code as found:

```swift
final class OrdersStore: ObservableObject {
    @Published var orders: [Order] = []
    @Published var query = ""
    @Published var syncProgress = 0.0          // changes about 10 times a second during sync
}

struct OrdersScreen: View {
    @StateObject private var store = OrdersStore()
    var body: some View {
        List {
            ForEach(store.orders
                .filter { store.query.isEmpty || $0.customer.localizedCaseInsensitiveContains(store.query) }
                .sorted { $0.placedAt > $1.placedAt }, id: \.self) { order in
                OrderRow(order: order, store: store)
            }
        }
        .searchable(text: $store.query)
    }
}

struct OrderRow: View {
    let order: Order
    @ObservedObject var store: OrdersStore
    var body: some View {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        return HStack { Text(order.customer); Spacer(); Text(formatter.string(from: order.placedAt)) }
    }
}
```

Audit: the whole collection is filtered and sorted in `body` on every keystroke, and also on every `syncProgress` tick because any `@Published` change invalidates every observer; each row observes the store although it only shows two fields; a formatter is built per row update. The trace confirms it (report above). Rewritten:

```swift
@Observable final class OrdersModel {
    private(set) var visible: [Order] = []
    var query = ""
    var syncProgress = 0.0
    private var all: [Order] = []              // kept sorted by placedAt when loaded

    func applyQuery() {
        let text = query
        visible = text.isEmpty ? all : all.filter { $0.customer.localizedCaseInsensitiveContains(text) }
    }
}

struct OrdersScreen: View {
    @State private var model = OrdersModel()
    var body: some View {
        @Bindable var model = model
        List(model.visible) { order in
            OrderRow(customer: order.customer, placedAt: order.placedAt)
        }
        .searchable(text: $model.query)
        .task(id: model.query) {
            do { try await Task.sleep(for: .milliseconds(250)) } catch { return }
            model.applyQuery()
        }
    }
}

struct OrderRow: View {
    let customer: String
    let placedAt: Date
    var body: some View {
        HStack { Text(customer); Spacer(); Text(placedAt.formatted(date: .abbreviated, time: .omitted)) }
    }
}
```

`OrdersScreen.body` reads `visible` and `query` but not `syncProgress`, so sync ticks no longer touch the list. Each new keystroke cancels the pending task, so filtering runs once, 250 ms after typing pauses. Rows depend on two values and are skipped when those are unchanged.

### Example 2: photo grid stutters, no trace available

The user cannot profile today and asks for a code review of a grid that hitches while scrolling 3,000 photos.

```swift
ScrollView {
    VStack {
        ForEach(photos.indices, id: \.self) { index in
            Image(uiImage: UIImage(contentsOfFile: photos[index].path)!)
                .resizable().scaledToFill()
                .frame(width: 96, height: 96).clipped()
                .id(UUID())
        }
    }
}
```

Findings, all marked unconfirmed until measured: an eager `VStack` builds 3,000 cells up front; `.id(UUID())` gives every cell a new identity on each update, so nothing is reused; index ids break when photos are inserted; a 12-megapixel image is decoded on the main thread for a 96-point cell. Suggested replacement for the cell:

```swift
struct PhotoCell: View {
    let photo: Photo                              // Identifiable, with a stable id
    @State private var thumbnail: UIImage?
    @Environment(\.displayScale) private var displayScale

    var body: some View {
        Color.gray.opacity(0.15)
            .frame(width: 96, height: 96)
            .overlay { if let thumbnail { Image(uiImage: thumbnail).resizable().scaledToFill() } }
            .clipped()
            .task(id: photo.id) {
                guard let full = UIImage(contentsOfFile: photo.path) else { return }
                let side = 96 * displayScale       // pixels; square photos assumed
                thumbnail = await full.byPreparingThumbnail(ofSize: CGSize(width: side, height: side))
            }
    }
}
```

Used inside `LazyVGrid(columns: [GridItem(.adaptive(minimum: 96))])` with `ForEach(photos)`. The measurement that would confirm the diagnosis: the Hitches instrument during a fast scroll, and peak memory in Allocations, before and after.

## Guidelines

- **Measure the build people use.** Simulator and Debug timings mislead in both directions. Apple's guidance is to profile on real devices; choose the oldest model the app supports.
- **Do not prescribe lazy stacks by reflex.** They trade layout accuracy for speed; Apple's advice is to start with regular stacks and switch when profiling shows a gain.
- **`equatable()`, `drawingGroup()` and manual caching are last resorts.** Each hides a dependency problem that is usually cheaper to fix at the source, and `drawingGroup()` cannot render views backed by platform controls.
- **`@Observable` changes update behaviour.** A view updates only for properties its `body` reads directly, so migrating can expose code that relied on over-invalidation. Migrate one model at a time and retest.
- **Do not cache with `@State` what can be derived cheaply,** and do not create objects in a view `init`: SwiftUI creates view values very often.
- **Separate what you saw from what you suspect.** Every finding in the report carries "confirmed (trace)", "confirmed (debug print)" or "unconfirmed".
- **Limits:** an agent cannot run Instruments or see frames. Without numbers from the user, the output is a ranked list of hypotheses. The cause graph in the SwiftUI instrument shows one changing property per edge, so re-record after each fix.
- **When not to use it:** slow networking, slow launch before the first frame, or data-race and actor problems are different investigations, even when the symptom appears on a SwiftUI screen.
