---
name: wasm
description: >-
   You are an expert in WebAssembly, the binary instruction format for
  stack-based virtual machines. You help developers compile Rust, C, C++, Go,
  and AssemblyScript to WASM for near-native performance in browsers, edge
  functions, and serverless environments — building image/video processing,
  games, crypto, AI inference, and compute-intensive tools that run 10-100x
  faster than JavaScript.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: Developer Tools
  tags:
    - webassembly
    - performance
    - browser
    - rust
    - c++
    - portable
    - edge
---

# WebAssembly (WASM) — Near-Native Performance in the Browser

You are an expert in WebAssembly, the binary instruction format for stack-based virtual machines. You help developers compile Rust, C, C++, Go, and AssemblyScript to WASM for near-native performance in browsers, edge functions, and serverless environments — building image/video processing, games, crypto, AI inference, and compute-intensive tools that run 10-100x faster than JavaScript.

## Core Capabilities

### Rust → WASM

```rust
// src/lib.rs — Rust compiled to WASM
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn fibonacci(n: u32) -> u64 {
    match n {
        0 => 0,
        1 => 1,
        _ => {
            let mut a: u64 = 0;
            let mut b: u64 = 1;
            for _ in 2..=n {
                let tmp = a + b;
                a = b;
                b = tmp;
            }
            b
        }
    }
}

#[wasm_bindgen]
pub fn process_image(pixels: &[u8], width: u32, height: u32) -> Vec<u8> {
    let mut output = Vec::with_capacity(pixels.len());
    for chunk in pixels.chunks(4) {
        let gray = (0.299 * chunk[0] as f32 + 0.587 * chunk[1] as f32 + 0.114 * chunk[2] as f32) as u8;
        output.extend_from_slice(&[gray, gray, gray, chunk[3]]);
    }
    output
}

#[wasm_bindgen]
pub struct ImageProcessor {
    width: u32,
    height: u32,
    data: Vec<u8>,
}

#[wasm_bindgen]
impl ImageProcessor {
    #[wasm_bindgen(constructor)]
    pub fn new(width: u32, height: u32) -> Self {
        Self { width, height, data: vec![0; (width * height * 4) as usize] }
    }

    pub fn blur(&mut self, radius: u32) {
        // Gaussian blur implementation — 50x faster than JS Canvas API
        let kernel_size = (radius * 2 + 1) as usize;
        // ... optimized blur using SIMD when available
    }

    pub fn data_ptr(&self) -> *const u8 { self.data.as_ptr() }
    pub fn data_len(&self) -> usize { self.data.len() }
}
```

```bash
# Build with wasm-pack
cargo install wasm-pack
wasm-pack build --target web              # For browser
wasm-pack build --target bundler          # For webpack/vite
wasm-pack build --target nodejs           # For Node.js
```

### JavaScript Integration

```typescript
// Use WASM from JavaScript
import init, { fibonacci, process_image, ImageProcessor } from "./pkg/my_wasm.js";

await init();                             // Initialize WASM module

// Simple function call
const result = fibonacci(50);             // ~0.001ms vs ~10ms in JS

// Image processing
const canvas = document.querySelector("canvas")!;
const ctx = canvas.getContext("2d")!;
const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
const processed = process_image(imageData.data, canvas.width, canvas.height);
const output = new ImageData(new Uint8ClampedArray(processed), canvas.width, canvas.height);
ctx.putImageData(output, 0, 0);

// Class instance
const processor = new ImageProcessor(1920, 1080);
processor.blur(5);

// Shared memory for zero-copy (advanced)
const memory = new WebAssembly.Memory({ initial: 256, maximum: 512, shared: true });
```

### AssemblyScript (TypeScript-like)

```typescript
// assembly/index.ts — TypeScript syntax → WASM
export function add(a: i32, b: i32): i32 {
  return a + b;
}

export function sum(arr: Int32Array): i32 {
  let total: i32 = 0;
  for (let i = 0; i < arr.length; i++) {
    total += unchecked(arr[i]);           // Skip bounds check for performance
  }
  return total;
}

// Build: npx asc assembly/index.ts --outFile build/module.wasm --optimize
```

### WASI (Server-Side WASM)

```bash
# Run WASM outside browsers with WASI
wasmtime run my_program.wasm              # Bytecode Alliance runtime
wasmer run my_program.wasm                # Wasmer runtime

# Edge computing (Cloudflare Workers, Fastly Compute)
# WASM modules run at the edge with near-native speed
```

## Installation

```bash
# Rust → WASM
cargo install wasm-pack
rustup target add wasm32-unknown-unknown

# AssemblyScript
npm install -D assemblyscript
npx asc --init

# WASM runtimes
brew install wasmtime                      # Server-side WASM
brew install wasmer                        # Alternative runtime
```

## Best Practices

1. **Use for compute** — WASM excels at CPU-intensive tasks (image processing, crypto, parsing, physics); don't use for DOM manipulation
2. **Rust is the best fit** — Rust has the most mature WASM toolchain (wasm-bindgen, wasm-pack); smallest binaries, no GC
3. **Minimize JS↔WASM calls** — Cross-boundary calls have overhead; batch data and process in WASM, return results
4. **SharedArrayBuffer** — Use shared memory for large data (images, audio); avoid copying between JS and WASM
5. **wasm-opt for size** — Run `wasm-opt -O3` on output; typically reduces binary size 10-30%
6. **Streaming compilation** — Use `WebAssembly.compileStreaming(fetch(...))` for fastest loading; compiles while downloading
7. **WASI for portability** — Target WASI for server-side WASM; runs on Cloudflare, Fastly, Wasmtime, Wasmer
8. **Feature detection** — Check `typeof WebAssembly === "object"` before loading; fall back to JS for unsupported browsers
