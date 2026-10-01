---
name: swiftui-liquid-glass
description: >-
  Applies and reviews Liquid Glass in SwiftUI apps: decides which views should get the material and which should not, uses glassEffect, GlassEffectContainer, glass button styles and morphing transitions correctly, cleans up bars and backgrounds that fight the system look, and adds fallbacks for OS versions before 26. Use when the user says "adopt Liquid Glass", "update the app for iOS 26 design", "add a glass effect to this view", "make this button glass", "review my Liquid Glass usage", "glassEffect is not morphing", or asks how to keep the app building for iOS 18 while using the new material.
license: Apache-2.0
compatibility: "SwiftUI with the Xcode 26 SDK or later. Liquid Glass APIs run on iOS, iPadOS, Mac Catalyst, macOS, tvOS and watchOS 26.0+; visionOS is not supported by glassEffect."
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: development
  tags: ["swiftui", "liquid-glass", "ios", "design-system", "glasseffect"]
---

# SwiftUI Liquid Glass

## Overview

Liquid Glass is the system material introduced with the 26 releases of Apple's platforms. It belongs to the functional layer of an interface: bars, sheets, menus and controls that float above content, blur what is behind them and react to touch. An app built with the Xcode 26 SDK gets it on every standard component without code changes, so most of the work in adopting it is removing custom backgrounds that now clash, and adding glass by hand only to the few custom controls that live in that floating layer. This skill gives the decision of where glass belongs, the exact APIs, the fallback for older systems, and a review format.

## Instructions

### 1. Establish the facts of the project

Before proposing code, find out:

- **Deployment targets.** `grep -rnE "IPHONEOS_DEPLOYMENT_TARGET|MACOSX_DEPLOYMENT_TARGET" --include=project.pbxproj .` or the `platforms:` list in `Package.swift`. Anything below 26 means every glass API needs an availability check.
- **Platforms.** `glassEffect(_:in:)` and the glass button styles exist on iOS, iPadOS, Mac Catalyst, macOS, tvOS and watchOS 26.0+. They are not available on visionOS, which has its own `glassBackgroundEffect(displayMode:)`.
- **Compatibility switch.** Search the Info.plist for `UIDesignRequiresCompatibility`. When it is `YES` the app keeps its pre-26 look and none of this shows. Apple documents the key as temporary, and it is ignored once the app is built for the 27 releases.
- **Existing customisation of bars and sheets:** `toolbarBackground`, `UINavigationBarAppearance`, custom backgrounds behind tab bars, visual-effect views inside sheets and popovers.

### 2. Decide where glass goes

| Element | What to do |
|---|---|
| Navigation bar, toolbar, tab bar, sidebar, sheet, popover, menu, alert | Nothing. The system draws them in glass. Remove custom backgrounds and appearance overrides so the material and the scroll edge effect can show. |
| A standard `Button` that should look like glass | `.buttonStyle(.glass)`; the main action gets `.buttonStyle(.glassProminent)`. Do not build it from `glassEffect`. |
| A custom floating control: playback bar, map controls, a floating action cluster, a custom segmented picker | `glassEffect(_:in:)`, grouped in a `GlassEffectContainer`. |
| A control floating over photos or video | The `.clear` variant, with a dimming layer behind it when the media is bright. |
| List rows, cards, section backgrounds, the page background, text blocks | No glass. This is the content layer: use plain fills or a standard `Material` such as `.regularMaterial`. |

Two limits from Apple's guidance apply everywhere: use glass on few custom elements, and do not stack one glass element on top of another.

### 3. Use the APIs as documented

| API | Signature and behaviour |
|---|---|
| `glassEffect(_:in:)` | `glassEffect(_ glass: Glass = .regular, in shape: some Shape = DefaultGlassEffectShape())`. Draws the material in a shape behind the view, anchored to the view's bounds including padding. Default shape is a capsule. |
| `Glass` | Variants `.regular`, `.clear`, `.identity` (no effect). Modifiers `.tint(_ color: Color?)` and `.interactive(_ isEnabled: Bool = true)`. |
| `GlassEffectContainer` | `GlassEffectContainer(spacing: CGFloat? = nil) { … }`. Renders all glass inside it together, which is cheaper, and lets shapes blend and morph. |
| `glassEffectID(_:in:)` | Gives a glass shape an identity in a `@Namespace` so it morphs when views are inserted or removed. |
| `glassEffectUnion(id:namespace:)` | Merges several views' glass into one shape while at rest. Only views with the same shape and variant merge. |
| `glassEffectTransition(_:)` | `.matchedGeometry` (default inside the container's spacing), `.materialize` (fade the material in without matching geometry), `.identity` (none). |
| Button styles | `.glass`, `.glassProminent`, `.glass(_ glass: Glass)` for a tinted or clear variant. |

Rules that decide whether it looks right:

1. **Modifier order.** Put `glassEffect` after the modifiers that set the view's appearance and size (`font`, `padding`, `frame`). Glass applied before `padding` hugs the text and leaves the padding outside the shape.
2. **One container per cluster.** Sibling glass views that are near each other go in the same `GlassEffectContainer`. Separate effects outside a container cost more to render and cannot blend.
3. **Container spacing controls blending.** Shapes start to merge when they are closer than the container's `spacing`. If the container spacing is larger than the stack spacing inside it, the shapes are fused even at rest; equal values keep them separate at rest and let them merge during animation.
4. **`interactive()` only on things people touch.** It adds the press response that system buttons have.
5. **Tint means prominence.** Tint one primary element, not all of them.
6. **Morphing needs three things:** a shared container, a `glassEffectID` on each shape, and a state change inside `withAnimation`. The ID modifiers do nothing outside view insertion, removal or animation.
7. **Clear glass needs help with legibility.** Apple's guidance is a dark dimming layer of about 35% opacity under clear glass when the content behind is bright.

### 4. Gate availability once, in one place

Write the check in a small extension so call sites stay clean and the fallback is consistent:

```swift
import SwiftUI

extension View {
    /// Liquid Glass on 26 and later, a standard material before that.
    @ViewBuilder
    func floatingSurface(cornerRadius: CGFloat = 20, interactive: Bool = false) -> some View {
        if #available(iOS 26.0, macOS 26.0, tvOS 26.0, watchOS 26.0, *) {
            glassEffect(.regular.interactive(interactive), in: .rect(cornerRadius: cornerRadius))
        } else {
            background(.regularMaterial, in: .rect(cornerRadius: cornerRadius))
        }
    }

    /// Prominent glass button on 26 and later, bordered-prominent before.
    @ViewBuilder
    func primaryActionStyle() -> some View {
        if #available(iOS 26.0, macOS 26.0, tvOS 26.0, watchOS 26.0, *) {
            buttonStyle(.glassProminent)
        } else {
            buttonStyle(.borderedProminent)
        }
    }
}
```

In a target that also builds for visionOS, wrap the glass branch in `#if !os(visionOS)`, because the `*` in the availability check would otherwise select an API that does not exist there.

### 5. Fit the surrounding navigation layer

These 26 APIs usually come up in the same change. Check availability per platform before using them.

| Need | API |
|---|---|
| Split toolbar items into separate glass groups | `ToolbarSpacer(.fixed)` between items (iOS, iPadOS, macOS) |
| Take one toolbar item out of the shared glass background | `.sharedBackgroundVisibility(.hidden)` on the `ToolbarItem` |
| Tab bar shrinks while scrolling | `.tabBarMinimizeBehavior(.onScrollDown)` on the `TabView` (iPhone only) |
| A persistent mini-player above the tab bar | `.tabViewBottomAccessory { … }` (iOS, iPadOS) |
| A search tab separated at the trailing end | `Tab(role: .search) { … }` |
| Legibility where content scrolls under a custom bar | `safeAreaBar(edge:alignment:spacing:content:)`, and `.scrollEdgeEffectStyle(.hard, for: .top)` or `.soft` |
| Hero image continues under a sidebar or inspector | `.backgroundExtensionEffect()` on the image |
| Corners that follow the container or the device | `ConcentricRectangle()` or `.rect(corners: .concentric(minimum: 12), isUniform: true)` |

### 6. Test what the system can change

Standard components adapt on their own; custom glass has to be checked. Run the screen with Reduce Transparency, Increase Contrast and Reduce Motion turned on, in light and dark appearance, and over the brightest and busiest content the screen can show. Text on glass must stay readable in all of them. Profile scrolling if a screen shows many glass shapes at once.

### 7. When reviewing, report in this form

```text
Liquid Glass review: NowPlaying feature (deployment target iOS 17.0)
File:line                    Finding                                   Fix
NowPlayingBar.swift:14       glassEffect before padding                move it after padding
NowPlayingBar.swift:14-22    two glass views, no container             wrap in GlassEffectContainer
QueueRow.swift:9             glass on list rows (content layer)        remove; plain row background
PlayerScreen.swift:31        opaque toolbarBackground hides system bar remove the override
all files                    no availability check                     use floatingSurface()
Not checked: appearance with Reduce Transparency (needs a device run)
```

## Examples

### Example 1: an expanding cluster of map controls

Request: "Add a floating button on the map that opens into locate, layers and compass buttons, with the new glass look. We still support iOS 18."

The cluster is a custom floating control, so it qualifies for glass. The whole view is 26-only and the call site chooses between it and the existing control.

```swift
enum MapAction: String, CaseIterable, Identifiable {
    case locate = "location.fill", layers = "square.3.layers.3d", compass = "safari"
    var id: String { rawValue }
    var label: String {
        switch self {
        case .locate: "Show my location"
        case .layers: "Map layers"
        case .compass: "Reset north"
        }
    }
}

@available(iOS 26.0, *)
struct MapControlCluster: View {
    let perform: (MapAction) -> Void
    @State private var isOpen = false
    @Namespace private var glassSpace

    var body: some View {
        GlassEffectContainer(spacing: 14) {
            VStack(spacing: 14) {
                if isOpen {
                    ForEach(MapAction.allCases) { action in
                        Button { perform(action) } label: {
                            Image(systemName: action.rawValue)
                                .frame(width: 48, height: 48)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(action.label)
                        .glassEffect(.regular.interactive(), in: .circle)
                        .glassEffectID(action.id, in: glassSpace)
                    }
                }
                Button {
                    withAnimation { isOpen.toggle() }
                } label: {
                    Image(systemName: isOpen ? "xmark" : "ellipsis")
                        .frame(width: 48, height: 48)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(isOpen ? "Close map controls" : "Open map controls")
                .glassEffect(.regular.tint(.accentColor).interactive(), in: .circle)
                .glassEffectID("toggle", in: glassSpace)
            }
        }
    }
}
```

Call site:

```swift
.overlay(alignment: .bottomTrailing) {
    Group {
        if #available(iOS 26.0, *) {
            MapControlCluster(perform: handle)
        } else {
            LegacyMapControls(perform: handle)   // the pre-26 control, unchanged
        }
    }
    .padding()
}
```

Result: on iOS 26 the three circles grow out of the toggle and merge back into it, because the container spacing (14) equals the stack spacing and each shape has an ID. Only the toggle is tinted. On iOS 18 the old control is shown.

### Example 2: fixing an existing bar

Before, as found in the project:

```swift
HStack(spacing: 12) {
    Text(track.title)
        .glassEffect()
        .padding()
    Button("Play", systemImage: "play.fill", action: player.toggle)
        .glassEffect()
}
.background(.ultraThinMaterial)
```

Problems: glass applied before padding; two separate effects with no container; a hand-made glass button; a material layered under glass; no availability check although the target is iOS 17.

After:

```swift
HStack(spacing: 12) {
    Text(track.title)
        .lineLimit(1)
    Spacer()
    Button("Play", systemImage: "play.fill", action: player.toggle)
        .labelStyle(.iconOnly)
        .primaryActionStyle()
}
.padding(.horizontal, 16)
.padding(.vertical, 10)
.floatingSurface(cornerRadius: 24)
```

One surface carries the bar, the button uses the system glass style, and both fall back through the helpers from step 4.

### Example 3: a caption chip over video

```swift
Label("Live", systemImage: "dot.radiowaves.left.and.right")
    .font(.caption.weight(.semibold))
    .padding(.horizontal, 12)
    .padding(.vertical, 6)
    .glassEffect(.clear)
    .background(.black.opacity(0.35), in: .capsule)
```

The clear variant keeps the video visible; the 35% black layer behind it keeps the label readable over bright frames.

## Guidelines

- **Most adoption is deletion.** Before adding any `glassEffect`, remove bar backgrounds, custom blurs in sheets and hard-coded control heights, then look at the app again.
- **Never imitate the material** with `blur`, `opacity` and gradients. It will not match the system's lighting, motion or accessibility behaviour.
- **Not on content.** Rows, cards and backgrounds in glass flatten the hierarchy that the material exists to create.
- **No glass on glass,** and no tint on every element. Both destroy contrast.
- **Version details that bite:** `GlassButtonStyle.init(_:)` and `tabViewBottomAccessory(isEnabled:content:)` need 26.1; `ToolbarSpacer` and `sharedBackgroundVisibility` do not exist on tvOS or watchOS; tab bar minimising only happens on iPhone.
- **`UIDesignRequiresCompatibility` is a delay, not a plan.** Use it to ship from the new SDK while the redesign is in progress; it stops working with the 27 SDKs.
- **Section headers:** lists and forms on 26 no longer force upper case, so write header text in title case.
- **Icons in toolbars need accessibility labels,** and items sharing one glass background should be all icons or all text.
- **Limits of this skill:** code can be checked against the documentation, but whether glass looks right over real content can only be judged by running the app on a device with different backgrounds and accessibility settings. Say so in the review.
- **When not to use it:** UIKit or AppKit screens (they use `UIGlassEffect` and `NSGlassEffectView`), visionOS windows, and app icon work, which is done in Icon Composer.
