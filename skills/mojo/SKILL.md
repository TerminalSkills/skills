---
name: mojo
description: >-
  Mojo is a compiled programming language from Modular with Python-like
  syntax, static types, SIMD vectors and direct Python interop. Use it when the
  user asks to write or run Mojo code, install Mojo, speed up a hot Python loop,
  use SIMD or vectorize, call NumPy from Mojo, or migrate old Mojo code that
  uses let, fn or DTypePointer.
license: Apache-2.0
compatibility: "Mojo 1.2 via pip/uv wheel on Linux x86_64/aarch64 or macOS arm64; Python 3.10+ for interop"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/modular/modular
  tags: ["mojo", "modular", "python", "simd", "performance"]
---

# Mojo

## Overview

Mojo is a statically typed, compiled language with Python-like syntax. It can import and call Python modules, and lets you write the hot parts of a program with typed structs and SIMD. The language changed a lot between 0.x and 1.x: this skill is checked against Mojo 1.2.0 (PyPI, October 2026). Old tutorials will not compile. The differences that matter:

- `fn` and `let` are removed: use `def` and `var`. A `def` no longer raises implicitly; write `def f() raises:` if it calls anything that can fail (including `Python.import_module`).
- The standard library lives under the `std.` namespace: `from std.python import Python`, `from std.algorithm import vectorize`, `from std.sys import simd_width_of`. `from python import Python` fails with "unable to locate module".
- `inout` is now `mut`, `__del__` is `__deinit__`, `simdwidthof` is `simd_width_of`, `DTypePointer` is gone, and `@parameter` is being replaced by `@__parameter` (the old name still works with a warning).
- Compile-time constants use `comptime` (for example `comptime dtype = DType.float32`).
- The compiler warns when it sees deprecated names, so read the warnings: `ptr.load`/`ptr.store` became `unsafe_load`/`unsafe_store`.

## Instructions

### Install and run

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install mojo            # or: uv pip install mojo
mojo --version              # Mojo 1.2.0 (...)
mojo run hello.mojo         # build and run in one step
mojo build hello.mojo -o hello && ./hello
mojo format .               # formatter
```

Activate the environment before calling `mojo`; the wheel carries the compiler and standard library. Python interop uses the interpreter of the active environment, so `pip install numpy` there first.

### Structs, errors and collections

```mojo
struct Vec3(Copyable, Writable):
    var x: Float64
    var y: Float64
    var z: Float64

    def __init__(out self, x: Float64, y: Float64, z: Float64):
        self.x = x
        self.y = y
        self.z = z

    def __add__(self, other: Self) -> Self:
        return Self(self.x + other.x, self.y + other.y, self.z + other.z)

    def dot(self, other: Self) -> Float64:
        return self.x * other.x + self.y * other.y + self.z * other.z

    def scale(mut self, k: Float64):
        self.x *= k
        self.y *= k
        self.z *= k


def norm_sq(v: Vec3) -> Float64:
    return v.dot(v)


def parse_port(text: String) raises -> Int:
    var port = Int(text)
    if port < 1 or port > 65535:
        raise Error("port out of range: " + text)
    return port


def main() raises:
    var a = Vec3(1.0, 2.0, 3.0)
    var b = Vec3(0.5, 0.5, 0.5)
    var c = a + b
    c.scale(2.0)
    print(c.x, c.y, c.z, norm_sq(c))
    print(parse_port("8080"))
    try:
        _ = parse_port("70000")
    except e:
        print("error:", e)
    var counts = Dict[String, Int]()
    counts["mojo"] = 1
    counts["mojo"] += 1
    print(counts["mojo"])
```

Running it prints `3.0 5.0 7.0 83.0`, `8080`, `error: port out of range: 70000` and `2`. Method receivers are read-only by default; mark mutating methods with `mut self`. Copyable, Movable and Writable are traits you list on the struct.

### Calling Python

```mojo
from std.python import Python


def main() raises:
    var np = Python.import_module("numpy")
    var data = np.random.randn(1000)
    print("Mean:", np.mean(data), "Std:", np.std(data))
    var n = Int(py=np.size(data))
    print("count", n)
```

Python results are `PythonObject`s. Convert with `Int(py=obj)`, `Float64(py=obj)` or `String(obj)` before using them in typed code. Mojo can also import your own `.py` modules when the folder is on `sys.path` (`Python.add_to_path("src")`).

### SIMD and vectorize

```mojo
from std.algorithm import vectorize
from std.sys import simd_width_of

comptime dtype = DType.float32
comptime width = simd_width_of[dtype]()


def relu(mut values: List[Float32]):
    var p = values.unsafe_ptr()

    def apply[w: Int](i: Int) {mut}:
        p.unsafe_store(i, max(p.unsafe_load[width=w](i), 0))

    vectorize[width](len(values), apply)


def main():
    var xs: List[Float32] = [-2.0, 3.5, -0.5, 8.0, -1.0, 2.0, -7.0, 4.0, 1.5]
    relu(xs)
    for x in xs:
        print(x, end=" ")
    print()
    var v = SIMD[DType.float32, 4](1.0, -2.0, 3.0, -4.0)
    print(v * 2, v.reduce_add(), (v * v).reduce_add())
```

Output: `0.0 3.5 0.0 8.0 0.0 2.0 0.0 4.0 1.5` and `[2.0, -4.0, 6.0, -8.0] -2.0 30.0`. `vectorize[width](size, closure)` calls the closure with full-width chunks and then a remainder with a smaller `w`; the closure that captures a variable by mutable reference is declared `{mut}` (a plain nested `def` fails with "Could not infer capture convention"). Raw pointers and allocation APIs (`UnsafePointer`, `alloc`) are changing between releases: prefer `List`, `SIMD` values and the pointer you get from `list.unsafe_ptr()`, and read the compiler warnings.

## Examples

### Example 1: "Run a NumPy calculation from Mojo"

Request: "Compute mean and std of 1000 random numbers from Mojo."
Steps: `pip install mojo numpy` in the active venv, save the interop file as `interop.mojo`, run `mojo run interop.mojo`. Output looks like `Mean: 0.0079 Std: 1.0187` and `count 1000`.

### Example 2: "Port this old Mojo snippet"

Request: "`let x = 3`, `fn main():` and `from python import Python` do not compile."
Steps: replace `let` with `var`, `fn` with `def`, add `raises` to `main`, and change the import to `from std.python import Python`. Re-run with `mojo run` and fix each deprecation warning it prints.

## Guidelines

- Start from working Python and rewrite only the measured hot loop. Measure before and after; speedups depend on the algorithm and the data, so do not assume them.
- Do not trust code from tutorials older than 2026: confirm names against the compiler output and the Mojo docs (docs.modular.com/mojo).
- Parallel helpers and low-level pointer APIs moved in 1.x; if an import fails, look at the installed `std` package docs rather than guessing, and prefer constructs shown above.
- Install Mojo only inside a virtual environment; do not pipe an installer script into a shell.
- Mojo has a smaller library ecosystem than Python: call Python for plotting, I/O and ML frameworks.
