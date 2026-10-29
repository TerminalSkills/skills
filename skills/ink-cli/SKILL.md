---
name: ink-cli
description: >-
  Ink is a library for building interactive command-line interfaces with React components, Flexbox layout and hooks, rendered into the terminal. Use it when asked to "build a CLI with React", "make a terminal UI with progress and keyboard input", "use Ink", "scaffold an Ink app", "handle keypresses in a CLI", "exit an Ink app cleanly", or "test an Ink component". Covers Ink 8 requirements (ESM, Node 22, React 19.3), render, Box and Text, useInput, useApp, non-TTY behaviour, create-ink-app and ink-testing-library.
license: Apache-2.0
compatibility: "Node.js 22+, React 19.3+, ESM project with a JSX transform"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: "ink, react, cli, terminal-ui, javascript"
  repository: https://github.com/vadimdemedes/ink
---

# Ink — React for interactive command-line apps

## Overview

Ink (npm package `ink`, current major 8) renders React components to the terminal. Every `<Box>` is a Flexbox container laid out by Yoga, `<Text>` styles text with colors and weights, and hooks such as `useInput` and `useApp` handle keyboard input and the app lifecycle. State changes re-render only the live part of the screen, so spinners, progress lists and menus are written like a small React app.

Ink 8 requirements, from its `package.json`: Node.js 22 or newer, and peer dependency `react` 19.3 or newer. The package is ESM only (`"type": "module"`), so `require('ink')` does not work.

Use Ink for interactive tools with live-updating output. For plain argument parsing and one-shot output use a CLI parser; this skill is about the interface layer.

## Instructions

### Scaffold a project

```bash
npx create-ink-app deploy-tui                 # JavaScript
npx create-ink-app --typescript deploy-tui    # TypeScript
```

This generates a starter Ink app (see the create-ink-app README for the layout). To add Ink to an existing project:

```bash
npm install ink react
```

Set `"type": "module"` in `package.json`. Ink components are JSX, so the project needs a transform: TypeScript (`"jsx": "react-jsx"`), esbuild, or Babel with `@babel/preset-react`. The scaffolder sets this up for you.

### Render an app

```jsx
import React, {useState, useEffect} from 'react'
import {render, Box, Text} from 'ink'

function Counter() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setCount(c => c + 1), 100)
    return () => clearInterval(timer)
  }, [])
  return <Text color="green">{count} tests passed</Text>
}

render(<Counter />)
```

An Ink process stays alive only while something keeps the event loop busy (a timer, a pending promise, `useInput` listening). A static tree renders once and exits.

### Layout and text

```jsx
<Box flexDirection="column" borderStyle="round" paddingX={1} width={40}>
  <Text bold>Deploy: orders-api</Text>
  <Box justifyContent="space-between">
    <Text>region</Text>
    <Text color="cyan">eu-central-1</Text>
  </Box>
  <Text dimColor>started 14:02</Text>
</Box>
```

All text must be inside `<Text>`. `Box` accepts `flexDirection`, `justifyContent`, `alignItems`, `gap`, `padding*`, `margin*`, `width`, `height`, `borderStyle` and `borderColor`. `<Spacer />` fills free space, `<Newline />` adds a line break, and `<Static items={...}>` prints finished items above the live area once and never redraws them (good for logs).

### Keyboard input

```jsx
import {useInput, useApp, useStdin} from 'ink'

function Menu({options, onSelect}) {
  const {exit} = useApp()
  const {isRawModeSupported} = useStdin()
  const [index, setIndex] = useState(0)

  useInput((input, key) => {
    if (key.upArrow) setIndex(i => Math.max(0, i - 1))
    if (key.downArrow) setIndex(i => Math.min(options.length - 1, i + 1))
    if (key.return) onSelect(options[index])
    if (input === 'q' || key.escape) exit()
  }, {isActive: isRawModeSupported})

  return options.map((o, i) => (
    <Text key={o} color={i === index ? 'green' : undefined}>{i === index ? '> ' : '  '}{o}</Text>
  ))
}
```

The handler gets the typed characters in `input` and booleans such as `leftArrow`, `return`, `escape`, `ctrl` and `meta` in `key`. Ctrl+C exits the app by default (`exitOnCtrlC` option of `render`).

If `stdin` is not a TTY (piped input, CI, an agent's shell), `useInput` throws "Raw mode is not supported on the current process.stdin". Guard with `isActive: isRawModeSupported` as above, or provide a non-interactive path.

### Exit and results

```jsx
const {exit} = useApp()
exit()                         // waitUntilExit() resolves
exit(new Error('deploy failed'))   // waitUntilExit() rejects
```

```jsx
const app = render(<Deploy services={['api', 'worker', 'web']} />)
await app.waitUntilExit()
console.log('finished')
```

Useful `render` options: `exitOnCtrlC`, `patchConsole` (on by default: `console.log` output is printed above the live UI instead of corrupting it), and `interactive` (overrides TTY detection). When output is not a terminal, Ink writes only the final frame at unmount instead of redrawing.

### Test components

```bash
npm install --save-dev ink-testing-library
```

```jsx
import React from 'react'
import {render} from 'ink-testing-library'
import {Menu} from './menu.js'

const {lastFrame, stdin} = render(<Menu options={['staging', 'production']} onSelect={() => {}} />)
console.log(lastFrame())          // "> staging\n  production"
stdin.write('\u001B[B')           // down arrow
await new Promise(resolve => setTimeout(resolve, 50))
console.log(lastFrame())          // "  staging\n> production"
```

`lastFrame()` returns the latest rendered text, `frames` holds every frame, `rerender(tree)` swaps props and `unmount()` ends the tree. Wait a few milliseconds after `stdin.write` before reading, since React renders asynchronously. A component that calls `exit()` renders an empty last frame; assert on `frames` instead. For a one-shot string, `renderToString(<Tree />)` from `ink` renders synchronously without a terminal.

## Examples

### 1. A deploy progress screen

Request: "Show each service as it finishes deploying, with a counter box."

```jsx
import React, {useState, useEffect} from 'react'
import {render, Box, Text, Static, useApp} from 'ink'

function Deploy({services}) {
  const {exit} = useApp()
  const [done, setDone] = useState([])

  useEffect(() => {
    if (done.length === services.length) { exit(); return }
    const timer = setTimeout(() => setDone(d => [...d, services[d.length]]), 400)
    return () => clearTimeout(timer)
  }, [done])

  return (
    <Box flexDirection="column">
      <Static items={done}>{name => <Text key={name} color="green">deployed {name}</Text>}</Static>
      <Box borderStyle="round" paddingX={1}>
        <Text bold>{done.length}/{services.length} services</Text>
      </Box>
    </Box>
  )
}

const app = render(<Deploy services={['api', 'worker', 'web']} />)
await app.waitUntilExit()
console.log('finished')
```

Result: three green `deployed ...` lines appear one by one above a rounded box that ends at `3/3 services`, then `finished` is printed and the process exits.

### 2. A menu that is safe in CI

Request: "Ask which environment to deploy to, but do not crash when stdin is not a terminal."

```jsx
import {render, useStdin, Text} from 'ink'

function Pick({environments}) {
  const {isRawModeSupported} = useStdin()
  if (!isRawModeSupported) {
    return <Text>Not interactive. Pass --env {environments.join('|')}.</Text>
  }
  return <Menu options={environments} onSelect={env => console.log(env)} />
}

render(<Pick environments={['staging', 'production']} />)
```

Result: in a terminal the arrow-key menu from the input section appears; with piped stdin the single hint line is shown and the program exits with no raw-mode error.

## Guidelines

- Ink 8 needs Node 22+ and React 19.3+. On older Node use an older Ink major, and check its README for that version.
- ESM only: use `import`, add `"type": "module"`, and include file extensions in relative imports under plain Node ESM.
- `console.log` is patched by default (`patchConsole: true`) so it does not overlap the live UI, but the UI is redrawn around it. For output that must stay in the scrollback, use `<Static>`.
- Keep state updates cheap: re-rendering a large tree on a fast timer causes flicker.
- Always give a non-interactive fallback (flags, plain output) for CI and for agents running the tool, because raw mode needs a real TTY.
- Do not try to drive an Ink app's keyboard interface from an agent shell; test components with `ink-testing-library` instead.
- Stop timers and listeners in effect cleanup, or the process never exits.
