---
name: rive
description: >-
  Build interactive animations with Rive — load .riv files, control state
  machines, respond to user input, and embed runtime animations in web and
  mobile apps. Use when tasks involve interactive UI animations, character
  animations with state logic, animated icons with hover/click states, or
  game-like interactions in production apps.
license: Apache-2.0
compatibility: "Browser, React, React Native, Flutter, iOS, Android"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: design
  tags: ["rive", "animation", "state-machine", "interactive", "motion"]
---

# Rive

## Overview

Rive is an interactive animation runtime. Animations, artboards, and state machines are designed in the Rive editor and exported as `.riv` files, then played back and driven at runtime by state machine inputs. The web runtime ships as separate npm packages per renderer — `@rive-app/canvas` (Canvas 2D) and `@rive-app/webgl2` (the newer WebGL2 renderer) — with matching React wrappers (`@rive-app/react-canvas`, `@rive-app/react-webgl2`). Native bindings exist for Flutter, iOS, Android, and React Native.

## Instructions

### Install

```bash
# Canvas 2D renderer (simplest, matches most existing examples)
npm install @rive-app/canvas
npm install @rive-app/react-canvas    # React wrapper, if using React

# Or the newer WebGL2 renderer, which Rive now points new projects at
npm install @rive-app/webgl2
npm install @rive-app/react-webgl2
```

Both renderers expose the same `Rive` class and React hooks (`useRive`, `useStateMachineInput`) — only the import path changes.

### Load and play a file

```typescript
// src/rive/player.ts — Load a .riv file and play it on a canvas element.
import { Rive } from "@rive-app/canvas";

export function createRivePlayer(
  canvas: HTMLCanvasElement,
  src: string,
  stateMachine: string
): Rive {
  return new Rive({
    src,
    canvas,
    stateMachines: stateMachine,
    autoplay: true,
    onLoad: () => console.log("Rive file loaded"),
  });
}
```

### Drive state machine inputs

Inputs are booleans, numbers, or triggers defined in the Rive editor and read back by name at runtime.

```typescript
// src/rive/inputs.ts
import { Rive, StateMachineInput } from "@rive-app/canvas";

export function getInputs(rive: Rive, stateMachineName: string) {
  const inputs = rive.stateMachineInputs(stateMachineName) || [];
  return Object.fromEntries(inputs.map((i) => [i.name, i]));
}

export function fireTrigger(input: StateMachineInput) {
  input.fire();
}
```

Newer `.riv` files built with Data Binding can skip named state-machine inputs entirely: pass `autoBind: true` to `new Rive(...)` (or `useRive`) and read/write the artboard's view-model properties directly instead of looking up inputs by name. Prefer this for files designed with view models in the Rive editor; fall back to `stateMachineInputs` for files that only expose classic boolean/number/trigger inputs.

## Examples

### Example 1: "Make an icon play its hover state machine on mouse enter/leave"

```tsx
// src/components/RiveAnimation.tsx
import { useRive, useStateMachineInput } from "@rive-app/react-canvas";

interface Props {
  src: string;
  stateMachine: string;
  className?: string;
}

export function RiveAnimation({ src, stateMachine, className }: Props) {
  const { rive, RiveComponent } = useRive({
    src,
    stateMachines: stateMachine,
    autoplay: true,
  });

  const hoverInput = useStateMachineInput(rive, stateMachine, "isHovered");

  return (
    <RiveComponent
      className={className}
      onMouseEnter={() => hoverInput && (hoverInput.value = true)}
      onMouseLeave={() => hoverInput && (hoverInput.value = false)}
    />
  );
}
```

Result: the canvas renders the `.riv` artboard and transitions into its "hovered" state the instant `isHovered` flips to `true`, with Rive handling the in-between frames.

### Example 2: "Build a button with hover/pressed states and a click trigger"

```tsx
// src/components/RiveButton.tsx
import { useRive, useStateMachineInput } from "@rive-app/react-canvas";

export function RiveButton({ src, onClick }: { src: string; onClick: () => void }) {
  const { rive, RiveComponent } = useRive({
    src,
    stateMachines: "button_state",
    autoplay: true,
  });

  const isHovered = useStateMachineInput(rive, "button_state", "isHovered");
  const isPressed = useStateMachineInput(rive, "button_state", "isPressed");

  return (
    <RiveComponent
      style={{ width: 200, height: 60, cursor: "pointer" }}
      onMouseEnter={() => isHovered && (isHovered.value = true)}
      onMouseLeave={() => {
        if (isHovered) isHovered.value = false;
        if (isPressed) isPressed.value = false;
      }}
      onMouseDown={() => isPressed && (isPressed.value = true)}
      onMouseUp={() => {
        if (isPressed) isPressed.value = false;
        onClick();
      }}
    />
  );
}
```

Result: the button artboard animates through idle → hover → pressed states as the pointer moves and clicks, and `onClick` fires the app-level handler on release.

### Listening to Rive events

```typescript
// src/rive/events.ts — Subscribe to Rive runtime events.
import { Rive, EventType } from "@rive-app/canvas";

export function listenToEvents(rive: Rive) {
  rive.on(EventType.Load, () => console.log("file loaded"));
  rive.on(EventType.RiveEvent, (event) => {
    const { name, properties } = event.data as any;
    console.log(`Rive event: ${name}`, properties);
  });
}
```

`EventType.StateChange` and `EventType.RiveEvent` are marked deprecated in the current runtime in favor of Data Binding listeners, but still fire; `EventType.Load`, `EventType.LoadError`, `EventType.Play`, `EventType.Pause`, and `EventType.Advance` are the actively maintained events to build on for new code.

## Guidelines

- Give the container/canvas an explicit width and height — Rive sizes the canvas from its container, and a collapsed container renders nothing.
- `StateMachineInput` and the `StateChange`/`RiveEvent` event types are deprecated in favor of Data Binding (view models bound with `autoBind: true`); keep using them for existing `.riv` files that only have classic inputs, but design new files with view models when possible.
- Always call `rive.cleanup()` (or let the React hook's unmount handler do it) when a component using a `Rive` instance unmounts — leaked instances keep rendering and consuming GPU/CPU.
- The Canvas 2D (`@rive-app/canvas`) and WebGL2 (`@rive-app/webgl2`) renderers share the same `Rive` class API, so switching renderers is usually just a package and import-path change — verify any advanced rendering features you use (blend modes, clipping) are supported by the renderer you pick.
- Keep `.riv` files out of version-control diffs you expect to read — they're binary; review animation changes in the Rive editor, not in a text diff.
