---
name: wasm
description: >-
  Compile Rust, C/C++, Go, or AssemblyScript to WebAssembly (WASM) for
  near-native performance in browsers, edge functions, and serverless
  runtimes. Use when a user asks to compile code to WASM, speed up a
  CPU-heavy browser task (image/video processing, codecs, physics, crypto),
  run WASM outside the browser with WASI, or deploy a WASM module to
  Cloudflare Workers or Fastly Compute.
license: Apache-2.0
compatibility: 'Rust toolchain, Node.js 18+, or a C/C++ toolchain depending on source language'
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags:
    - webassembly
    - performance
    - browser
    - rust
    - wasi
---

# WebAssembly (WASM)

## Overview

WebAssembly is a binary instruction format for a stack-based virtual machine, designed as a portable compile target for languages like Rust, C/C++, and Go. Browsers and WASM runtimes (Wasmtime, Wasmer) run it at near-native speed, which makes it the right tool for CPU-heavy work — image/video processing, codecs, physics, crypto, parsing — that would otherwise be slow in JavaScript. WASM is not a replacement for JavaScript or DOM manipulation; it complements JS for the computational hot path.

## Instructions

### Rust → WASM (most mature toolchain)

```bash
cargo install wasm-pack
rustup target add wasm32-unknown-unknown
```

```rust
// src/lib.rs
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn fibonacci(n: u32) -> u64 {
    let (mut a, mut b) = (0u64, 1u64);
    for _ in 0..n {
        let tmp = a + b;
        a = b;
        b = tmp;
    }
    a
}

#[wasm_bindgen]
pub fn to_grayscale(pixels: &[u8]) -> Vec<u8> {
    let mut output = Vec::with_capacity(pixels.len());
    for chunk in pixels.chunks(4) {
        let gray = (0.299 * chunk[0] as f32 + 0.587 * chunk[1] as f32 + 0.114 * chunk[2] as f32) as u8;
        output.extend_from_slice(&[gray, gray, gray, chunk[3]]);
    }
    output
}
```

```bash
wasm-pack build --target web       # for direct <script type="module"> use in a browser
wasm-pack build --target bundler   # for webpack/vite
wasm-pack build --target nodejs    # for Node.js require()
```

`wasm-pack` writes the compiled module plus a JS/TypeScript loader into `pkg/`.

### Using the module from JavaScript

```javascript
import init, { fibonacci, to_grayscale } from "./pkg/image_tools.js";

await init(); // fetches and instantiates the .wasm file

const result = fibonacci(50);

const canvas = document.querySelector("canvas");
const ctx = canvas.getContext("2d");
const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
const gray = to_grayscale(imageData.data);
ctx.putImageData(new ImageData(new Uint8ClampedArray(gray), canvas.width, canvas.height), 0, 0);
```

### AssemblyScript (TypeScript-like syntax)

```bash
npm install --save-dev assemblyscript
npx asinit .
```

```typescript
// assembly/index.ts
export function sum(values: Int32Array): i32 {
  let total: i32 = 0;
  for (let i = 0; i < values.length; i++) {
    total += unchecked(values[i]); // skip bounds check for speed
  }
  return total;
}
```

```bash
npx asc assembly/index.ts --target release --outFile build/release.wasm
```

### Running WASM outside the browser (WASI)

```bash
cargo install wasmtime-cli   # or: brew install wasmtime
wasmtime run build/release.wasm
```

Edge platforms (Cloudflare Workers, Fastly Compute) accept the same `.wasm` binary and run it at the edge with the platform's own WASI-compatible host, so no separate build is usually needed beyond what the platform's CLI (`wrangler`, `fastly`) expects.

## Examples

### Example 1: "Our in-browser image filter is too slow in JavaScript — can we speed it up?"

Write the grayscale/blur logic in Rust with `wasm-bindgen`, build it with `wasm-pack build --target web`, and call `to_grayscale()` from the canvas pipeline as shown above. Moving the per-pixel loop into WASM typically cuts a multi-megapixel filter from several hundred milliseconds in JS to under 20ms, because WASM avoids JS's dynamic typing and garbage collector in the hot loop.

### Example 2: "We want to run the same validation logic in our Cloudflare Worker and our Node backend"

Write the validation logic once in Rust, compile it with `wasm-pack build --target nodejs` for the backend and `--target web` (or a Workers-specific build via `wrangler`) for the edge. Both targets consume the same `.wasm` binary with a thin per-target JS wrapper, so the validation rules can't drift between the two environments.

## Guidelines

- Use WASM for CPU-bound computation (image/video processing, codecs, crypto, physics, parsing); it has no direct DOM access, so UI code stays in JavaScript.
- Rust has the most mature toolchain (`wasm-bindgen`, `wasm-pack`) — smallest binaries, no garbage collector. AssemblyScript is easier to pick up for JS/TS developers but produces larger, GC'd output.
- Minimize calls across the JS↔WASM boundary; batch data into a single call and process it inside WASM rather than calling back and forth per element.
- For large buffers (images, audio), write into WASM linear memory directly (`memory.buffer`) instead of copying typed arrays on every call.
- Run `wasm-opt -O3 output.wasm -o output.wasm` (from the `binaryen` package) to shrink the compiled binary, often by 10–30%.
- Use `WebAssembly.instantiateStreaming(fetch(url))` (what `wasm-pack`'s generated loader calls internally) so the browser compiles while the bytes are still downloading.
- Never pipe an install script into a shell blindly; prefer `cargo install`, `npm install`, or a package manager, and verify any downloaded installer against its published checksum first.
- Check `typeof WebAssembly === "object"` before loading a module if you need to support environments without WASM support.
