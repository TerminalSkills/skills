---
name: react-bits
description: >-
  Adds animated, interactive React components from the React Bits library (split-text effects, shader and aurora backgrounds, cursor effects, animated cards and micro-interactions) to a project by copying their source in through the shadcn CLI or jsrepo. Use when a user wants to "add an animated background", "make the hero text animate", "use React Bits", "add a cursor effect to my React site", or pick a component flavor (JS or TS, CSS or Tailwind) and install its dependencies.
license: Apache-2.0
compatibility: "Node.js 18+, a React 18 or 19 project (Vite, Next.js or similar) with a components.json for the shadcn CLI; Tailwind only for the TW flavors"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: design
  tags: "react-bits, react, animation, shadcn, ui-components"
  repository: https://github.com/DavidHDev/react-bits
---

# React Bits — copy-in animated React components

## Overview

React Bits is a library of 215+ free animated components, grouped as Text Animations, Animations (cursor effects, hover interactions, borders), Components (cards, navigation, galleries), Micro (buttons, toggles, small details) and Backgrounds (gradients, particles, grids, shaders). It is not an npm dependency. Each component is a registry item: the CLI copies its source file into your project, installs the few packages it needs, and from then on the code is yours to edit.

Every component exists in four flavors, selected by a suffix on its name: language `JS` or `TS`, then styling `CSS` or `TW` (Tailwind). Example: `SplitText-TS-TW`.

An agent can: choose components, install them, add the missing packages, drop them into a page, and tune their props. The visual result (timing, colors) is best checked by the user in a browser; an agent can confirm only that it compiles. React Bits Pro is a separate paid product; this skill covers the free library.

## Instructions

### Prerequisites

The project needs a `components.json` (create it once with `npx shadcn@latest init`, or write it by hand) with `aliases.components` pointing at your components folder. Register the React Bits namespace in it:

```json
{
  "registries": {
    "@react-bits": "https://reactbits.dev/r/{name}.json"
  }
}
```

If the project already uses shadcn/ui, only add the `registries` entry and leave the rest alone.

### Install a component

With the shadcn CLI (the documented default):

```bash
npx shadcn@latest add @react-bits/SplitText-TS-TW
npx shadcn@latest add @react-bits/Aurora-TS-TW @react-bits/BlurText-TS-TW   # several at once
```

With jsrepo:

```bash
npx jsrepo@latest add https://reactbits.dev/r/SplitText-TS-TW
```

On pnpm, yarn or bun replace `npx` with `pnpm dlx`, `yarn` or `bun x --bun`. Without a CLI, open the component page on reactbits.dev, pick the flavor in the Code tab and paste the file.

The CLI writes the file into the folder named by `aliases.components` in `components.json` (for example `src/components/SplitText.tsx`) and installs the packages the registry item declares. Verified examples: `SplitText` needs `gsap` and `@gsap/react`; `BlurText` needs `motion`; `Aurora`, `Magnet` and `Ballpit` declare no packages. Read the component's imports after installing, because some components use other libraries such as `three` or `ogl`; install any that are missing with the project's package manager.

You can read what an item contains before installing it:

```bash
curl -s https://reactbits.dev/r/SplitText-TS-TW.json
```

The JSON lists `dependencies`, `registryDependencies` and the file contents. The site also publishes `https://reactbits.dev/llms.txt` as an index for agents.

### Find the right component

Browse categories at `https://reactbits.dev/c/text-animations`, `/c/animations`, `/c/components`, `/c/micro` and `/c/backgrounds`. Names seen in the repository include, for text: `SplitText`, `BlurText`, `ShinyText`, `GradientText`, `CountUp`, `TextType`, `ScrambledText`, `RotatingText`; for animations: `Magnet`, `ClickSpark`, `GlareHover`, `StarBorder`, `AnimatedContent`, `FadeContent`; for backgrounds: `Aurora`, `Particles`, `Silk`, `Waves`, `Galaxy`, `Plasma`, `DotGrid`, `LiquidChrome`; for micro: `FlipCard`, `HoldButton`, `SquishSwitch`. Confirm a name exists with `curl -s -o /dev/null -w "%{http_code}" https://reactbits.dev/r/Silk-TS-TW.json` before relying on it (200 means it exists).

### Use the component

Components are default exports and take props; list them in the installed file (for `TS` flavors, an exported props type is near the top).

```tsx
import Aurora from "@/components/Aurora";
import SplitText from "@/components/SplitText";
import BlurText from "@/components/BlurText";

export function Hero() {
  return (
    <section className="relative min-h-screen overflow-hidden">
      <Aurora colorStops={["#5227FF", "#7cff67", "#5227FF"]} amplitude={1} speed={0.5} />
      <div className="relative z-10">
        <SplitText text="Ship faster" tag="h1" splitType="chars" className="text-6xl font-bold" />
        <BlurText text="Animated by React Bits" animateBy="words" delay={150} />
      </div>
    </section>
  );
}
```

Props seen on the current versions: `SplitText` takes `text`, `tag`, `splitType` (`chars`, `words`, `lines`), `delay`, `duration`, `trigger` (`view`, `load`, `hover`, `click`) and `onLetterAnimationComplete`; `BlurText` takes `text`, `animateBy`, `direction`, `delay`, `effect`; `Aurora` takes `colorStops`, `amplitude`, `speed`, `blend`, `mouseInteraction`, `paused`, `className`. Prop sets differ per component and version, so read the file you installed.

### Customize and troubleshoot

- The installed file is plain source: change defaults, colors and easing directly in it rather than wrapping it. Keep a note of what you changed, since re-running `add` would overwrite it.
- If the CLI says it cannot find `components.json`, run `npx shadcn@latest init` first, or create the file by hand as shown above.
- If an import such as `@/components/Aurora` does not resolve, the project is missing the `@/*` path alias in `tsconfig.json` and the bundler config; add it or import with a relative path.
- If a component renders nothing, check that its parent has a height (full-screen backgrounds need a positioned container with `position: relative` and a size).

### Use it through the shadcn MCP server

React Bits works with the shadcn MCP server, so an assistant can search and add components itself. With the registry entry above in `components.json`, the documented setup command is `npx shadcn@latest mcp init --client claude` (other clients are listed in the MCP guide at https://reactbits.dev/get-started/mcp). That command edits the user's assistant configuration, so run it only when the user asks.

## Examples

### Example 1: animated hero for a Vite landing page

**Request**: "Make the hero on my Vite + Tailwind landing page animate: a soft aurora background and a headline that splits in letter by letter."

```bash
npx shadcn@latest add @react-bits/Aurora-TS-TW @react-bits/SplitText-TS-TW --yes
```

The CLI reports `src/components/Aurora.tsx` and `src/components/SplitText.tsx` as created and adds `gsap` and `@gsap/react` to `package.json`. The agent then renders `<Aurora />` absolutely positioned behind the content and `<SplitText text="Ship faster" tag="h1" splitType="chars" />`, runs `npm run build`, and reports that the project compiles. A test build of exactly this combination (React 19, Vite 7, Tailwind 4) succeeded.

### Example 2: pick the plain-CSS flavor and avoid a heavy dependency

**Request**: "My project has no Tailwind. Add a text reveal that doesn't pull in GSAP."

```bash
curl -s https://reactbits.dev/r/BlurText-JS-CSS.json | head -c 600
npx shadcn@latest add @react-bits/BlurText-JS-CSS
```

The first command shows the item's `dependencies` (`motion`) before anything is installed; the agent tells the user that `motion` will be added and why, since `SplitText` would add `gsap` instead. The result is `src/components/BlurText.jsx`. (Some CSS flavors also ship a stylesheet; the CLI lists every file it creates, so import any `.css` file it reports.)

### Example 3: copy by hand when the CLI cannot run

**Request**: "We can't run shadcn in this repo. Just give me the component file."

```bash
mkdir -p src/components
curl -s https://reactbits.dev/r/Magnet-TS-TW.json | python3 -c "import json,sys; f=json.load(sys.stdin)['files'][0]; print(f['content'])" > src/components/Magnet.tsx
```

The agent checks the printed file for imports, installs any listed `dependencies`, and imports `Magnet` like any local component.

## Guidelines

- Always pick one flavor for the whole project (for example `TS-TW`) so styling and file types stay consistent.
- After installing, read the component's imports and install missing packages; do not assume the CLI installed everything for non-standard libraries.
- Animated canvas and shader backgrounds cost GPU time. Use one per page, set `paused` or unmount when off-screen where the component offers it, and respect `prefers-reduced-motion` for text and motion effects.
- Components are client-side. In Next.js App Router the installed files start with `'use client'`; import them from server components normally, but do not pass functions as props across that boundary.
- The code is copied into your repository, so later updates from React Bits do not arrive automatically. Re-run `add` and review the diff to update.
- Do not use this for rich design systems or accessible form controls; these are visual effects, and the accessible behavior of buttons and toggles should be reviewed before shipping.
