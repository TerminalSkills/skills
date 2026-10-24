---
name: zig
description: >-
  Zig is a systems programming language with compile-time evaluation, seamless C interop,
  no hidden control flow and no garbage collector. Use when writing, building, testing or
  cross-compiling Zig code, porting C projects, or fixing code that broke on a new Zig
  release (std.Io, Writergate, @cImport removal). Covers zig init, zig build, comptime
  generics, explicit allocators and an HTTP server on Zig 0.17.
license: Apache-2.0
compatibility: "Zig 0.17.0 (code verified on x86_64 Linux); the standard library changes between releases"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/ziglang/zig
  tags:
  - zig
  - systems
  - performance
  - c-interop
  - comptime
---

# Zig — Modern Systems Programming Language

## Overview

Zig is a systems language with explicit allocators, errors as values, compile-time code execution (`comptime`), and a build system written in Zig itself. It cross-compiles to many targets from one install and can call C code. Zig has no 1.0 yet: the standard library changes in every release, so code from older tutorials often does not compile. This skill targets **0.17.0** (2026-10-01). Check `zig version` first and read the release notes at https://ziglang.org/download/ when your version differs.

Changes that most often break old code:

- `main` can take `std.process.Init` (`init.io`, `init.gpa`, `init.arena`, `init.minimal.args`). Anything that does I/O needs an `std.Io` value.
- `std.io.getStdOut()` and the old `GenericWriter` APIs are gone. Writers are `*std.Io.Writer`, buffered, and must be flushed.
- `std.net` moved to `std.Io.net`; `std.http.Server.init` takes an `*Io.Reader` and an `*Io.Writer`.
- `std.ArrayList` is unmanaged: start from `.empty` and pass the allocator to every call.
- `@cImport` was removed in 0.17 (deprecated in 0.16).
- `std.heap.DebugAllocator` is deprecated in 0.17 in favour of a new safe allocator.

## Instructions

### Install and build

```bash
brew install zig        # macOS and Linuxbrew, currently 0.17.0
# Or download the tarball for your platform from https://ziglang.org/download/ and compare
# its hash with the shasum in https://ziglang.org/download/index.json before extracting:
sha256sum zig-x86_64-linux-0.17.0.tar.xz
# 1cbe9df9f27e6b78d14ccbca43b6703a404ef79ef1c463de901d7f088d4e2026

mkdir inventory-cli && cd inventory-cli
zig init                # build.zig, build.zig.zon, src/main.zig, src/root.zig
zig build run           # compile and run
zig build test          # run all tests
zig build -Dtarget=x86_64-windows-gnu -Doptimize=ReleaseSafe   # cross-compile, no extra toolchain
zig test src/main.zig   # test one file (zig run src/main.zig fails here: the template imports the project module)
```

Targets use `<arch>-<os>[-<abi>]`, for example `aarch64-macos` or `x86_64-linux-musl`. `-Doptimize=` takes `Debug`, `ReleaseSafe`, `ReleaseFast` or `ReleaseSmall`.

### Core language

Run with `zig run core.zig`, test with `zig test core.zig`:

```zig
const std = @import("std");
const Allocator = std.mem.Allocator;
const Io = std.Io;

const Priority = enum { low, medium, high, urgent };
const Status = enum { todo, in_progress, review, done, cancelled };

// Structs are the primary abstraction (no classes, no inheritance)
const Task = struct {
    id: u64,
    title: []const u8, // slice: pointer + length
    priority: Priority,
    status: Status = .todo,
    due_date: ?i64 = null,

    pub fn isOverdue(self: Task, now: i64) bool {
        return self.due_date != null and self.due_date.? < now;
    }

    pub fn format(self: Task, writer: *Io.Writer) Io.Writer.Error!void {
        try writer.print("[{s}] {s} ({s})\n", .{ @tagName(self.status), self.title, @tagName(self.priority) });
    }
};

// Errors are values, not exceptions
const TaskError = error{ TitleTooLong, OutOfMemory };

// The caller chooses where memory comes from
fn createTask(allocator: Allocator, id: u64, title: []const u8, priority: Priority) TaskError!*Task {
    if (title.len > 256) return error.TitleTooLong;
    const task = try allocator.create(Task);
    errdefer allocator.destroy(task);
    task.* = .{ .id = id, .title = try allocator.dupe(u8, title), .priority = priority };
    return task;
}

pub fn main(init: std.process.Init) !void {
    const allocator = init.arena.allocator(); // freed automatically at process exit
    const io = init.io;

    const task = try createTask(allocator, 1, "Implement auth", .high);

    var buf: [256]u8 = undefined;
    var stdout: Io.File.Writer = .init(.stdout(), io, &buf);
    try task.format(&stdout.interface);
    try stdout.interface.print("overdue: {}\n", .{task.isOverdue(1_800_000_000)});
    try stdout.interface.flush(); // buffered: flush before exit
}

test "title length is checked" {
    const long: [300]u8 = @splat('x');
    try std.testing.expectError(error.TitleTooLong, createTask(std.testing.allocator, 2, &long, .low));
}
```

### Comptime

Generic types are functions from types to types, and `comptime` code runs at compile time:

```zig
const std = @import("std");

// A generic container is a function that takes a type and returns a type
fn Stack(comptime T: type) type {
    return struct {
        items: std.ArrayList(T) = .empty,

        const Self = @This();

        pub fn push(self: *Self, gpa: std.mem.Allocator, item: T) !void {
            try self.items.append(gpa, item);
        }

        pub fn pop(self: *Self) ?T {
            return self.items.pop();
        }

        pub fn deinit(self: *Self, gpa: std.mem.Allocator) void {
            self.items.deinit(gpa);
        }
    };
}

// Concatenate at compile time: the result is a constant, no allocation
fn concat(comptime a: []const u8, comptime b: []const u8) *const [a.len + b.len]u8 {
    comptime {
        var result: [a.len + b.len]u8 = undefined;
        @memcpy(result[0..a.len], a);
        @memcpy(result[a.len..], b);
        const final = result;
        return &final;
    }
}

const greeting = concat("Hello, ", "Zig!");

test "stack of u32" {
    const gpa = std.testing.allocator;
    var s: Stack(u32) = .{};
    defer s.deinit(gpa);
    try s.push(gpa, 7);
    try s.push(gpa, 9);
    try std.testing.expectEqual(@as(?u32, 9), s.pop());
}

test "comptime concat" {
    try std.testing.expectEqualStrings("Hello, Zig!", greeting);
}
```

### HTTP server

```zig
const std = @import("std");
const Io = std.Io;
const net = Io.net;
const http = std.http;

pub fn main(init: std.process.Init) !void {
    const io = init.io;

    const address = try net.IpAddress.parse("127.0.0.1", 8080);
    var listener = try address.listen(io, .{ .reuse_address = true });
    defer listener.deinit(io);
    std.log.info("listening on 127.0.0.1:8080", .{});

    while (true) {
        const stream = try listener.accept(io);
        handleConnection(io, stream) catch |err| std.log.err("connection error: {t}", .{err});
    }
}

fn handleConnection(io: Io, stream: net.Stream) !void {
    defer stream.close(io);

    var recv_buf: [4096]u8 = undefined;
    var send_buf: [4096]u8 = undefined;
    var reader = stream.reader(io, &recv_buf);
    var writer = stream.writer(io, &send_buf);
    var server = http.Server.init(&reader.interface, &writer.interface);

    var request = try server.receiveHead();
    if (std.mem.eql(u8, request.head.target, "/api/health")) {
        try request.respond("{\"status\":\"ok\"}", .{
            .extra_headers = &.{.{ .name = "content-type", .value = "application/json" }},
        });
    } else {
        try request.respond("Not Found", .{ .status = .not_found });
    }
}
```

Build with `zig build-exe server.zig`. It handles one connection at a time; use threads or `std.Io.Group` for concurrency. Bind to `127.0.0.1` unless the service must be reachable from other machines.

### C interop

`@cImport` is gone. For a handful of functions, declare them with `extern "c"` and link libc (`zig run -lc cinterop.zig`, or `exe.root_module.link_libc = true` in `build.zig`):

```zig
const std = @import("std");

// Declare the C functions you need; libc is linked with -lc / link_libc
extern "c" fn strlen(s: [*:0]const u8) usize;
extern "c" fn abs(n: c_int) c_int;

pub fn main() void {
    const word: [*:0]const u8 = "interop";
    std.debug.print("strlen = {d}, abs(-42) = {d}\n", .{ strlen(word), abs(-42) });
}
```

For whole headers, use the official translate-c package from `build.zig` (`zig fetch --save git+https://codeberg.org/ziglang/translate-c#zig-0.17.x`, then `Translator.init(...)`); the 0.17 release notes show the full `build.zig` change. `zig cc` also works as a C compiler for cross-compiling C projects.

## Examples

### Example 1: Fix code that stopped compiling after an upgrade

**User request:** "My Zig 0.13 CLI fails on 0.17 with `no member named 'getStdOut' in 'io'`. Make it build."

Run `zig version`, replace `std.io.getStdOut().writer()` with a buffered `Io.File.Writer` (see Core language), change `pub fn main() !void` to `pub fn main(init: std.process.Init) !void`, pass `init.io` where I/O happens, add `.empty` and an allocator argument to every `ArrayList` call, and end with `flush()`. Re-run `zig build test` until it is green.

### Example 2: Ship binaries for Linux and Windows from a Mac

**User request:** "Build my Zig service for Linux x86_64 and Windows from my MacBook."

```bash
zig build -Dtarget=x86_64-linux-musl -Doptimize=ReleaseSafe
zig build -Dtarget=x86_64-windows-gnu -Doptimize=ReleaseSafe
ls zig-out/bin
```

The result is a static `zig-out/bin/<name>` for musl and a `<name>.exe` (plus a `.pdb` file) for Windows; no Docker or cross toolchain is needed.

## Guidelines

1. **Explicit allocators.** Functions that allocate take an `Allocator`. In tests use `std.testing.allocator`, which fails the test on leaks.
2. **Arenas for short-lived work.** `init.arena` lives for the whole process; create your own `std.heap.ArenaAllocator` per request and `deinit()` it.
3. **`defer` and `errdefer`** right after acquiring a resource, so every error path cleans up.
4. **Flush buffered writers**; output stays in the buffer otherwise.
5. **Errors are values.** Use `!T` return types and `try`; avoid `catch unreachable` unless it truly cannot fail.
6. **Pin the Zig version** (in CI and `minimum_zig_version` in `build.zig.zon`); upgrade deliberately and read the release notes.
7. **Prefer `ReleaseSafe`** for production services: it keeps bounds and overflow checks, which `ReleaseFast` removes.
